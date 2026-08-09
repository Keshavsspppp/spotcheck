const dns = require("dns");
const mongoose = require("mongoose");
const { Location, CheckEvent, Heartbeat } = require("./models");
const { generateHistoryEvents } = require("./seedHistory");
const { computeConfidence } = require("./confidence");
const { computeFillEta, TREND_WINDOW_MINUTES } = require("./trend");
const { compareToTypical } = require("./busyness");

// ponytail: some Windows/router DNS resolvers refuse SRV queries (ECONNREFUSED
// on querySrv) that mongodb+srv:// needs, even though normal lookups work.
// Forcing a public resolver sidesteps it. If this ever needs to be more
// robust (offline dev, custom DNS policies), switch to a non-SRV mongodb://
// connection string from Atlas's "Drivers" tab instead.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const STALE_MINUTES = 10;

const SEED_LOCATIONS = [
  { name: "Canteen", capacity: 80, category: "Canteen" },
  { name: "Library", capacity: 120, category: "Library" },
  { name: "Gym", capacity: 40, category: "Gym" },
  { name: "Parking Lot A", capacity: 60, category: "Parking" },
  { name: "Study Room B", capacity: 20, category: "Study Room" },
];

function toLocation(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    capacity: doc.capacity,
    currentCount: doc.currentCount,
    category: doc.category,
    confidenceScore: doc.confidenceScore,
  };
}

function trendFor(doc, counts) {
  const fillEtaMinutes = computeFillEta({
    capacity: doc.capacity,
    currentCount: doc.currentCount,
    recentIn: counts?.in || 0,
    recentOut: counts?.out || 0,
  });
  return { ...toLocation(doc), fillEtaMinutes };
}

async function attachTrend(doc) {
  const cutoff = new Date(Date.now() - TREND_WINDOW_MINUTES * 60 * 1000);
  const events = await CheckEvent.find({
    locationId: doc._id,
    timestamp: { $gte: cutoff },
    action: { $in: ["in", "out"] },
    sessionId: { $not: /^seed-/ },
  });
  const counts = { in: 0, out: 0 };
  for (const e of events) counts[e.action]++;
  return trendFor(doc, counts);
}

// Confidence is a derived/display field, not part of the count's correctness —
// update it with a targeted $set so it can never clobber a concurrent
// currentCount change the way a full doc.save() could.
async function refreshConfidence(doc) {
  const activeHeartbeats = await Heartbeat.countDocuments({ locationId: doc._id });
  const confidenceScore = computeConfidence({
    lastEventAt: doc.lastEventAt,
    currentCount: doc.currentCount,
    activeHeartbeats,
  });
  await Location.updateOne({ _id: doc._id }, { $set: { confidenceScore } });
  doc.confidenceScore = confidenceScore;
  return doc;
}

async function init() {
  await mongoose.connect(process.env.MONGODB_URI);
  const existingNames = new Set((await Location.find({}, "name")).map((d) => d.name));
  const missing = SEED_LOCATIONS.filter((loc) => !existingNames.has(loc.name));
  if (!missing.length) return;

  const inserted = await Location.insertMany(missing);
  for (const loc of inserted) {
    const events = generateHistoryEvents(loc).map((e) => ({ ...e, locationId: loc._id }));
    await CheckEvent.insertMany(events);
  }
}

async function getLocations() {
  const docs = await Location.find();
  if (!docs.length) return [];

  // One batched query for all locations' recent events instead of N+1.
  const cutoff = new Date(Date.now() - TREND_WINDOW_MINUTES * 60 * 1000);
  const events = await CheckEvent.find({
    locationId: { $in: docs.map((d) => d._id) },
    timestamp: { $gte: cutoff },
    action: { $in: ["in", "out"] },
    sessionId: { $not: /^seed-/ },
  });
  const countsByLocation = new Map();
  for (const e of events) {
    const k = e.locationId.toString();
    if (!countsByLocation.has(k)) countsByLocation.set(k, { in: 0, out: 0 });
    countsByLocation.get(k)[e.action]++;
  }

  return docs.map((doc) => trendFor(doc, countsByLocation.get(doc._id.toString())));
}

async function getLocationById(id) {
  const doc = await Location.findById(id).catch(() => null);
  return doc ? toLocation(doc) : null;
}

// Heartbeat's unique (sessionId, locationId) index is the source of truth for
// "is this session checked in here" — its presence/absence is updated
// atomically below, so two concurrent requests can't both succeed at
// checking the same session into the same location.
async function checkin(locationId, sessionId) {
  const location = await Location.findById(locationId).catch(() => null);
  if (!location) return { error: "not_found" };

  let hb;
  try {
    hb = await Heartbeat.create({ sessionId, locationId, lastPing: new Date() });
  } catch (err) {
    if (err.code === 11000) return { error: "already_checked_in" };
    throw err;
  }

  // Atomic, capacity-guarded increment: only matches (and only increments)
  // if currentCount is still below capacity at the moment MongoDB applies
  // the update, so two simultaneous check-ins can't both slip in over the
  // limit the way a separate read-then-save would allow.
  const updated = await Location.findOneAndUpdate(
    { _id: locationId, $expr: { $lt: ["$currentCount", "$capacity"] } },
    { $inc: { currentCount: 1 }, $set: { lastEventAt: new Date() } },
    { new: true }
  );

  if (!updated) {
    await Heartbeat.deleteOne({ _id: hb._id });
    return { error: "at_capacity" };
  }

  await CheckEvent.create({ locationId, sessionId, action: "in" });
  await refreshConfidence(updated);
  return { location: await attachTrend(updated) };
}

async function checkout(locationId, sessionId) {
  const deleted = await Heartbeat.findOneAndDelete({ sessionId, locationId });
  if (!deleted) return { error: "not_checked_in" };

  // Pipeline update: floors at 0 using the document's own field, atomically —
  // no read-then-clamp-then-save round trip for another request to race.
  const updated = await Location.findOneAndUpdate(
    { _id: locationId },
    [{ $set: { currentCount: { $max: [0, { $add: ["$currentCount", -1] }] }, lastEventAt: new Date() } }],
    { new: true }
  ).catch(() => null);
  if (!updated) return { error: "not_found" };

  await CheckEvent.create({ locationId, sessionId, action: "out" });
  await refreshConfidence(updated);
  return { location: await attachTrend(updated) };
}

async function heartbeat(locationId, sessionId) {
  // Refresh-only, never upsert: a ping for a session that isn't actually
  // checked in (per the Heartbeat gate above) shouldn't be able to manufacture
  // "active" coverage for a location's confidence score out of nothing.
  const hb = await Heartbeat.findOneAndUpdate({ sessionId, locationId }, { lastPing: new Date() });
  if (!hb) return { error: "not_checked_in" };

  const doc = await Location.findById(locationId).catch(() => null);
  if (doc) await refreshConfidence(doc);
  return { ok: true };
}

// The "forgot to check out" problem: a session that stops pinging (tab closed,
// phone died, walked away) would otherwise hold a phantom seat forever. Every
// tick we auto-checkout anyone whose heartbeat has gone stale for STALE_MINUTES,
// same effect as them tapping "I'm leaving" themselves.
async function runStalenessSweep() {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
  const stale = await Heartbeat.find({ lastPing: { $lt: cutoff } });
  const changedIds = new Set();

  for (const hb of stale) {
    // Atomic delete-if-present: if the user checked out themselves in the
    // instant between the find above and here, this is a no-op instead of a
    // double-decrement.
    const deleted = await Heartbeat.findOneAndDelete({ _id: hb._id });
    if (!deleted) continue;

    const updated = await Location.findOneAndUpdate(
      { _id: hb.locationId },
      [{ $set: { currentCount: { $max: [0, { $add: ["$currentCount", -1] }] }, lastEventAt: new Date() } }],
      { new: true }
    ).catch(() => null);
    if (!updated) continue;

    await CheckEvent.create({ locationId: hb.locationId, sessionId: hb.sessionId, action: "out" });
    await refreshConfidence(updated);
    changedIds.add(updated._id.toString());
  }

  const changed = [];
  const all = await Location.find();
  for (const doc of all) {
    if (changedIds.has(doc._id.toString())) {
      changed.push(await attachTrend(doc));
      continue;
    }
    const before = doc.confidenceScore;
    await refreshConfidence(doc);
    if (Math.abs(before - doc.confidenceScore) >= 3) changed.push(await attachTrend(doc));
  }

  return changed;
}

async function adminCorrect(locationId, currentCount) {
  const rounded = Math.round(currentCount);
  const updated = await Location.findOneAndUpdate(
    { _id: locationId },
    [
      {
        $set: {
          currentCount: { $max: [0, { $min: ["$capacity", rounded] }] },
          lastEventAt: new Date(),
        },
      },
    ],
    { new: true }
  ).catch(() => null);
  if (!updated) return { error: "not_found" };

  await CheckEvent.create({ locationId, sessionId: "admin", action: "correction" });
  await refreshConfidence(updated);
  return { location: await attachTrend(updated) };
}

async function getHistory(locationId, dayPart = "all") {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await CheckEvent.aggregate([
    {
      $match: {
        locationId: new mongoose.Types.ObjectId(locationId),
        action: "in",
        timestamp: { $gte: sevenDaysAgo },
      },
    },
    { $addFields: { hour: { $hour: "$timestamp" }, dow: { $dayOfWeek: "$timestamp" } } }, // dow: 1=Sun...7=Sat
    {
      $match:
        dayPart === "weekday"
          ? { dow: { $nin: [1, 7] } }
          : dayPart === "weekend"
          ? { dow: { $in: [1, 7] } }
          : {},
    },
    { $group: { _id: "$hour", count: { $sum: 1 } } },
  ]);
  const totals = new Array(24).fill(0);
  for (const row of rows) totals[row._id] = row.count;
  const days = dayPart === "weekend" ? 2 : dayPart === "weekday" ? 5 : 7;
  return totals.map((sum, hour) => ({ hour, avgCheckins: Math.round((sum / days) * 10) / 10 }));
}

async function getBusyness(locationId) {
  const doc = await Location.findById(locationId).catch(() => null);
  if (!doc) return null;

  const history = await getHistory(locationId);
  const now = new Date();
  const currentHourAvg = history[now.getUTCHours()].avgCheckins;

  const topOfHour = new Date(now);
  topOfHour.setUTCMinutes(0, 0, 0);
  const checkinsSinceTopOfHour = await CheckEvent.countDocuments({
    locationId,
    action: "in",
    sessionId: { $not: /^seed-/ },
    timestamp: { $gte: topOfHour },
  });
  const minutesElapsedInHour = (now.getTime() - topOfHour.getTime()) / 60000;

  return compareToTypical({ currentHourAvg, checkinsSinceTopOfHour, minutesElapsedInHour });
}

module.exports = {
  init,
  getLocations,
  getLocationById,
  checkin,
  checkout,
  heartbeat,
  runStalenessSweep,
  adminCorrect,
  getHistory,
  getBusyness,
};

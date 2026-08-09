const dns = require("dns");
const mongoose = require("mongoose");
const { Location, CheckEvent, Heartbeat } = require("./models");
const { generateHistoryEvents } = require("./seedHistory");
const { computeConfidence } = require("./confidence");
const { computeFillEta, TREND_WINDOW_MINUTES } = require("./trend");

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

async function attachTrend(doc) {
  const cutoff = new Date(Date.now() - TREND_WINDOW_MINUTES * 60 * 1000);
  const events = await CheckEvent.find({
    locationId: doc._id,
    timestamp: { $gte: cutoff },
    action: { $in: ["in", "out"] },
    sessionId: { $not: /^seed-/ },
  });
  let recentIn = 0;
  let recentOut = 0;
  for (const e of events) (e.action === "in" ? recentIn++ : recentOut++);

  const fillEtaMinutes = computeFillEta({
    capacity: doc.capacity,
    currentCount: doc.currentCount,
    recentIn,
    recentOut,
  });
  return { ...toLocation(doc), fillEtaMinutes };
}

async function refreshConfidence(doc) {
  const activeHeartbeats = await Heartbeat.countDocuments({ locationId: doc._id });
  doc.confidenceScore = computeConfidence({
    lastEventAt: doc.lastEventAt,
    currentCount: doc.currentCount,
    activeHeartbeats,
  });
  await doc.save();
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
  return Promise.all(docs.map(attachTrend));
}

async function getLocationById(id) {
  const doc = await Location.findById(id).catch(() => null);
  return doc ? toLocation(doc) : null;
}

async function isCheckedIn(locationId, sessionId) {
  const last = await CheckEvent.findOne({ locationId, sessionId }).sort({ timestamp: -1 });
  return !!last && last.action === "in";
}

async function checkin(locationId, sessionId) {
  const doc = await Location.findById(locationId).catch(() => null);
  if (!doc) return { error: "not_found" };
  if (await isCheckedIn(locationId, sessionId)) return { error: "already_checked_in" };

  doc.currentCount += 1;
  doc.lastEventAt = new Date();
  await doc.save();
  await CheckEvent.create({ locationId, sessionId, action: "in" });
  await Heartbeat.findOneAndUpdate(
    { sessionId, locationId },
    { lastPing: new Date() },
    { upsert: true }
  );
  await refreshConfidence(doc);
  return { location: await attachTrend(doc) };
}

async function checkout(locationId, sessionId) {
  const doc = await Location.findById(locationId).catch(() => null);
  if (!doc) return { error: "not_found" };
  if (!(await isCheckedIn(locationId, sessionId))) return { error: "not_checked_in" };

  doc.currentCount = Math.max(0, doc.currentCount - 1);
  doc.lastEventAt = new Date();
  await doc.save();
  await CheckEvent.create({ locationId, sessionId, action: "out" });
  await Heartbeat.deleteOne({ sessionId, locationId });
  await refreshConfidence(doc);
  return { location: await attachTrend(doc) };
}

async function heartbeat(locationId, sessionId) {
  const doc = await Location.findById(locationId).catch(() => null);
  if (!doc) return { error: "not_found" };
  await Heartbeat.findOneAndUpdate(
    { sessionId, locationId },
    { lastPing: new Date() },
    { upsert: true }
  );
  await refreshConfidence(doc);
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
    if (!(await isCheckedIn(hb.locationId, hb.sessionId))) {
      await Heartbeat.deleteOne({ _id: hb._id });
      continue;
    }
    const doc = await Location.findById(hb.locationId).catch(() => null);
    if (!doc) {
      await Heartbeat.deleteOne({ _id: hb._id });
      continue;
    }
    doc.currentCount = Math.max(0, doc.currentCount - 1);
    doc.lastEventAt = new Date();
    await doc.save();
    await CheckEvent.create({ locationId: doc._id, sessionId: hb.sessionId, action: "out" });
    await Heartbeat.deleteOne({ _id: hb._id });
    await refreshConfidence(doc);
    changedIds.add(doc._id.toString());
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
  const doc = await Location.findById(locationId).catch(() => null);
  if (!doc) return { error: "not_found" };
  doc.currentCount = Math.max(0, Math.min(doc.capacity, Math.round(currentCount)));
  doc.lastEventAt = new Date();
  await doc.save();
  await CheckEvent.create({ locationId, sessionId: "admin", action: "correction" });
  await refreshConfidence(doc);
  return { location: await attachTrend(doc) };
}

async function getHistory(locationId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await CheckEvent.aggregate([
    {
      $match: {
        locationId: new mongoose.Types.ObjectId(locationId),
        action: "in",
        timestamp: { $gte: sevenDaysAgo },
      },
    },
    { $group: { _id: { $hour: "$timestamp" }, count: { $sum: 1 } } },
  ]);
  const totals = new Array(24).fill(0);
  for (const row of rows) totals[row._id] = row.count;
  return totals.map((sum, hour) => ({ hour, avgCheckins: Math.round((sum / 7) * 10) / 10 }));
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
};

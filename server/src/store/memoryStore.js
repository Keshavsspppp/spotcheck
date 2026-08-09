const crypto = require("crypto");
const { generateHistoryEvents } = require("./seedHistory");
const { computeConfidence } = require("./confidence");
const { computeFillEta, TREND_WINDOW_MINUTES } = require("./trend");
const { compareToTypical } = require("./busyness");

function isWeekend(date) {
  const day = date.getUTCDay(); // 0=Sun ... 6=Sat
  return day === 0 || day === 6;
}

const STALE_MINUTES = 10;
const RETENTION_MS = 8 * 24 * 60 * 60 * 1000; // history only ever looks back 7 days

const SEED_LOCATIONS = [
  { name: "Canteen", capacity: 80, category: "Canteen" },
  { name: "Library", capacity: 120, category: "Library" },
  { name: "Gym", capacity: 40, category: "Gym" },
  { name: "Parking Lot A", capacity: 60, category: "Parking" },
  { name: "Study Room B", capacity: 20, category: "Study Room" },
];

let locations = [];
let checkEvents = [];
// A heartbeat's presence IS "checked in" — the single source of truth, so
// checkin/checkout/heartbeat can never disagree about a session's state.
const heartbeats = new Map(); // `${sessionId}::${locationId}` -> { sessionId, locationId, lastPing }

function key(sessionId, locationId) {
  return `${sessionId}::${locationId}`;
}

function activeHeartbeatCount(locationId) {
  let n = 0;
  for (const hb of heartbeats.values()) if (hb.locationId === locationId) n++;
  return n;
}

function refreshConfidence(location) {
  location.confidenceScore = computeConfidence({
    lastEventAt: location.lastEventAt,
    currentCount: location.currentCount,
    activeHeartbeats: activeHeartbeatCount(location.id),
  });
}

async function init() {
  if (locations.length) return;
  locations = SEED_LOCATIONS.map((loc) => ({
    id: crypto.randomUUID(),
    currentCount: 0,
    confidenceScore: 100,
    lastEventAt: new Date(),
    ...loc,
  }));
  for (const loc of locations) {
    const events = generateHistoryEvents({ ...loc, _id: loc.id });
    checkEvents.push(...events.map((e) => ({ ...e, locationId: loc.id })));
  }
}

async function getLocations() {
  return locations.map(attachTrend);
}

function attachTrend(location) {
  const cutoff = Date.now() - TREND_WINDOW_MINUTES * 60 * 1000;
  let recentIn = 0;
  let recentOut = 0;
  for (const e of checkEvents) {
    if (e.locationId !== location.id) continue;
    if (e.sessionId.startsWith("seed-")) continue; // seeded history isn't a live trend signal
    if (e.timestamp.getTime() < cutoff) continue;
    if (e.action === "in") recentIn++;
    else if (e.action === "out") recentOut++;
  }
  const fillEtaMinutes = computeFillEta({
    capacity: location.capacity,
    currentCount: location.currentCount,
    recentIn,
    recentOut,
  });
  return { ...location, fillEtaMinutes };
}

async function getLocationById(id) {
  return locations.find((l) => l.id === id) || null;
}

async function checkin(locationId, sessionId) {
  const location = await getLocationById(locationId);
  if (!location) return { error: "not_found" };
  const k = key(sessionId, locationId);
  if (heartbeats.has(k)) return { error: "already_checked_in" };
  if (location.currentCount >= location.capacity) return { error: "at_capacity" };

  heartbeats.set(k, { sessionId, locationId, lastPing: new Date() });
  location.currentCount += 1;
  location.lastEventAt = new Date();
  checkEvents.push({ locationId, sessionId, action: "in", timestamp: new Date() });
  refreshConfidence(location);
  return { location: attachTrend(location) };
}

async function checkout(locationId, sessionId) {
  const location = await getLocationById(locationId);
  if (!location) return { error: "not_found" };
  const k = key(sessionId, locationId);
  if (!heartbeats.has(k)) return { error: "not_checked_in" };

  heartbeats.delete(k);
  location.currentCount = Math.max(0, location.currentCount - 1);
  location.lastEventAt = new Date();
  checkEvents.push({ locationId, sessionId, action: "out", timestamp: new Date() });
  refreshConfidence(location);
  return { location: attachTrend(location) };
}

async function heartbeat(locationId, sessionId) {
  const location = await getLocationById(locationId);
  if (!location) return { error: "not_found" };
  const k = key(sessionId, locationId);
  const existing = heartbeats.get(k);
  if (!existing) return { error: "not_checked_in" };
  existing.lastPing = new Date();
  refreshConfidence(location);
  return { ok: true };
}

// The "forgot to check out" problem: a session that stops pinging (tab closed,
// phone died, walked away) would otherwise hold a phantom seat forever. Every
// tick we auto-checkout anyone whose heartbeat has gone stale for STALE_MINUTES,
// same effect as them tapping "I'm leaving" themselves.
async function runStalenessSweep() {
  const cutoff = Date.now() - STALE_MINUTES * 60 * 1000;
  const changed = [];

  for (const [hbKey, hb] of heartbeats) {
    if (hb.lastPing.getTime() >= cutoff) continue;
    heartbeats.delete(hbKey);
    const location = await getLocationById(hb.locationId);
    if (!location) continue;
    location.currentCount = Math.max(0, location.currentCount - 1);
    location.lastEventAt = new Date();
    checkEvents.push({ locationId: location.id, sessionId: hb.sessionId, action: "out", timestamp: new Date() });
    refreshConfidence(location);
    changed.push(location);
  }

  for (const location of locations) {
    if (changed.includes(location)) continue;
    const before = location.confidenceScore;
    refreshConfidence(location);
    if (Math.abs(before - location.confidenceScore) >= 3) changed.push(location);
  }

  const pruneCutoff = Date.now() - RETENTION_MS;
  checkEvents = checkEvents.filter((e) => e.timestamp.getTime() >= pruneCutoff);

  return changed.map(attachTrend);
}

async function adminCorrect(locationId, currentCount) {
  const location = await getLocationById(locationId);
  if (!location) return { error: "not_found" };
  location.currentCount = Math.max(0, Math.min(location.capacity, Math.round(currentCount)));
  location.lastEventAt = new Date();
  checkEvents.push({ locationId, sessionId: "admin", action: "correction", timestamp: new Date() });
  refreshConfidence(location);
  return { location: attachTrend(location) };
}

async function getHistory(locationId, dayPart = "all") {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const relevant = checkEvents.filter((e) => {
    if (e.locationId !== locationId || e.action !== "in") return false;
    if (e.timestamp.getTime() < sevenDaysAgo) return false;
    if (dayPart === "weekday" && isWeekend(e.timestamp)) return false;
    if (dayPart === "weekend" && !isWeekend(e.timestamp)) return false;
    return true;
  });
  const totals = new Array(24).fill(0);
  for (const e of relevant) totals[e.timestamp.getUTCHours()] += 1;
  const days = dayPart === "weekend" ? 2 : dayPart === "weekday" ? 5 : 7;
  return totals.map((sum, hour) => ({ hour, avgCheckins: Math.round((sum / days) * 10) / 10 }));
}

async function getBusyness(locationId) {
  const location = await getLocationById(locationId);
  if (!location) return null;

  const history = await getHistory(locationId);
  const now = new Date();
  const currentHourAvg = history[now.getUTCHours()].avgCheckins;

  const topOfHour = new Date(now);
  topOfHour.setUTCMinutes(0, 0, 0);
  const checkinsSinceTopOfHour = checkEvents.filter(
    (e) =>
      e.locationId === locationId &&
      e.action === "in" &&
      !e.sessionId.startsWith("seed-") &&
      e.timestamp.getTime() >= topOfHour.getTime()
  ).length;
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

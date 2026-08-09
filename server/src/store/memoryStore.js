const crypto = require("crypto");
const { generateHistoryEvents } = require("./seedHistory");
const { computeConfidence } = require("./confidence");
const { computeFillEta, TREND_WINDOW_MINUTES } = require("./trend");

const STALE_MINUTES = 10;

const SEED_LOCATIONS = [
  { name: "Canteen", capacity: 80, category: "Canteen" },
  { name: "Library", capacity: 120, category: "Library" },
  { name: "Gym", capacity: 40, category: "Gym" },
  { name: "Parking Lot A", capacity: 60, category: "Parking" },
  { name: "Study Room B", capacity: 20, category: "Study Room" },
];

let locations = [];
let checkEvents = [];
const activeSessions = new Set(); // `${sessionId}::${locationId}`
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
  if (activeSessions.has(key(sessionId, locationId))) {
    return { error: "already_checked_in" };
  }
  activeSessions.add(key(sessionId, locationId));
  location.currentCount += 1;
  location.lastEventAt = new Date();
  heartbeats.set(key(sessionId, locationId), { sessionId, locationId, lastPing: new Date() });
  checkEvents.push({ locationId, sessionId, action: "in", timestamp: new Date() });
  refreshConfidence(location);
  return { location: attachTrend(location) };
}

async function checkout(locationId, sessionId) {
  const location = await getLocationById(locationId);
  if (!location) return { error: "not_found" };
  if (!activeSessions.has(key(sessionId, locationId))) {
    return { error: "not_checked_in" };
  }
  activeSessions.delete(key(sessionId, locationId));
  heartbeats.delete(key(sessionId, locationId));
  location.currentCount = Math.max(0, location.currentCount - 1);
  location.lastEventAt = new Date();
  checkEvents.push({ locationId, sessionId, action: "out", timestamp: new Date() });
  refreshConfidence(location);
  return { location: attachTrend(location) };
}

async function heartbeat(locationId, sessionId) {
  const location = await getLocationById(locationId);
  if (!location) return { error: "not_found" };
  heartbeats.set(key(sessionId, locationId), { sessionId, locationId, lastPing: new Date() });
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
    if (!activeSessions.has(hbKey)) {
      heartbeats.delete(hbKey);
      continue;
    }
    const location = await getLocationById(hb.locationId);
    if (!location) {
      heartbeats.delete(hbKey);
      activeSessions.delete(hbKey);
      continue;
    }
    activeSessions.delete(hbKey);
    heartbeats.delete(hbKey);
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

async function getHistory(locationId) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const relevant = checkEvents.filter(
    (e) => e.locationId === locationId && e.action === "in" && e.timestamp.getTime() >= sevenDaysAgo
  );
  const totals = new Array(24).fill(0);
  for (const e of relevant) totals[e.timestamp.getUTCHours()] += 1;
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

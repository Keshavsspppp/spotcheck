// Confidence = trust in the displayed count, not the count itself.
// Two independent signals, averaged:
//  - recency: how long since the count last actually changed (fresher = better)
//  - coverage: how many of the people we think are there are still pinging us
const RECENT_MINUTES = 5;
const DECAY_PER_MINUTE = 1.5;
const FLOOR = 20;
const HIGH_CONFIDENCE_THRESHOLD = 70;

function computeConfidence({ lastEventAt, currentCount, activeHeartbeats }) {
  const minutesSince = lastEventAt ? (Date.now() - new Date(lastEventAt).getTime()) / 60000 : Infinity;
  const recencyScore = Math.max(FLOOR, Math.min(100, 100 - Math.max(0, minutesSince - RECENT_MINUTES) * DECAY_PER_MINUTE));
  const heartbeatScore = currentCount === 0 ? 100 : Math.max(0, Math.min(100, (activeHeartbeats / currentCount) * 100));
  return Math.round((recencyScore + heartbeatScore) / 2);
}

function confidenceLabel(score) {
  return score >= HIGH_CONFIDENCE_THRESHOLD ? "High confidence" : "Data may be stale";
}

module.exports = { computeConfidence, confidenceLabel, HIGH_CONFIDENCE_THRESHOLD };

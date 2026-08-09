const TREND_WINDOW_MINUTES = 15;
const MIN_NET_EVENTS = 2; // don't extrapolate from a single stray check-in
const MAX_ETA_MINUTES = 90; // beyond this it's not "filling fast", it's noise

// Net rate of real (non-seeded) check-ins over the trailing window, projected
// forward. Only meaningful while the location is actively filling, with
// enough signal to trust, and soon enough to actually be "filling fast".
function computeFillEta({ capacity, currentCount, recentIn, recentOut, windowMinutes = TREND_WINDOW_MINUTES }) {
  if (currentCount >= capacity) return null;
  const net = recentIn - recentOut;
  if (net < MIN_NET_EVENTS) return null;
  const netPerMinute = net / windowMinutes;
  const minutes = Math.round((capacity - currentCount) / netPerMinute);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_ETA_MINUTES) return null;
  return minutes;
}

module.exports = { computeFillEta, TREND_WINDOW_MINUTES };

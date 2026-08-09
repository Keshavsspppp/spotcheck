const BUSIER_RATIO = 1.3;
const QUIETER_RATIO = 0.5;
const MIN_EXPECTED = 1; // don't compare against a near-zero baseline, too noisy

// Compares real check-ins so far this hour against the historical average for
// this same hour, prorated for how much of the hour has actually elapsed —
// comparing a partial hour's count directly to a full hour's average would
// always look artificially "quiet" early in the hour.
function compareToTypical({ currentHourAvg, checkinsSinceTopOfHour, minutesElapsedInHour }) {
  const expectedSoFar = currentHourAvg * (minutesElapsedInHour / 60);
  if (expectedSoFar < MIN_EXPECTED) return null;

  const ratio = checkinsSinceTopOfHour / expectedSoFar;
  if (ratio >= BUSIER_RATIO) return { trend: "busier", percent: Math.round((ratio - 1) * 100) };
  if (ratio <= QUIETER_RATIO) return { trend: "quieter", percent: Math.round((1 - ratio) * 100) };
  return null;
}

module.exports = { compareToTypical };

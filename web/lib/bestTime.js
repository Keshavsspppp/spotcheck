import { formatHour } from "./formatHour";

// Quietest contiguous 2-hour window from the hourly history data.
export function bestTimeToGo(history) {
  if (!history || history.length !== 24) return null;
  let bestStart = 0;
  let bestSum = Infinity;
  for (let h = 0; h < 24; h++) {
    const sum = history[h].avgCheckins + history[(h + 1) % 24].avgCheckins;
    if (sum < bestSum) {
      bestSum = sum;
      bestStart = h;
    }
  }
  return `${formatHour(bestStart)}–${formatHour((bestStart + 2) % 24)}`;
}

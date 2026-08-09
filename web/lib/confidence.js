export function confidenceLabel(score) {
  return score >= 70 ? "High confidence" : "Data may be stale";
}

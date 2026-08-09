const test = require("node:test");
const assert = require("node:assert/strict");
const { computeConfidence, confidenceLabel } = require("../src/store/confidence");

test("a fresh event with full heartbeat coverage scores 100", () => {
  const score = computeConfidence({ lastEventAt: new Date(), currentCount: 3, activeHeartbeats: 3 });
  assert.equal(score, 100);
});

test("an empty location is always fully covered regardless of heartbeats", () => {
  const score = computeConfidence({ lastEventAt: new Date(), currentCount: 0, activeHeartbeats: 0 });
  assert.equal(score, 100);
});

test("a count with no active heartbeats scores lower than one with full coverage", () => {
  const covered = computeConfidence({ lastEventAt: new Date(), currentCount: 4, activeHeartbeats: 4 });
  const uncovered = computeConfidence({ lastEventAt: new Date(), currentCount: 4, activeHeartbeats: 0 });
  assert.ok(uncovered < covered);
});

test("an old event decays toward the floor regardless of heartbeat coverage", () => {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const score = computeConfidence({ lastEventAt: hourAgo, currentCount: 2, activeHeartbeats: 2 });
  assert.ok(score < 70);
});

test("confidenceLabel matches the documented 70-point threshold", () => {
  assert.equal(confidenceLabel(70), "High confidence");
  assert.equal(confidenceLabel(69), "Data may be stale");
});

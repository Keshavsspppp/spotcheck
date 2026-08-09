const test = require("node:test");
const assert = require("node:assert/strict");
const { computeFillEta } = require("../src/store/trend");

test("returns null once a location is already at or over capacity", () => {
  const eta = computeFillEta({ capacity: 20, currentCount: 20, recentIn: 5, recentOut: 0 });
  assert.equal(eta, null);
});

test("returns null when there isn't enough net signal to trust", () => {
  const eta = computeFillEta({ capacity: 20, currentCount: 5, recentIn: 1, recentOut: 0 });
  assert.equal(eta, null);
});

test("returns null when the location is emptying, not filling", () => {
  const eta = computeFillEta({ capacity: 20, currentCount: 5, recentIn: 1, recentOut: 3 });
  assert.equal(eta, null);
});

test("returns a plausible ETA for a genuine filling trend", () => {
  // net 4 check-ins over 15 min, 16 seats left -> 60 min
  const eta = computeFillEta({ capacity: 20, currentCount: 4, recentIn: 4, recentOut: 0 });
  assert.equal(eta, 60);
});

test("caps out and returns null once the projection is too far out to be 'fast'", () => {
  // net 2 over 15 min is just above the signal floor but implies a slow multi-hour fill
  const eta = computeFillEta({ capacity: 100, currentCount: 5, recentIn: 2, recentOut: 0 });
  assert.equal(eta, null);
});

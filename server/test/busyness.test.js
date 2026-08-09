const test = require("node:test");
const assert = require("node:assert/strict");
const { compareToTypical } = require("../src/store/busyness");

test("returns null when the historical baseline is too small to compare against", () => {
  const result = compareToTypical({ currentHourAvg: 0.5, checkinsSinceTopOfHour: 5, minutesElapsedInHour: 30 });
  assert.equal(result, null);
});

test("flags busier when check-ins are running well above the prorated expectation", () => {
  // 30 min into the hour, expect half of a 10/hr average (5), got 10 -> 2x
  const result = compareToTypical({ currentHourAvg: 10, checkinsSinceTopOfHour: 10, minutesElapsedInHour: 30 });
  assert.equal(result.trend, "busier");
  assert.ok(result.percent > 0);
});

test("flags quieter when check-ins are running well below the prorated expectation", () => {
  const result = compareToTypical({ currentHourAvg: 10, checkinsSinceTopOfHour: 1, minutesElapsedInHour: 30 });
  assert.equal(result.trend, "quieter");
});

test("returns null for activity that's within normal range", () => {
  const result = compareToTypical({ currentHourAvg: 10, checkinsSinceTopOfHour: 5, minutesElapsedInHour: 30 });
  assert.equal(result, null);
});

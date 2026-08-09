import test from "node:test";
import assert from "node:assert/strict";
import { bestTimeToGo } from "../lib/bestTime.js";
import { formatHour } from "../lib/formatHour.js";

test("formatHour formats midnight, noon, and pm hours correctly", () => {
  assert.equal(formatHour(0), "12am");
  assert.equal(formatHour(12), "12pm");
  assert.equal(formatHour(13), "1pm");
  assert.equal(formatHour(23), "11pm");
});

test("bestTimeToGo finds the quietest contiguous 2-hour window", () => {
  const history = Array.from({ length: 24 }, (_, hour) => ({ hour, avgCheckins: 10 }));
  history[3] = { hour: 3, avgCheckins: 0 };
  history[4] = { hour: 4, avgCheckins: 0 };
  assert.equal(bestTimeToGo(history), "3am–5am");
});

test("bestTimeToGo wraps across midnight", () => {
  const history = Array.from({ length: 24 }, (_, hour) => ({ hour, avgCheckins: 10 }));
  history[23] = { hour: 23, avgCheckins: 0 };
  history[0] = { hour: 0, avgCheckins: 0 };
  assert.equal(bestTimeToGo(history), "11pm–1am");
});

test("bestTimeToGo returns null for malformed input", () => {
  assert.equal(bestTimeToGo([]), null);
  assert.equal(bestTimeToGo(null), null);
});

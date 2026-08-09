const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/store/memoryStore");

test("memoryStore", async (t) => {
  await store.init();
  const seeded = await store.getLocations();
  const target = seeded.find((l) => l.name === "Study Room B"); // capacity 20, cheap to fill

  await t.test("seeds all 5 configured locations", () => {
    assert.equal(seeded.length, 5);
  });

  await t.test("checkin increments the count and blocks a duplicate from the same session", async () => {
    const first = await store.checkin(target.id, "test-a");
    assert.equal(first.location.currentCount, target.currentCount + 1);

    const duplicate = await store.checkin(target.id, "test-a");
    assert.equal(duplicate.error, "already_checked_in");
  });

  await t.test("checkout decrements the count and blocks a duplicate from the same session", async () => {
    const out = await store.checkout(target.id, "test-a");
    assert.equal(out.location.currentCount, target.currentCount);

    const duplicate = await store.checkout(target.id, "test-a");
    assert.equal(duplicate.error, "not_checked_in");
  });

  await t.test("heartbeat is rejected for a session that was never checked in", async () => {
    const result = await store.heartbeat(target.id, "never-checked-in");
    assert.equal(result.error, "not_checked_in");
  });

  await t.test("checkin is rejected once a location is at capacity, never exceeding it", async () => {
    const sessions = Array.from({ length: target.capacity }, (_, i) => `capacity-${i}`);
    for (const sid of sessions) {
      const result = await store.checkin(target.id, sid);
      assert.equal(result.error, undefined);
    }

    const overflow = await store.checkin(target.id, "capacity-overflow");
    assert.equal(overflow.error, "at_capacity");

    const [updated] = (await store.getLocations()).filter((l) => l.id === target.id);
    assert.equal(updated.currentCount, target.capacity);

    for (const sid of sessions) await store.checkout(target.id, sid);
  });

  await t.test("adminCorrect clamps to [0, capacity] regardless of the requested value", async () => {
    const over = await store.adminCorrect(target.id, target.capacity + 50);
    assert.equal(over.location.currentCount, target.capacity);

    const under = await store.adminCorrect(target.id, -5);
    assert.equal(under.location.currentCount, 0);
  });

  await t.test("getHistory returns 24 hourly buckets", async () => {
    const history = await store.getHistory(target.id);
    assert.equal(history.length, 24);
  });
});

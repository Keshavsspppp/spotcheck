const express = require("express");
const store = require("./store");

function requireAdminToken(req, res, next) {
  const token = req.header("x-admin-token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function createRouter(io) {
  const router = express.Router();

  router.get("/locations", async (req, res) => {
    res.json(await store.getLocations());
  });

  router.post("/checkin", async (req, res) => {
    const { locationId, sessionId } = req.body;
    if (!locationId || !sessionId) {
      return res.status(400).json({ error: "locationId and sessionId are required" });
    }
    const result = await store.checkin(locationId, sessionId);
    if (result.error) return res.status(409).json({ error: result.error });
    io.emit("location:update", result.location);
    res.json(result.location);
  });

  router.post("/checkout", async (req, res) => {
    const { locationId, sessionId } = req.body;
    if (!locationId || !sessionId) {
      return res.status(400).json({ error: "locationId and sessionId are required" });
    }
    const result = await store.checkout(locationId, sessionId);
    if (result.error) return res.status(409).json({ error: result.error });
    io.emit("location:update", result.location);
    res.json(result.location);
  });

  router.post("/heartbeat", async (req, res) => {
    const { locationId, sessionId } = req.body;
    if (!locationId || !sessionId) {
      return res.status(400).json({ error: "locationId and sessionId are required" });
    }
    const result = await store.heartbeat(locationId, sessionId);
    if (result.error) return res.status(409).json({ error: result.error });
    res.json(result);
  });

  router.get("/locations/:id/history", async (req, res) => {
    const dayPart = ["weekday", "weekend"].includes(req.query.dayPart) ? req.query.dayPart : "all";
    res.json(await store.getHistory(req.params.id, dayPart));
  });

  router.get("/locations/:id/busyness", async (req, res) => {
    res.json(await store.getBusyness(req.params.id));
  });

  router.get("/admin/verify", requireAdminToken, (req, res) => res.json({ ok: true }));

  router.post("/admin/correction", requireAdminToken, async (req, res) => {
    const { locationId, currentCount } = req.body;
    if (!locationId || typeof currentCount !== "number") {
      return res.status(400).json({ error: "locationId and currentCount are required" });
    }
    const result = await store.adminCorrect(locationId, currentCount);
    if (result.error) return res.status(409).json({ error: result.error });
    io.emit("location:update", result.location);
    res.json(result.location);
  });

  return router;
}

module.exports = createRouter;

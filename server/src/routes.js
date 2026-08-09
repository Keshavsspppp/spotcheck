const express = require("express");
const store = require("./store");

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
    res.json(await store.getHistory(req.params.id));
  });

  // Unprotected by design for hackathon scope — put this behind real auth
  // (and an audit trail beyond the "correction" CheckEvent) before production.
  router.post("/admin/correction", async (req, res) => {
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

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const createRouter = require("./routes");
const store = require("./store");

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";
const SWEEP_INTERVAL_MS = 90 * 1000; // 90s, within the spec's 1-2 min window

async function main() {
  await store.init();

  const app = express();
  app.use(cors({ origin: FRONTEND_URL }));
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: FRONTEND_URL } });

  app.get("/health", (req, res) => res.json({ ok: true }));
  app.use("/api", createRouter(io));

  // Auto-checkout sweep: solves "forgot to check out" by expiring sessions
  // whose heartbeat has gone stale, and keeps confidenceScore decaying live
  // even when nobody is actively checking in/out. See store/*Store.js
  // runStalenessSweep() for the actual logic.
  setInterval(async () => {
    const changed = await store.runStalenessSweep();
    for (const location of changed) io.emit("location:update", location);
  }, SWEEP_INTERVAL_MS);

  server.listen(PORT, () => console.log(`SpotCheck server listening on :${PORT}`));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

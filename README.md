# SpotCheck

Real-time, crowd-sourced occupancy tracker for fixed-capacity campus locations. No AI/LLM anywhere — this is a real-time state system built on WebSockets, time-series aggregation, and data-trust logic (heartbeats + a confidence score), not just CRUD with a live count.

## Structure
- `server/` — standalone Express + Socket.io API (not Next.js API routes — Socket.io needs a persistent server). In-memory store by default; set `MONGODB_URI` to switch to MongoDB (Mongoose) persistence, same interface either way.
- `web/` — Next.js (App Router) + Tailwind + Socket.io client + Recharts.

## How it works

**The live loop.** Every mutation (check-in, check-out, an auto-checkout from the staleness sweep, an admin correction) follows the same path: the store function updates the location and returns it → the route (or the sweep interval) does `io.emit("location:update", location)` → every connected browser's socket listener merges that location into its local state by id. No polling, no manual refresh — this is the entire real-time mechanism, reused everywhere instead of being special-cased per feature.

**One store interface, two implementations.** `server/src/store/index.js` picks `memoryStore.js` or `mongoStore.js` based on whether `MONGODB_URI` is set. Both export identical function signatures (`checkin`, `checkout`, `heartbeat`, `runStalenessSweep`, `adminCorrect`, `getHistory`), so `routes.js` and `index.js` never know which is active. In-memory resets on every restart; Mongo persists.

**Identity without login.** `web/lib/session.js` generates a random UUID on first visit and stores it in `localStorage`. That's the only identity — sent as `sessionId` on every request, used to know whose seat to release on checkout and to reject a second check-in from the same session+location.

**The trust layer** (what makes this more than a live counter):
- *Heartbeat*: while checked in, `web/components/Heartbeat.js` pings `POST /api/heartbeat` every ~2.5 min for each location the session is in.
- *Staleness sweep*: every 90s, the server's `runStalenessSweep()` finds heartbeats older than 10 min, force-checks-out that session (decrements the count, logs a `CheckEvent` with `action: "out"`, deletes the heartbeat), and broadcasts it — this solves "forgot to tap I'm leaving."
- *Confidence score* (`server/src/store/confidence.js`): averages two signals — recency (time since the count last actually changed) and heartbeat coverage (active heartbeats ÷ current count) — into a 0-100 score, shown as "High confidence" / "Data may be stale". An admin-corrected count with no heartbeats behind it scores low on purpose: the number can be right and still be untrusted.
- *Fill-time prediction* (`server/src/store/trend.js`): net real check-ins (seeded history excluded) over the trailing 15 min, projected forward — only shown when there's enough signal (≥2 net events) and the ETA is under 90 min, so a single stray check-in can't produce a nonsense multi-hour "filling fast" claim.

**Frontend shape.** `app/page.js` (heatmap hero + location cards) → `app/location/[id]/page.js` (larger gauge, history chart, "best time to go") → `app/admin/page.js` (unprotected count override). All client components; `web/lib/api.js` is the only module that talks to the Express server.

## Run locally

```bash
cd server && npm install && npm run dev
```

```bash
cd web && npm install && npm run dev
```

Web reads the API URL from `web/.env.local` (`NEXT_PUBLIC_API_URL`, defaults to `http://localhost:4000`).

Seed data (5 locations + 7 days of realistic historical check-ins, denser during each category's typical busy hours) is generated automatically on first run, whichever store is active. Seeding is idempotent per-location by name, so adding a new entry to `SEED_LOCATIONS` and restarting inserts just the new one without touching existing data.

## Features
- Live check-in/out, cross-tab sync via Socket.io, color-coded occupancy gauges (green <60%, amber 60-85%, red >85%)
- Heartbeat + auto-checkout (see "The trust layer" above)
- Confidence score per location, shown under each gauge
- Predictive fill-time ("Filling fast — ~N min to full")
- Heatmap (home page hero) — all locations at a glance, continuous green→red by fullness, live
- "Best time to go" — quietest 2-hour window computed from the history chart data, on each location's detail page
- Admin correction at `/admin` — unprotected by design for hackathon scope (flagged in the UI and code); manually overrides a count and logs a `correction` CheckEvent

## Deploy
- `web/` → Vercel. Set `NEXT_PUBLIC_API_URL` to the deployed server URL.
- `server/` → Render (or any Node host). Set `FRONTEND_URL` to the deployed web URL (CORS + Socket.io origin), and `MONGODB_URI` if using MongoDB.
- Deployment itself (Vercel/Render account setup, CLI login) needs to be done by hand — an agent can't authenticate to your hosting accounts.

## Not implemented (true stretch goals, by design)
- Cross-location "least busy" ranking — needs multiple locations sharing a category, which the current 5-location seed set doesn't have (one location per category). Add a second study room or parking lot first if this matters.
- Browser Notification API threshold alerts — lowest-priority item in the spec's own triage.

# SpotCheck

Real-time, crowd-sourced occupancy tracker for fixed-capacity campus locations. No AI/LLM anywhere — this is a real-time state system built on WebSockets, time-series aggregation, and data-trust logic (heartbeats + a confidence score), not just CRUD with a live count.

## Structure
- `server/` — standalone Express + Socket.io API (not Next.js API routes — Socket.io needs a persistent server). In-memory store by default; set `MONGODB_URI` to switch to MongoDB (Mongoose) persistence, same interface either way.
- `web/` — Next.js (App Router) + Tailwind + Socket.io client + Recharts.

## How it works

**The live loop.** Every mutation (check-in, check-out, an auto-checkout from the staleness sweep, an admin correction) follows the same path: the store function updates the location and returns it → the route (or the sweep interval) does `io.emit("location:update", location)` → every connected browser's socket listener merges that location into its local state by id. No polling, no manual refresh. The home page header's LIVE/RECONNECTING indicator reflects the actual `socket.connected` state (`web/lib/useSocketStatus.js`), not a static decoration.

**One store interface, two implementations.** `server/src/store/index.js` picks `memoryStore.js` or `mongoStore.js` based on whether `MONGODB_URI` is set. Both export identical function signatures (`checkin`, `checkout`, `heartbeat`, `runStalenessSweep`, `adminCorrect`, `getHistory`, `getBusyness`), so `routes.js` and `index.js` never know which is active. In-memory resets on every restart; Mongo persists. Check-in/check-out on the Mongo store are atomic (Heartbeat's unique `(sessionId, locationId)` index gates duplicate check-ins, `$inc`/pipeline updates avoid lost-update races on the count, capacity is enforced with an `$expr` guard in the same atomic update) — this matters because concurrent check-ins are the normal case for this app, not an edge case.

**Identity without login.** `web/lib/session.js` generates a random UUID on first visit and stores it in `localStorage`. That's the only identity — sent as `sessionId` on every request, used to know whose seat to release on checkout and to reject a second check-in from the same session+location.

**The trust layer** (what makes this more than a live counter):
- *Heartbeat*: while checked in, `web/components/Heartbeat.js` pings `POST /api/heartbeat` every ~2.5 min for each location the session is in. A rejected ping (session was auto-checked-out server-side) self-heals the local "checked in" state instead of silently going stale.
- *Staleness sweep*: every 90s, the server's `runStalenessSweep()` finds heartbeats older than 10 min, force-checks-out that session (decrements the count, logs a `CheckEvent` with `action: "out"`, deletes the heartbeat), and broadcasts it — this solves "forgot to tap I'm leaving."
- *Confidence score* (`server/src/store/confidence.js`): averages two signals — recency (time since the count last actually changed) and heartbeat coverage (active heartbeats ÷ current count) — into a 0-100 score, shown as "High confidence" / "Data may be stale" (tap it for a one-line explainer). An admin-corrected count with no heartbeats behind it scores low on purpose: the number can be right and still be untrusted.
- *Fill-time prediction* (`server/src/store/trend.js`): net real check-ins (seeded history excluded) over the trailing 15 min, projected forward — only shown when there's enough signal (≥2 net events) and the ETA is under 90 min, so a single stray check-in can't produce a nonsense multi-hour "filling fast" claim.
- *Busyness insight* (`server/src/store/busyness.js`): compares real check-ins since the top of the current hour against the historical average for that hour, prorated for how much of the hour has elapsed — surfaces "X% busier/quieter than usual right now" on the detail page when the deviation is large enough to be meaningful.

**Admin correction is gated.** `/admin` requires a shared token (`ADMIN_TOKEN` env var, sent as `x-admin-token`) — the page shows a password gate, verifies against `GET /api/admin/verify`, and stores the token in `localStorage` on success. Still a shared secret, not real per-user auth; rotate the token before sharing the URL widely.

**Frontend shape.** `app/page.js` (heatmap hero + location cards) → `app/location/[id]/page.js` (larger gauge, history chart with a weekday/weekend/all toggle, "best time to go", busyness insight) → `app/admin/page.js` (password-gated count override). All client components; `web/lib/api.js` is the only module that talks to the Express server.

## Run locally

```bash
cd server && npm install && npm run dev
```

```bash
cd web && npm install && npm run dev
```

Web reads the API URL from `web/.env.local` (`NEXT_PUBLIC_API_URL`, defaults to `http://localhost:4000`). Server needs `ADMIN_TOKEN` set (see `.env.example`) or `/admin` will reject every request.

Seed data (5 locations + 7 days of realistic historical check-ins, denser during each category's typical busy hours and adjusted per category for weekday vs. weekend) is generated automatically on first run, whichever store is active. Seeding is idempotent per-location by name, so adding a new entry to `SEED_LOCATIONS` and restarting inserts just the new one without touching existing data.

## Tests

Zero new dependencies — both packages use Node's built-in test runner.

```bash
cd server && npm test   # confidence/trend/busyness pure functions + memoryStore integration tests (capacity, double check-in, heartbeat gate)
cd web && npm test      # bestTimeToGo / formatHour pure functions
```

Not covered: Mongo-specific atomicity (would need a real or in-memory Mongo instance — the atomic logic mirrors memoryStore's already-tested business rules), and the `useSocketStatus` React hook (would need a DOM test environment for one trivial hook).

## Features
- Live check-in/out, cross-tab sync via Socket.io, color-coded occupancy gauges (green <60%, amber 60-85%, red >85%), real connection-state indicator
- Heartbeat + auto-checkout + confidence score (see "The trust layer" above)
- Predictive fill-time and "busier/quieter than usual" insight
- Heatmap (home page hero) — all locations at a glance, continuous green→red by fullness, live
- History chart with an all-days / weekdays / weekends toggle, plus "best time to go" computed from whichever view is active
- Password-gated admin correction at `/admin`
- Installable as a PWA (manifest + themed icons); deliberately no offline service worker — caching a live occupancy count would make it lie when the network drops

## Deploy
- `web/` → Vercel. Set `NEXT_PUBLIC_API_URL` to the deployed server URL.
- `server/` → Render (or any Node host). Set `FRONTEND_URL` to the deployed web URL (CORS + Socket.io origin), `MONGODB_URI` if using MongoDB, and `ADMIN_TOKEN`.
- Deployment itself (Vercel/Render account setup, CLI login) needs to be done by hand — an agent can't authenticate to your hosting accounts.

## Not implemented (true stretch goals, by design)
- Cross-location "least busy" ranking — needs multiple locations sharing a category, which the current 5-location seed set doesn't have (one location per category). Add a second study room or parking lot first if this matters.
- Browser Notification API threshold alerts — lowest-priority item in the spec's own triage.

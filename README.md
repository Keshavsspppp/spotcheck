# SpotCheck

Real-time, crowd-sourced occupancy tracker for fixed-capacity campus locations (canteen, library, gym, parking, study rooms). No AI/LLM anywhere — this is a real-time state system built on WebSockets, time-series aggregation, and data-trust logic (heartbeats + a confidence score), not just CRUD with a live count.

**Live:** [spotcheck-sandy.vercel.app](https://spotcheck-sandy.vercel.app) (frontend) · [spotcheck-8624.onrender.com](https://spotcheck-8624.onrender.com) (API)

## Contents
- [How to use it](#how-to-use-it)
- [System architecture](#system-architecture)
- [Run locally](#run-locally)
- [Tests](#tests)
- [Deploy](#deploy)
- [Not implemented](#not-implemented-true-stretch-goals-by-design)

---

## How to use it

### Home page (`/`)
This is the campus-wide view — everything on one screen, updating live with no refresh needed.

- **Campus pulse heatmap** (top of the page): every location as a colored tile, green→red by how full it is. Tap a tile to jump to that location's detail page.
- **Location cards**, one per location, each showing:
  - Name, category icon, current count / capacity
  - A segmented gauge: **green** under 60% full, **amber** 60–85%, **red** above 85%
  - A confidence label under the gauge — **"High confidence"** or **"Data may be stale"**. Tap it to expand a one-line explanation of what it means.
  - **"Filling fast — ~N min to full"**, shown only when there's a real, sustained check-in trend (not just one stray tap)
  - The check-in toggle button:
    - **"I'm here"** — tap to check yourself in. The count goes up immediately for everyone watching.
    - **"I'm leaving"** — shown once you're checked in; tap to check yourself out.
    - **"Full"** (disabled, red) — shown if the location is at capacity and you're not already in it.
- The header's **LIVE** / **RECONNECTING** indicator reflects the real WebSocket connection state, not a decoration — if it says RECONNECTING, the page has lost its live connection and counts may be out of date until it reconnects (it does so automatically).

You don't need an account. The first time you open the app, it silently generates a random session ID and stores it in your browser (`localStorage`) — that's how it knows which locations *you* are currently checked into, so the button reflects your own status correctly across visits. Nothing personally identifying is collected.

**If you close the tab while checked in:** you don't need to do anything special. A background heartbeat keeps your check-in "alive" while the tab is open; if you close it (or your phone dies, or you just forget to tap "I'm leaving"), the server automatically checks you out after about 10 minutes of no heartbeat. This is the main thing that keeps counts honest over time.

### Location detail page (tap any card or heatmap tile)
- A larger version of the gauge, confidence label, and fill-time prediction, plus the same check-in toggle.
- **"X% busier/quieter than usual right now"** — appears when today's actual check-in activity this hour is meaningfully different from the historical average for this hour (hidden when activity is roughly normal, so it's not noisy).
- **Typical busy hours** — a bar chart of average check-ins by hour of day, built from the last 7 days. Use the **All days / Weekdays / Weekends** toggle above the chart to see how the pattern shifts (e.g. a canteen is busy on weekdays and much quieter on weekends).
- **"Best time to go"** — the quietest 2-hour window in whichever view (all/weekday/weekend) is currently selected.

### Admin correction (`/admin`)
For manually fixing a count that's drifted from reality (e.g. someone's phone died and the auto-checkout hasn't caught up yet). Gated by a shared password — enter it once and the browser remembers it. Every correction is logged with its own event type in the history, distinct from a real check-in/check-out, and broadcasts live to everyone just like a normal check-in would. This is a shared secret, not a personal login — treat the password like you would any shared admin credential.

### Installing it as an app
SpotCheck is installable on a phone home screen (Add to Home Screen / Install App from your browser menu) — it's meant to be checked quickly while walking somewhere, not kept open in a browser tab. It does **not** work offline by design: an occupancy tracker that shows you cached, possibly-wrong numbers when your connection drops would defeat the entire point of the app, so there's deliberately no offline cache.

---

## System architecture

### High-level shape

```
┌─────────────────┐        HTTPS (REST)         ┌──────────────────────┐        ┌─────────────┐
│                  │ ───────────────────────────▶│                      │        │             │
│   Browser        │                              │  Express API          │        │  MongoDB    │
│   (Next.js app,  │ ◀─────────────────────────── │  (server/, on Render)│◀──────▶│  Atlas       │
│   on Vercel)     │                              │                      │        │             │
│                  │◀════════════════════════════▶│                      │        └─────────────┘
└─────────────────┘   WebSocket (Socket.io,       └──────────────────────┘
                       live count updates)                    │
                                                    setInterval every 90s:
                                                    staleness sweep +
                                                    confidence decay
```

Two independently deployed services, no shared runtime:
- **`web/`** — Next.js 16 (App Router), Tailwind CSS, deployed to Vercel. Pure client-rendered pages; the only thing that talks to the backend is `web/lib/api.js` (REST) and `web/lib/socket.js` (WebSocket).
- **`server/`** — standalone Node.js + Express + Socket.io, deployed to Render. **Not** Next.js API routes — Socket.io needs a long-lived process to hold open WebSocket connections, which serverless functions don't provide.
- **MongoDB Atlas** — the persistence layer, reachable only from the server. In-memory fallback exists for local demoing without a DB (see below).

### The real-time loop

Every mutation — a check-in, a check-out, an auto-checkout from the staleness sweep, or an admin correction — follows the exact same path, so there's one real-time mechanism instead of one per feature:

```
1. Client calls a REST endpoint (POST /api/checkin, etc.)
2. The store function (memoryStore.js or mongoStore.js) applies the change
   and returns the updated location
3. The route handler — or the sweep's setInterval — calls
   io.emit("location:update", location)
4. Every connected browser's socket listener merges that location into
   its local state by id, re-rendering instantly
```

No polling anywhere. The header's LIVE/RECONNECTING indicator (`web/lib/useSocketStatus.js`) subscribes directly to the socket's own `connect`/`disconnect` events, so it reflects the real connection state rather than assuming it's always live.

### Backend (`server/src/`)

| File | Responsibility |
|---|---|
| `index.js` | Entry point. Boots Express + Socket.io, mounts routes, runs the 90s staleness-sweep `setInterval`. |
| `routes.js` | All HTTP endpoints (table below). Owns the `requireAdminToken` middleware. |
| `store/index.js` | Picks `memoryStore.js` or `mongoStore.js` based on whether `MONGODB_URI` is set. Both export an identical function signature, so nothing else in the app knows or cares which is active. |
| `store/memoryStore.js` | In-process, in-memory implementation. Resets on every restart — used for zero-config local demoing. |
| `store/mongoStore.js` | Mongoose-backed implementation. Check-in/check-out are atomic: a Heartbeat's unique `(sessionId, locationId)` index gates duplicate check-ins (insert throws on conflict instead of a racy read-then-write check), `$inc`/aggregation-pipeline updates avoid lost-update races on the count under concurrent requests, and capacity is enforced with a `$expr` guard inside the same atomic update. This matters because concurrent check-ins are the normal case for a crowd-sourced app, not an edge case. |
| `store/models.js` | Mongoose schemas: `Location`, `CheckEvent`, `Heartbeat`. |
| `store/seedHistory.js` | Generates 7 days of realistic fake `CheckEvent`s per location on first run, weighted by category-specific busy hours and a weekday/weekend multiplier (e.g. a canteen is busy weekdays, quiet weekends; a gym is the opposite). |
| `store/confidence.js` | Pure function: `currentCount`/`lastEventAt`/active-heartbeat-count → a 0–100 trust score. |
| `store/trend.js` | Pure function: recent real check-in/check-out counts → a fill-time ETA, or `null` if there isn't enough signal or it's too far out to call "fast". |
| `store/busyness.js` | Pure function: today's check-ins so far this hour vs. the historical average for this hour (prorated for elapsed time) → a "busier/quieter than usual" verdict, or `null` if the deviation isn't meaningful. |

### API reference

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/locations` | — | List all locations with live count, confidence score, fill-time ETA. |
| `POST /api/checkin` | — | Body `{locationId, sessionId}`. Increments count, rejects duplicates and over-capacity, starts a heartbeat, broadcasts. |
| `POST /api/checkout` | — | Body `{locationId, sessionId}`. Decrements count (floored at 0), ends the heartbeat, broadcasts. |
| `POST /api/heartbeat` | — | Body `{locationId, sessionId}`. Keeps a check-in "alive"; rejected if that session isn't actually checked in. |
| `GET /api/locations/:id/history?dayPart=all\|weekday\|weekend` | — | Hourly average check-ins for the last 7 days. |
| `GET /api/locations/:id/busyness` | — | Current busier/quieter-than-usual verdict, or `null`. |
| `GET /api/admin/verify` | `x-admin-token` header | Used by the `/admin` password gate to validate a token before showing the UI. |
| `POST /api/admin/correction` | `x-admin-token` header | Body `{locationId, currentCount}`. Manually overrides a count, clamped to `[0, capacity]`, logged as a `correction` event, broadcasts. |

### Data model

```
Location            CheckEvent                 Heartbeat
─────────           ──────────                 ─────────
name                locationId (ref)            sessionId
capacity             sessionId                   locationId (ref)
currentCount          action: in | out |          lastPing
category               correction
confidenceScore       timestamp                unique index on
lastEventAt                                      (sessionId, locationId)
```

`Heartbeat`'s existence *is* "this session is checked in here" — the single source of truth checkin/checkout/heartbeat all agree on, rather than three code paths independently inferring state from the `CheckEvent` log.

### Frontend (`web/`)

| Path | Responsibility |
|---|---|
| `app/page.js` | Home page — heatmap hero + location card grid. |
| `app/location/[id]/page.js` | Detail page — larger gauge, busyness insight, history chart with the weekday/weekend toggle, "best time to go". |
| `app/admin/page.js` | Password-gated count correction. |
| `app/manifest.js`, `app/icon.js`, `app/apple-icon.js` | PWA installability (manifest + generated icons via `next/og`). |
| `components/LocationCard.js`, `Gauge.js`, `Heatmap.js`, `HistoryChart.js` | Presentational pieces used by the two main pages. |
| `components/Heartbeat.js` | Mounted once in the root layout; pings `/api/heartbeat` every ~2.5 min for every location the session is checked into. Self-heals local "checked in" state if a ping is rejected (meaning the server already auto-checked this session out). |
| `lib/api.js` | The only module that talks to the Express server (REST). |
| `lib/socket.js`, `lib/useSocketStatus.js` | Socket.io client singleton + a hook exposing its live connection state. |
| `lib/session.js` | Anonymous session ID generation/storage, and which locations this session is currently checked into. |
| `lib/adminAuth.js` | Admin token storage (separate from the anonymous session — a shared secret, not an identity). |
| `lib/errorMessages.js` | Maps backend error codes to friendly copy, and to "does this mean our local checked-in state is now wrong" — used to self-heal the UI instead of leaving a stale button after a state mismatch (e.g. an auto-checkout that happened while this tab was idle). |
| `lib/confidence.js`, `lib/bestTime.js`, `lib/formatHour.js` | Small pure helpers shared across pages. |

All pages are client components — there's no server-rendered data fetching, since everything is either live (sockets) or fetched on mount.

---

## Run locally

```bash
cd server && npm install && npm run dev
```

```bash
cd web && npm install && npm run dev
```

Web reads the API URL from `web/.env.local` (`NEXT_PUBLIC_API_URL`, defaults to `http://localhost:4000`). Server needs `ADMIN_TOKEN` set (see `server/.env.example`) or `/admin` will reject every request.

Seed data (5 locations + 7 days of realistic historical check-ins) is generated automatically on first run, whichever store is active — no DB required to demo it locally. Seeding is idempotent per-location by name, so adding a new entry to `SEED_LOCATIONS` and restarting inserts just the new one without touching existing data.

## Tests

Zero new dependencies — both packages use Node's built-in test runner.

```bash
cd server && npm test   # confidence/trend/busyness pure functions + memoryStore integration tests (capacity, double check-in, heartbeat gate)
cd web && npm test      # bestTimeToGo / formatHour pure functions
```

Not covered: Mongo-specific atomicity (would need a real or in-memory Mongo instance — the atomic logic mirrors memoryStore's already-tested business rules), and the `useSocketStatus` React hook (would need a DOM test environment for one trivial hook).

## Deploy

Already deployed at the URLs above. To redeploy your own copy:

**Render (`server/`)**

| Env var | Value |
|---|---|
| `FRONTEND_URL` | your Vercel URL, e.g. `https://your-app.vercel.app` (CORS + Socket.io origin — must match exactly, no trailing slash) |
| `MONGODB_URI` | your Atlas connection string (omit to run in-memory, which resets on every restart/redeploy) |
| `ADMIN_TOKEN` | any secret string — required, or every `/admin` request is rejected |
| `PORT` | leave unset — Render sets this automatically and the app already respects it |

**Vercel (`web/`)**

| Env var | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | your Render URL, e.g. `https://your-app.onrender.com` (no trailing slash) |

`NEXT_PUBLIC_*` variables are baked into the JavaScript bundle at **build time**, not read at runtime — after changing this on Vercel you must trigger a new deployment, saving the variable alone does nothing.

## Not implemented (true stretch goals, by design)
- Cross-location "least busy" ranking — needs multiple locations sharing a category, which the current 5-location seed set doesn't have (one location per category). Add a second study room or parking lot first if this matters.
- Browser Notification API threshold alerts — lowest-priority item in the spec's own triage.

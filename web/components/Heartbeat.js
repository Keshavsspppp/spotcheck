"use client";

import { useEffect } from "react";
import { getSessionId, getCheckedInIds } from "@/lib/session";
import { heartbeat } from "@/lib/api";

const PING_INTERVAL_MS = 150000; // 2.5 min, within the spec's 2-3 min window

// Keeps the backend's Heartbeat record fresh for every location this session
// is checked into, so the staleness sweep doesn't mistake an open tab for an
// abandoned one. Mounted once in the root layout so it survives navigation.
export default function Heartbeat() {
  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId) return;

    function ping() {
      for (const locationId of getCheckedInIds()) {
        heartbeat(locationId, sessionId).catch(() => {});
      }
    }

    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LocationCard from "@/components/LocationCard";
import Heatmap from "@/components/Heatmap";
import { getLocations, checkin, checkout } from "@/lib/api";
import { getSessionId, isCheckedIn, setCheckedIn } from "@/lib/session";
import { getSocket } from "@/lib/socket";

export default function Home() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [checkedInMap, setCheckedInMap] = useState({});
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    const id = getSessionId();
    setSessionId(id);

    getLocations()
      .then((locs) => {
        setLocations(locs);
        const map = {};
        for (const loc of locs) map[loc.id] = isCheckedIn(loc.id);
        setCheckedInMap(map);
      })
      .catch(() => setError("Lost connection to SpotCheck. Refresh to try again."))
      .finally(() => setLoading(false));

    const socket = getSocket();
    const onUpdate = (updated) => {
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    };
    socket.on("location:update", onUpdate);
    return () => socket.off("location:update", onUpdate);
  }, []);

  async function handleToggle(location) {
    if (!sessionId) return;
    setBusyId(location.id);
    setError(null);
    const currentlyIn = checkedInMap[location.id];
    try {
      const updated = currentlyIn
        ? await checkout(location.id, sessionId)
        : await checkin(location.id, sessionId);
      setCheckedIn(location.id, !currentlyIn);
      setCheckedInMap((prev) => ({ ...prev, [location.id]: !currentlyIn }));
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-paper">SPOTCHECK</h1>
            <p className="text-sm text-paper-dim mt-1">Live campus occupancy, updated in real time.</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal-green motion-safe:animate-pulse" />
              <span className="text-xs font-bold tracking-widest text-paper-dim">LIVE</span>
            </div>
            <Link href="/admin" className="text-xs text-paper-dim hover:text-amber transition-colors">
              Admin
            </Link>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-signal-red/40 bg-signal-red/10 text-signal-red text-sm px-4 py-2.5">
            {error}
          </div>
        )}

        {loading ? (
          <div className="font-display text-sm tracking-widest text-paper-dim uppercase">Loading…</div>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-widest text-paper-dim mb-2">
                Campus pulse
              </h2>
              <Heatmap locations={locations} />
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {locations.map((loc) => (
                <LocationCard
                  key={loc.id}
                  location={loc}
                  checkedIn={!!checkedInMap[loc.id]}
                  busy={busyId === loc.id}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

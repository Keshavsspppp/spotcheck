"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Gauge from "@/components/Gauge";
import HistoryChart from "@/components/HistoryChart";
import { getLocations, getHistory, checkin, checkout } from "@/lib/api";
import { getSessionId, isCheckedIn, setCheckedIn } from "@/lib/session";
import { getSocket } from "@/lib/socket";
import { bestTimeToGo } from "@/lib/bestTime";

export default function LocationDetail() {
  const { id } = useParams();
  const [location, setLocation] = useState(null);
  const [history, setHistory] = useState([]);
  const [checkedIn, setCheckedInState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const sid = getSessionId();
    setSessionId(sid);
    setCheckedInState(isCheckedIn(id));

    Promise.all([getLocations(), getHistory(id)])
      .then(([locs, hist]) => {
        setLocation(locs.find((l) => l.id === id) || null);
        setHistory(hist);
      })
      .catch(() => setError("Lost connection to SpotCheck. Refresh to try again."))
      .finally(() => setLoading(false));

    const socket = getSocket();
    const onUpdate = (updated) => {
      if (updated.id === id) {
        setFlash(true);
        setTimeout(() => setFlash(false), 350);
        setLocation(updated);
      }
    };
    socket.on("location:update", onUpdate);
    return () => socket.off("location:update", onUpdate);
  }, [id]);

  async function handleToggle() {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = checkedIn ? await checkout(id, sessionId) : await checkin(id, sessionId);
      setCheckedIn(id, !checkedIn);
      setCheckedInState(!checkedIn);
      setLocation(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-display text-sm tracking-widest text-paper-dim uppercase">
        Loading…
      </div>
    );
  }

  if (!location) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-paper-dim px-4 text-center">
        <p>{error || "That location doesn't exist."}</p>
        <Link href="/" className="text-amber hover:underline">
          ← All locations
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-xs font-bold tracking-widest text-paper-dim hover:text-amber transition-colors">
          ← ALL LOCATIONS
        </Link>

        <header className="mt-4 mb-6 flex items-center gap-3">
          <div className="h-11 w-11 shrink-0 flex items-center justify-center rounded-sm border border-amber/40 bg-panel font-display font-bold text-lg text-amber">
            {location.category[0]}
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-paper">{location.name}</h1>
            <p className="text-xs text-paper-dim uppercase tracking-widest">{location.category}</p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-signal-red/40 bg-signal-red/10 text-signal-red text-sm px-4 py-2.5">
            {error}
          </div>
        )}

        <div className="rounded-md border border-panel-line bg-panel p-6 mb-6">
          <Gauge
            current={location.currentCount}
            capacity={location.capacity}
            flash={flash}
            confidenceScore={location.confidenceScore}
          />
          {location.fillEtaMinutes != null && (
            <div className="mt-3 text-xs font-bold text-amber">
              Filling fast — ~{location.fillEtaMinutes} min to full
            </div>
          )}
          <button
            onClick={handleToggle}
            disabled={busy}
            className={`mt-5 w-full rounded-sm py-3.5 font-display font-bold text-sm uppercase tracking-widest transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 ${
              checkedIn
                ? "bg-board text-paper border border-panel-line hover:border-amber/60"
                : "bg-amber text-board hover:bg-amber/90"
            }`}
          >
            {busy ? "···" : checkedIn ? "I'm leaving" : "I'm here"}
          </button>
        </div>

        <div className="rounded-md border border-panel-line bg-panel p-6">
          <h2 className="font-bold text-sm uppercase tracking-widest text-paper">Typical busy hours</h2>
          <p className="text-xs text-paper-dim mb-1 mt-1">
            Average check-ins by hour of day, based on the last 7 days of activity.
          </p>
          {history.length === 24 && (
            <p className="text-xs text-signal-green font-bold mb-4">
              Best time to go: {bestTimeToGo(history)}
            </p>
          )}
          <HistoryChart data={history} />
        </div>
      </div>
    </div>
  );
}

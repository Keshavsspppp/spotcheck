"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Gauge from "./Gauge";

export default function LocationCard({ location, checkedIn, busy, onToggle }) {
  const prevCount = useRef(location.currentCount);
  const [flash, setFlash] = useState(false);
  const atCapacity = !checkedIn && location.currentCount >= location.capacity;

  useEffect(() => {
    if (prevCount.current !== location.currentCount) {
      prevCount.current = location.currentCount;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 350);
      return () => clearTimeout(t);
    }
  }, [location.currentCount]);

  return (
    <div className="rounded-md border border-panel-line bg-panel p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-sm border border-amber/40 bg-board font-display font-bold text-sm text-amber">
          {location.category[0]}
        </div>
        <div className="min-w-0">
          <Link
            href={`/location/${location.id}`}
            className="font-bold uppercase tracking-wide text-sm hover:text-amber transition-colors truncate block"
          >
            {location.name}
          </Link>
          <div className="text-xs text-paper-dim">{location.category}</div>
        </div>
      </div>

      <Gauge
        current={location.currentCount}
        capacity={location.capacity}
        flash={flash}
        confidenceScore={location.confidenceScore}
      />

      {location.fillEtaMinutes != null && (
        <div className="-mt-2 text-xs font-bold text-amber">
          Filling fast — ~{location.fillEtaMinutes} min to full
        </div>
      )}

      <button
        onClick={() => onToggle(location)}
        disabled={busy || atCapacity}
        className={`w-full rounded-sm py-3.5 font-display font-bold text-sm uppercase tracking-widest transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 ${
          atCapacity
            ? "bg-signal-red/15 text-signal-red border border-signal-red/40 cursor-not-allowed"
            : checkedIn
            ? "bg-board text-paper border border-panel-line hover:border-amber/60"
            : "bg-amber text-board hover:bg-amber/90"
        }`}
      >
        {busy ? "···" : atCapacity ? "Full" : checkedIn ? "I'm leaving" : "I'm here"}
      </button>
    </div>
  );
}

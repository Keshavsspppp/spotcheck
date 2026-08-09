"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLocations, adminCorrect } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export default function AdminPage() {
  const [locations, setLocations] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLocations()
      .then(setLocations)
      .catch(() => setError("Lost connection to SpotCheck. Refresh to try again."))
      .finally(() => setLoading(false));

    const socket = getSocket();
    const onUpdate = (updated) => {
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    };
    socket.on("location:update", onUpdate);
    return () => socket.off("location:update", onUpdate);
  }, []);

  async function handleSubmit(location) {
    const raw = drafts[location.id];
    const value = raw === undefined || raw === "" ? location.currentCount : Number(raw);
    if (!Number.isFinite(value)) return;

    setBusyId(location.id);
    setError(null);
    try {
      const updated = await adminCorrect(location.id, value);
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setDrafts((prev) => ({ ...prev, [location.id]: undefined }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-xs font-bold tracking-widest text-paper-dim hover:text-amber transition-colors">
          ← ALL LOCATIONS
        </Link>

        <header className="mt-4 mb-6">
          <h1 className="font-display font-bold text-2xl tracking-tight text-paper">Admin correction</h1>
          <p className="text-xs text-signal-red mt-2 border border-signal-red/40 bg-signal-red/10 rounded-md px-3 py-2">
            Unprotected — anyone with this URL can change counts. No auth in this build; put this behind
            real authentication before production.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-signal-red/40 bg-signal-red/10 text-signal-red text-sm px-4 py-2.5">
            {error}
          </div>
        )}

        {loading ? (
          <div className="font-display text-sm tracking-widest text-paper-dim uppercase">Loading…</div>
        ) : (
          <div className="flex flex-col gap-3">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="rounded-md border border-panel-line bg-panel p-4 flex items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm uppercase tracking-wide truncate">{loc.name}</div>
                  <div className="text-xs text-paper-dim">
                    currently {loc.currentCount} / {loc.capacity}
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={loc.capacity}
                  placeholder={String(loc.currentCount)}
                  value={drafts[loc.id] ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [loc.id]: e.target.value }))}
                  className="w-20 rounded-sm border border-panel-line bg-board px-2 py-1.5 text-sm font-display tabular-nums text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
                />
                <button
                  onClick={() => handleSubmit(loc)}
                  disabled={busyId === loc.id}
                  className="rounded-sm bg-amber text-board font-display font-bold text-xs uppercase tracking-widest px-3 py-1.5 hover:bg-amber/90 disabled:opacity-40"
                >
                  {busyId === loc.id ? "···" : "Update"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

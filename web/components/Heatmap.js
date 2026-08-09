import Link from "next/link";

// Continuous green->amber->red by fullness, distinct from the cards' discrete
// OK/BUSY/FULL ticks — this view is meant to read as one glance at the whole
// system, not a breakdown of any single location.
function heatColor(percent) {
  const hue = Math.max(0, 140 - (140 * percent) / 100);
  return `hsl(${hue}, 55%, 32%)`;
}

export default function Heatmap({ locations }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {locations.map((loc) => {
        const percent = loc.capacity > 0 ? Math.min(100, Math.round((loc.currentCount / loc.capacity) * 100)) : 0;
        return (
          <Link
            key={loc.id}
            href={`/location/${loc.id}`}
            className="rounded-md p-3 flex flex-col justify-between h-24 border border-panel-line transition-transform hover:scale-[1.02]"
            style={{ backgroundColor: heatColor(percent) }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-paper truncate">{loc.name}</span>
            <div className="flex items-end justify-between">
              <span className="font-display font-bold text-2xl tabular-nums text-paper">{percent}%</span>
              <span className="text-[10px] text-paper/70">
                {loc.currentCount}/{loc.capacity}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

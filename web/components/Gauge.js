import { confidenceLabel } from "@/lib/confidence";

const TICKS = 20;

function status(percent) {
  if (percent > 85) return { word: "FULL", color: "bg-signal-red", text: "text-signal-red" };
  if (percent >= 60) return { word: "BUSY", color: "bg-amber", text: "text-amber" };
  return { word: "OK", color: "bg-signal-green", text: "text-signal-green" };
}

export default function Gauge({ current, capacity, flash, confidenceScore }) {
  const percent = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
  const { word, color, text } = status(percent);
  const lit = Math.round((percent / 100) * TICKS);
  const highConfidence = confidenceScore >= 70;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div
          className={`font-display font-bold text-4xl tabular-nums motion-safe:transition-transform motion-safe:duration-300 ${
            flash ? "motion-safe:scale-110 text-amber" : "text-paper"
          }`}
        >
          {current}
          <span className="text-lg text-paper-dim">/{capacity}</span>
        </div>
        <div className={`text-xs font-bold tracking-widest ${text}`}>
          {word} · {percent}%
        </div>
      </div>

      <div className="mt-2 flex gap-[3px]">
        {Array.from({ length: TICKS }).map((_, i) => (
          <div
            key={i}
            className={`h-3 flex-1 rounded-[1px] ${i < lit ? color : "bg-panel-line"}`}
          />
        ))}
      </div>

      {typeof confidenceScore === "number" && (
        <div className={`mt-1.5 text-[11px] ${highConfidence ? "text-paper-dim" : "text-amber"}`}>
          {confidenceLabel(confidenceScore)}
        </div>
      )}
    </div>
  );
}

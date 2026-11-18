import { useState } from "react";
import { canVibrate, feedback, useFeedbackPrefs, type Cue } from "../lib/feedback";

const SAMPLES: { cue: Cue; label: string }[] = [
  { cue: "log", label: "🪙 Log" },
  { cue: "overflow", label: "🫙 Overflow" },
  { cue: "celebrate", label: "🎉 Inbox zero" },
  { cue: "fresh", label: "🧾 New budget" },
];

/** Settings → Sound & haptics: two switches and a few samples to try. */
export function FeedbackSettings() {
  const [prefs, setPrefs] = useFeedbackPrefs();
  const [vibrates] = useState(canVibrate);

  return (
    <section className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-line">
      <div>
        <h2 className="text-lg font-semibold">🔊 Sound &amp; haptics</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A coin when you log, a bloop when a pot overflows, a little fanfare at inbox zero. Kept on this device.
        </p>
      </div>
      <Switch label="Sounds" on={prefs.sound} onChange={(sound) => setPrefs({ sound })} />
      <Switch
        label="Vibration"
        hint={vibrates ? undefined : "Not supported in this browser (iPhones don't allow it for web apps)."}
        on={prefs.haptics && vibrates}
        disabled={!vibrates}
        onChange={(haptics) => setPrefs({ haptics })}
      />
      <div className="flex flex-wrap gap-1.5 pt-1">
        {SAMPLES.map((s) => (
          <button
            key={s.cue}
            onClick={() => feedback(s.cue)}
            className="rounded-full bg-bg px-3 py-1.5 text-xs font-bold ring-1 ring-line transition active:scale-95"
          >
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Switch({
  label,
  hint,
  on,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-ink-faint">{hint}</div>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${on ? "bg-accent" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}

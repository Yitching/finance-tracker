import { useState } from "react";
import { DEFAULT_LAYOUT, HOME_SECTIONS, type HomeLayout, type HomeSectionId } from "../lib/homeLayout";

const LABELS = Object.fromEntries(HOME_SECTIONS.map((s) => [s.id, s])) as Record<
  HomeSectionId,
  (typeof HOME_SECTIONS)[number]
>;

/**
 * Settings → Home layout: move Home's sections up and down, and show or hide each one.
 * Changes apply straight away.
 */
export function HomeLayoutSettings({
  layout,
  onChange,
}: {
  layout: HomeLayout;
  onChange: (next: HomeLayout) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(layout) !== JSON.stringify(DEFAULT_LAYOUT);

  function save(next: HomeLayout) {
    setError(null);
    onChange(next).catch(() =>
      setError("Saved on this phone, but couldn't sync it. Has the latest database migration been pushed?"),
    );
  }

  function move(index: number, by: -1 | 1) {
    const order = [...layout.order];
    const to = index + by;
    if (to < 0 || to >= order.length) return;
    [order[index], order[to]] = [order[to], order[index]];
    save({ ...layout, order });
  }

  function toggle(id: HomeSectionId) {
    const hidden = layout.hidden.includes(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id];
    save({ ...layout, hidden });
  }

  return (
    <section className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">🏠 Home layout</h2>
        {changed && (
          <button onClick={() => save(DEFAULT_LAYOUT)} className="shrink-0 text-sm font-bold text-accent">
            Reset
          </button>
        )}
      </div>
      <p className="text-sm text-ink-soft">
        Put Home's sections in the order you like, and hide the ones you don't use. The Inbox banner always stays at the
        top when charges need checking.
      </p>
      <ol className="space-y-2">
        {layout.order.map((id, i) => {
          const s = LABELS[id];
          const shown = !layout.hidden.includes(id);
          return (
            <li
              key={id}
              className={`flex items-center gap-2 rounded-2xl bg-bg px-3 py-2 ring-1 ring-line transition ${shown ? "" : "opacity-55"}`}
            >
              <span className="text-lg" aria-hidden>
                {s.emoji}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">{s.label}</span>
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${s.label} up`}
                className="grid size-9 place-items-center rounded-xl bg-card text-base ring-1 ring-line transition active:scale-90 disabled:opacity-30"
              >
                ▲
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === layout.order.length - 1}
                aria-label={`Move ${s.label} down`}
                className="grid size-9 place-items-center rounded-xl bg-card text-base ring-1 ring-line transition active:scale-90 disabled:opacity-30"
              >
                ▼
              </button>
              <button
                role="switch"
                aria-checked={shown}
                aria-label={`Show ${s.label}`}
                onClick={() => toggle(id)}
                className={`relative ml-1 h-7 w-12 shrink-0 rounded-full transition ${shown ? "bg-accent" : "bg-line"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${shown ? "translate-x-5" : ""}`}
                />
              </button>
            </li>
          );
        })}
      </ol>
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

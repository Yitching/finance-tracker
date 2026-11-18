import { useState } from "react";
import { categoryChip, DEFAULT_COLOURS, PALETTE, type PaletteColour } from "../lib/categoryStyle";
import { CATEGORIES, CATEGORY_EMOJI } from "../lib/types";

/**
 * Settings → Category colours: tap a category, pick a colour. It applies everywhere at
 * once (chips, lists, charts, pot jars, bill icons) and saves straight away.
 */
export function CategoryColours({
  colours,
  onChange,
}: {
  colours: Record<string, PaletteColour>;
  onChange: (next: Record<string, PaletteColour>) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changed = Object.keys(colours).length > 0;

  function save(next: Record<string, PaletteColour>) {
    setError(null);
    onChange(next).catch(() => setError("Saved on this phone, but couldn't sync it. Has the latest database migration been pushed?"));
  }

  function pick(category: string, colour: PaletteColour) {
    const next = { ...colours };
    // Only store changes, so a future default tweak still reaches untouched categories.
    if (colour === DEFAULT_COLOURS[category]) delete next[category];
    else next[category] = colour;
    save(next);
  }

  return (
    <section className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">🌈 Category colours</h2>
        {changed && (
          <button onClick={() => save({})} className="shrink-0 text-sm font-bold text-accent">
            Reset all
          </button>
        )}
      </div>
      <p className="text-sm text-ink-soft">
        Tap a category to pick its colour. It changes everywhere: chips, lists, charts, pot jars and bills.
      </p>
      <ul className="divide-y divide-line">
        {CATEGORIES.map((category) => {
          const current = colours[category] ?? DEFAULT_COLOURS[category];
          const isOpen = open === category;
          return (
            <li key={category} className="py-2">
              <button
                onClick={() => setOpen(isOpen ? null : category)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl text-lg ${categoryChip(category)}`}>
                  {CATEGORY_EMOJI[category]}
                </span>
                <span className="min-w-0 flex-1 font-medium">{category}</span>
                <span className="text-xs text-ink-faint capitalize">{current}</span>
                <span
                  className="size-5 shrink-0 rounded-full ring-2 ring-card"
                  style={{ background: `var(--pal-${current}-bar)` }}
                  aria-hidden
                />
              </button>
              {isOpen && (
                <div className="animate-fade-up mt-2.5 flex flex-wrap gap-2 pl-12" role="radiogroup" aria-label={`${category} colour`}>
                  {PALETTE.map((colour) => (
                    <button
                      key={colour}
                      role="radio"
                      aria-checked={colour === current}
                      aria-label={colour}
                      title={colour}
                      onClick={() => pick(category, colour)}
                      className={`size-8 rounded-full transition active:scale-90 ${
                        colour === current ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : ""
                      }`}
                      style={{ background: `var(--pal-${colour}-bar)` }}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

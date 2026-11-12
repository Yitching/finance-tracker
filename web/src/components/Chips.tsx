import { useMemo } from "react";
import { money } from "../lib/money";
import { CATEGORY_EMOJI, type Remembered } from "../lib/types";
import { categoryChip } from "../lib/categoryStyle";

type Props = {
  memory: Remembered[];
  onTap: (m: Remembered) => void;
};

/**
 * One-tap logging for things you buy all the time.
 * Ranked by how often you buy each item around this hour of the day,
 * so 8am shows kopi and 12:30pm shows your usual lunch.
 * Lives at the top of Home, well away from the text box, so it's hard to tap by accident.
 */
export function Chips({ memory, onTap }: Props) {
  const chips = useMemo(() => {
    const h = new Date().getHours();
    const near = (m: Remembered, offset: number) => m.hour_counts?.[(h + offset + 24) % 24] ?? 0;
    return [...memory]
      .map((m) => ({
        m,
        score: near(m, 0) * 4 + (near(m, -1) + near(m, 1)) * 2 + m.use_count * 0.3,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.m);
  }, [memory]);

  if (!chips.length) return null;

  return (
    <section>
      <div className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink-faint uppercase">
        Usual around now · one tap
      </div>
      {/* The fade on the right says "there's more, swipe". */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]">
        {chips.map((m) => (
          <button
            key={m.item_key}
            onClick={() => onTap(m)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm shadow-sm ring-1 ring-line transition active:scale-95 ${categoryChip(m.category)}`}
          >
            <span>{CATEGORY_EMOJI[m.category] ?? "📦"}</span>
            <span className="font-semibold">{m.display_name}</span>
            <span className="text-ink-soft">{money(m.last_amount)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

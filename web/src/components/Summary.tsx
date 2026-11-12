import { useMemo } from "react";
import { money, startOfDay, startOfWeek } from "../lib/money";
import { daysLeft, type Period } from "../lib/period";
import { CATEGORY_EMOJI, type Expense } from "../lib/types";
import { categoryBar, categoryChip } from "../lib/categoryStyle";

/** Home's one-liner: "Today $12.30 · This week $84.10 ›", opens the full breakdown. */
export function SummaryStrip({ expenses, onOpen }: { expenses: Expense[]; onOpen: () => void }) {
  const { today, week } = useMemo(() => {
    const d = startOfDay().getTime();
    const w = startOfWeek().getTime();
    let today = 0;
    let week = 0;
    for (const e of expenses) {
      const t = new Date(e.spent_at).getTime();
      if (t >= w) week += e.amount;
      if (t >= d) today += e.amount;
    }
    return { today, week };
  }, [expenses]);

  return (
    <button
      onClick={onOpen}
      aria-label="Spending breakdown"
      className="@container flex w-full items-center gap-2 rounded-3xl bg-card p-2 text-left shadow-sm ring-1 ring-line transition active:scale-[0.99] @min-[22rem]:gap-3"
    >
      <span className="min-w-0 flex-1 rounded-2xl bg-lime-200/70 px-3 py-3 dark:bg-lime-900/40 @min-[22rem]:px-4">
        <span className="block text-xs font-semibold text-ink-soft">Today</span>
        <span className="block truncate text-lg font-extrabold tabular-nums @min-[22rem]:text-xl">{money(today)}</span>
      </span>
      <span className="min-w-0 flex-1 rounded-2xl bg-amber-100 px-3 py-3 dark:bg-amber-900/40 @min-[22rem]:px-4">
        <span className="block text-xs font-semibold text-ink-soft">This week</span>
        <span className="block truncate text-lg font-extrabold tabular-nums @min-[22rem]:text-xl">{money(week)}</span>
      </span>
      <span className="shrink-0 rounded-full bg-ink px-3 py-2 text-xs font-bold whitespace-nowrap text-bg">
        <span className="@max-[22rem]:hidden">Breakdown </span>›
      </span>
    </button>
  );
}

/**
 * Spending for one period (a calendar month or a billing cycle), with its categories
 * and a comparison against the period before. `expenses` must cover both periods.
 */
export function PeriodSummary({
  period,
  previous,
  previousTitle,
  expenses,
  hideTotal = false,
}: {
  period: Period;
  previous: Period;
  previousTitle: string;
  expenses: Expense[];
  /** When the budget card above already shows the total and days left. */
  hideTotal?: boolean;
}) {
  const { total, byCategory, compareTotal, ongoing } = useMemo(() => {
    const now = Date.now();
    const from = period.from.getTime();
    const to = period.to.getTime();
    const ongoing = now >= from && now < to;
    // While a period is still running, compare against the same point of the last one.
    const prevFrom = previous.from.getTime();
    const prevTo = ongoing ? Math.min(previous.to.getTime(), prevFrom + (now - from)) : previous.to.getTime();

    let total = 0;
    let compareTotal = 0;
    const cats = new Map<string, number>();
    for (const e of expenses) {
      const t = new Date(e.spent_at).getTime();
      if (t >= from && t < to) {
        total += e.amount;
        cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount);
      } else if (t >= prevFrom && t < prevTo) {
        compareTotal += e.amount;
      }
    }
    return { total, byCategory: [...cats.entries()].sort((a, b) => b[1] - a[1]), compareTotal, ongoing };
  }, [expenses, period, previous]);

  const max = byCategory[0]?.[1] ?? 0;
  const diff = total - compareTotal;
  const left = daysLeft(period);

  return (
    <section className="animate-fade-up rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
      {hideTotal ? (
        <h2 className="font-bold">Where it went</h2>
      ) : (
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-4xl font-extrabold tracking-tight tabular-nums">{money(total)}</div>
        {left !== null && (
          <div className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            {left} day{left === 1 ? "" : "s"} left
          </div>
        )}
      </div>
      )}
      {compareTotal > 0 && (
        <div className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${diff > 0 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"}`}>
          {diff > 0 ? "▲" : "▼"} {money(Math.abs(diff))} vs {ongoing ? `same point of ${previousTitle}` : previousTitle}
        </div>
      )}

      {byCategory.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {byCategory.map(([cat, amt]) => (
            <li key={cat} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-base ${categoryChip(cat)}`}>
                    {CATEGORY_EMOJI[cat] ?? "📦"}
                  </span>
                  {cat}
                </span>
                <span className="tabular-nums text-ink-soft">
                  {money(amt)} · {total ? Math.round((amt / total) * 100) : 0}%
                </span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-bg">
                <div
                  className={`h-full rounded-full ${categoryBar(cat)} transition-[width] duration-700`}
                  style={{ width: `${max ? (amt / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">Nothing logged in this period.</p>
      )}
    </section>
  );
}

import { useMemo } from "react";
import { money, startOfDay, startOfWeek } from "../lib/money";
import { daysLeft, type Period } from "../lib/period";
import { CATEGORY_EMOJI, type Expense } from "../lib/types";

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
      className="flex w-full items-center gap-4 rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-line active:scale-[0.99]"
    >
      <span className="flex-1">
        <span className="block text-xs text-ink-faint">Today</span>
        <span className="text-xl font-bold tabular-nums">{money(today)}</span>
      </span>
      <span className="flex-1">
        <span className="block text-xs text-ink-faint">This week</span>
        <span className="text-xl font-bold tabular-nums">{money(week)}</span>
      </span>
      <span className="text-sm font-medium text-accent">Breakdown ›</span>
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
}: {
  period: Period;
  previous: Period;
  previousTitle: string;
  expenses: Expense[];
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
    <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-4xl font-bold tracking-tight tabular-nums">{money(total)}</div>
        {left !== null && (
          <div className="shrink-0 text-sm text-ink-soft">
            {left} day{left === 1 ? "" : "s"} left
          </div>
        )}
      </div>
      {compareTotal > 0 && (
        <div className={`mt-1 text-sm ${diff > 0 ? "text-danger" : "text-good"}`}>
          {diff > 0 ? "▲" : "▼"} {money(Math.abs(diff))} vs {ongoing ? `same point of ${previousTitle}` : previousTitle}
        </div>
      )}

      {byCategory.length > 0 ? (
        <ul className="mt-5 space-y-2.5">
          {byCategory.map(([cat, amt]) => (
            <li key={cat} className="text-sm">
              <div className="flex justify-between">
                <span>
                  {CATEGORY_EMOJI[cat] ?? "📦"} {cat}
                </span>
                <span className="tabular-nums text-ink-soft">
                  {money(amt)} · {total ? Math.round((amt / total) * 100) : 0}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
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

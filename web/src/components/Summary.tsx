import { useMemo, useState } from "react";
import { money, startOfDay, startOfMonth, startOfWeek } from "../lib/money";
import { CATEGORY_EMOJI, type Expense } from "../lib/types";

type Range = "today" | "week" | "month";

const RANGE_LABEL: Record<Range, string> = { today: "Today", week: "This week", month: "This month" };

export function Summary({ expenses }: { expenses: Expense[] }) {
  const [range, setRange] = useState<Range>("week");

  const { total, byCategory, lastPeriodTotal } = useMemo(() => {
    const now = new Date();
    const from =
      range === "today" ? startOfDay(now) : range === "week" ? startOfWeek(now) : startOfMonth(now);

    // Same-length window just before, for a "vs last" hint.
    let prevFrom: Date;
    if (range === "month") prevFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    else prevFrom = new Date(from.getTime() - (range === "today" ? 1 : 7) * 86_400_000);
    const elapsed = now.getTime() - from.getTime();

    let total = 0;
    let lastPeriodTotal = 0;
    const cats = new Map<string, number>();

    for (const e of expenses) {
      const t = new Date(e.spent_at).getTime();
      if (t >= from.getTime()) {
        total += e.amount;
        cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount);
      } else if (t >= prevFrom.getTime() && t < prevFrom.getTime() + elapsed) {
        lastPeriodTotal += e.amount;
      }
    }

    const byCategory = [...cats.entries()].sort((a, b) => b[1] - a[1]);
    return { total, byCategory, lastPeriodTotal };
  }, [expenses, range]);

  const max = byCategory[0]?.[1] ?? 0;
  const diff = total - lastPeriodTotal;

  return (
    <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
      <div className="flex gap-1 rounded-full bg-bg p-1 text-sm">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-full px-3 py-1.5 font-medium transition ${
              range === r ? "bg-card shadow-sm" : "text-ink-soft"
            }`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <div className="text-4xl font-bold tracking-tight tabular-nums">{money(total)}</div>
        {lastPeriodTotal > 0 && (
          <div className={`mt-1 text-sm ${diff > 0 ? "text-danger" : "text-good"}`}>
            {diff > 0 ? "▲" : "▼"} {money(Math.abs(diff))} vs same point last{" "}
            {range === "today" ? "day" : range}
          </div>
        )}
      </div>

      {byCategory.length > 0 && (
        <ul className="mt-5 space-y-2.5">
          {byCategory.map(([cat, amt]) => (
            <li key={cat} className="text-sm">
              <div className="flex justify-between">
                <span>
                  {CATEGORY_EMOJI[cat] ?? "📦"} {cat}
                </span>
                <span className="tabular-nums text-ink-soft">{money(amt)}</span>
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
      )}
    </section>
  );
}

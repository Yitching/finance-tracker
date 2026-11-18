import { useMemo, useState } from "react";
import { money, moneyWhole, startOfDay } from "../lib/money";
import { periodDays } from "../lib/safeToSpend";
import type { Period } from "../lib/period";
import type { Expense, ExpensePatch } from "../lib/types";
import { RecentList } from "./RecentList";

const HEAT = ["bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4 text-white", "bg-heat-5 text-white"];
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

type Day = { date: Date; total: number; rows: Expense[]; past: boolean; today: boolean };

/**
 * The period as a heat-map calendar, Monday first. Darker = more spent that day,
 * in five steps by quantile so one big night out doesn't wash out every other day.
 * Finished days with nothing logged get a green ring and count as no-spend days.
 * Tap a day to see (and edit) what you bought.
 */
export function SpendingCalendar({
  expenses,
  period,
  filtered,
  onDelete,
  onUpdate,
}: {
  expenses: Expense[];
  period: Period;
  /** Search or filters are on, so the calendar shows matching expenses only. */
  filtered: boolean;
  onDelete: (e: Expense) => void;
  onUpdate: (id: string, patch: ExpensePatch) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const { days, cuts, noSpend, priciest, typical } = useMemo(() => {
    const today = startOfDay().getTime();
    const days: Day[] = Array.from({ length: periodDays(period) }, (_, i) => {
      const date = new Date(period.from.getFullYear(), period.from.getMonth(), period.from.getDate() + i);
      return { date, total: 0, rows: [], past: date.getTime() < today, today: date.getTime() === today };
    });
    for (const e of expenses) {
      const d = startOfDay(new Date(e.spent_at));
      const i = Math.round((d.getTime() - period.from.getTime()) / 86_400_000);
      if (i < 0 || i >= days.length) continue;
      days[i].total += e.amount;
      days[i].rows.push(e);
    }
    const spent = days.filter((d) => d.total > 0).map((d) => d.total).sort((a, b) => a - b);
    const q = (p: number) => spent[Math.floor(p * (spent.length - 1))];
    const priciest = days.reduce<Day | null>((best, d) => (d.total > (best?.total ?? 0) ? d : best), null);
    return {
      days,
      cuts: spent.length ? [q(0.2), q(0.45), q(0.7), q(0.9)] : [],
      noSpend: days.filter((d) => d.past && d.total === 0).length,
      priciest,
      typical: spent.length ? q(0.5) : 0,
    };
  }, [expenses, period]);

  const heat = (v: number) => {
    const step = cuts.findIndex((c) => v <= c);
    return HEAT[step === -1 ? HEAT.length - 1 : step];
  };
  const offset = (period.from.getDay() + 6) % 7;
  const pick = selected !== null ? days[selected] : null;
  const short = (d: Date) => d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });

  return (
    <section className="animate-fade-up rounded-3xl bg-card p-4 shadow-sm ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold">Calendar</h2>
        {filtered && <span className="text-xs text-ink-faint">Matching expenses only</span>}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="No spend" value={`${noSpend} day${noSpend === 1 ? "" : "s"}`} />
        <Stat
          label="Priciest day"
          value={priciest ? moneyWhole(priciest.total) : "—"}
          onClick={priciest ? () => setSelected(days.indexOf(priciest)) : undefined}
        />
        <Stat label="Typical day" value={typical ? moneyWhole(typical) : "—"} />
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5" role="group" aria-label="Spending by day">
        {DOW.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-ink-faint" aria-hidden>
            {d}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((d, i) => {
          const isFirstOfMonth = d.date.getDate() === 1 && i > 0;
          const style = d.total > 0
            ? heat(d.total)
            : d.past
              ? "bg-card text-good ring-2 ring-inset ring-good"
              : d.today
                ? "bg-bg"
                : "border border-dashed border-line text-ink-faint";
          return (
            <button
              key={i}
              onClick={() => setSelected(selected === i ? null : i)}
              aria-pressed={selected === i}
              aria-label={`${short(d.date)}: ${d.total > 0 ? money(d.total) : d.past ? "no spend" : "nothing yet"}`}
              className={`relative grid aspect-square place-items-center rounded-xl text-xs font-bold tabular-nums transition active:scale-90 ${style} ${
                selected === i ? "outline-2 outline-offset-1 outline-ink" : ""
              }`}
            >
              {isFirstOfMonth && (
                <span className="absolute top-0.5 text-[8px] leading-none font-semibold opacity-70">
                  {d.date.toLocaleDateString("en-SG", { month: "short" })}
                </span>
              )}
              {d.date.getDate()}
              {d.today && <span className="absolute bottom-1 size-1 rounded-full bg-current" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1">
          Less
          {HEAT.map((h) => (
            <span key={h} className={`size-3 rounded ${h.split(" ")[0]}`} />
          ))}
          More
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded ring-2 ring-inset ring-good" /> No spend
        </span>
      </div>

      {pick && (
        <div className="animate-fade-up mt-4 border-t border-line pt-4">
          {/* RecentList brings its own day header and total; empty days get one here. */}
          {pick.rows.length === 0 && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">{short(pick.date)}</span>
              <span className={`text-sm font-semibold ${pick.past ? "text-good" : "text-ink-faint"}`}>
                {pick.past ? "No-spend day 🌱" : pick.today ? "Nothing logged yet" : "Still to come"}
              </span>
            </div>
          )}
          {pick.rows.length > 0 && <RecentList expenses={pick.rows} onDelete={onDelete} onUpdate={onUpdate} />}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="truncate text-xs text-ink-soft">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold tabular-nums">{value}</div>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="min-w-0 rounded-2xl bg-bg px-3 py-2 text-left transition active:scale-95">
      {body}
    </button>
  ) : (
    <div className="min-w-0 rounded-2xl bg-bg px-3 py-2">{body}</div>
  );
}

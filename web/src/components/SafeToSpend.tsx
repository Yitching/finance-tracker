import { useMemo, useState } from "react";
import { money, moneyWhole } from "../lib/money";
import { periodTitle, type Period } from "../lib/period";
import { safeToSpend, tomorrowAllowance } from "../lib/safeToSpend";
import type { Expense } from "../lib/types";

/**
 * Home hero: one number, what you can still spend today and stay on budget.
 * Money left before today, spread over the days left, minus what you've logged today.
 * Under it: the month at a glance, and a "what if" slider that shows how tomorrow's
 * share changes before you buy something.
 */
export function SafeToSpend({
  expenses,
  period,
  statementDay,
  budget,
  committed = 0,
}: {
  expenses: Expense[];
  period: Period;
  statementDay: number | null;
  budget: number;
  committed?: number;
}) {
  const s = useMemo(() => safeToSpend(expenses, period, budget, committed), [expenses, period, budget, committed]);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [extra, setExtra] = useState(0);
  if (!s) return null;

  const nextStart = period.to.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
  const used = Math.min(1, budget > 0 ? s.total / budget : 0);
  const over = s.total > budget;
  const tomorrow = tomorrowAllowance(s, budget, extra);
  const sliderMax = Math.max(50, Math.ceil((s.allowance * 3) / 10) * 10);

  const big = s.budgetGone ? money(0) : money(Math.max(0, s.safeToday));
  const sub = s.budgetGone
    ? over
      ? `Over budget by ${money(s.total - budget)}. A fresh ${money(budget)} starts on ${nextStart}.`
      : `The rest of the budget is spoken for. A fresh ${money(budget)} starts on ${nextStart}.`
    : s.safeToday < 0
      ? `${money(-s.safeToday)} over today's share of ${money(s.allowance)}. Tomorrow's share drops to fit.`
      : s.spentToday > 0
        ? `You've logged ${money(s.spentToday)} today, out of a ${money(s.allowance)} share.`
        : `Your share for today is ${money(s.allowance)}. Nothing logged yet.`;

  return (
    <section className="bg-pop-gradient animate-fade-up rounded-3xl p-4 text-white shadow-lg shadow-pink-200/60 dark:shadow-none">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold">Safe to spend today</span>
        <span className="flex-1" />
        <span className="text-xs text-white/85">
          {s.daysLeft} day{s.daysLeft === 1 ? "" : "s"} left
        </span>
      </div>
      <div className="animate-pop mt-1.5 text-5xl font-extrabold tracking-tight tabular-nums">{big}</div>
      <p className="mt-1 text-sm text-white/90">{sub}</p>
      {s.committed > 0 && !s.budgetGone && (
        <p className="mt-0.5 text-xs text-white/80">{money(s.committed)} held back for bills due before {nextStart}.</p>
      )}

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2 text-xs text-white/85">
          <span className="min-w-0 truncate">
            {periodTitle(period, statementDay)} · {moneyWhole(s.total)} of {moneyWhole(budget)}
          </span>
          {s.projected !== null && (
            <span className="shrink-0 tabular-nums">On pace for {moneyWhole(s.projected)}</span>
          )}
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/30" aria-hidden>
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${used * 100}%`, transition: "width 0.8s cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </div>
      </div>

      {!s.budgetGone && tomorrow !== null && (
        <div className="mt-3">
          <button
            onClick={() => setWhatIfOpen((o) => !o)}
            aria-expanded={whatIfOpen}
            className="text-sm font-bold text-white/95 underline decoration-white/40 underline-offset-4 active:scale-95"
          >
            {whatIfOpen ? "Hide what if" : "What if I spend more today?"}
          </button>
          {whatIfOpen && (
            <div className="animate-fade-up mt-2 rounded-2xl bg-white/20 p-3">
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={5}
                value={extra}
                onChange={(e) => setExtra(Number(e.target.value))}
                aria-label="Extra spend today"
                className="range-on-pop w-full"
              />
              <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
                <span>
                  Extra <b className="text-lg tabular-nums">{moneyWhole(extra)}</b>
                </span>
                <span className="text-right">
                  Tomorrow's share <b className="text-lg tabular-nums">{money(tomorrow)}</b>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

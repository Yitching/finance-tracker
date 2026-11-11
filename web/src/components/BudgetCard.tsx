import { useMemo } from "react";
import { money } from "../lib/money";
import { daysLeft, periodRange, periodTitle, type Period } from "../lib/period";

/**
 * Budget ring for the current spending period: total spent vs the monthly cap
 * (all categories, SGD), with what's left or over, and the daily pace.
 * The cap is the statement period when a statement day is set, otherwise the
 * calendar month — same period the Spending screen already shows.
 */
export function BudgetCard({
  total,
  period,
  statementDay,
  budget,
  compact = false,
}: {
  total: number;
  period: Period;
  statementDay: number | null;
  budget: number;
  compact?: boolean;
}) {
  const stats = useMemo(() => {
    const left = daysLeft(period);
    const remaining = budget - total;
    const pct = budget > 0 ? total / budget : 0;
    const now = Date.now();
    const elapsedDays = Math.max(
      1,
      Math.ceil((Math.min(now, period.to.getTime()) - period.from.getTime()) / 86_400_000),
    );
    return {
      left,
      remaining,
      pct,
      over: total > budget,
      dailyLeft: left !== null && left > 0 && remaining > 0 ? remaining / left : 0,
      dailySoFar: total / elapsedDays,
    };
  }, [total, period, budget]);

  const R = 52;
  const C = 2 * Math.PI * R;
  const shown = Math.min(stats.pct, 1);
  const ringColor = stats.over ? "var(--color-danger)" : "var(--color-accent)";

  if (compact) {
    return (
      <section className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-line">
        <svg width="72" height="72" viewBox="0 0 120 120" className="-rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-line)" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - shown)}
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-soft">
            {periodTitle(period, statementDay)} · {money(total)} of {money(budget)}
          </div>
          <div className={`text-lg font-bold tabular-nums ${stats.over ? "text-danger" : ""}`}>
            {stats.over
              ? `${money(-stats.remaining)} over`
              : `${money(stats.remaining)} left`}
          </div>
          <div className="text-xs text-ink-soft">
            {stats.left !== null ? `${stats.left} day${stats.left === 1 ? "" : "s"} left` : "Period ended"}
            {stats.over ? ` · ${money(stats.dailySoFar)}/day so far` : ` · ${money(stats.dailyLeft)}/day left`}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90" aria-hidden>
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-line)" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - shown)}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-xl font-bold tabular-nums">{Math.round(stats.pct * 100)}%</div>
              <div className="text-[11px] text-ink-faint">used</div>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-soft">
            {periodTitle(period, statementDay)} · {periodRange(period)}
          </div>
          <div className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">
            {money(total)} <span className="text-base font-medium text-ink-soft">of {money(budget)}</span>
          </div>
          <div className={`mt-1 text-sm font-medium ${stats.over ? "text-danger" : "text-good"}`}>
            {stats.over ? `${money(-stats.remaining)} over budget` : `${money(stats.remaining)} left`}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-bg px-2 py-2.5">
          <div className="text-xs text-ink-faint">Days left</div>
          <div className="font-bold tabular-nums">{stats.left ?? "—"}</div>
        </div>
        <div className="rounded-2xl bg-bg px-2 py-2.5">
          <div className="text-xs text-ink-faint">{stats.over ? "Spent / day" : "Left / day"}</div>
          <div className="font-bold tabular-nums">
            {money(stats.over ? stats.dailySoFar : stats.dailyLeft)}
          </div>
        </div>
        <div className="rounded-2xl bg-bg px-2 py-2.5">
          <div className="text-xs text-ink-faint">Daily pace</div>
          <div className="font-bold tabular-nums">{money(budget / Math.max(1, Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000)))}</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Budget covers everything this period, all categories. Change it in Settings → Monthly budget.
      </p>
    </section>
  );
}

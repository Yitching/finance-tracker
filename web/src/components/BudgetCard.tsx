import { useMemo } from "react";
import { money } from "../lib/money";
import { daysLeft, periodRange, periodTitle, type Period } from "../lib/period";

/**
 * Budget ring for the current spending period: total spent vs the monthly cap
 * (all categories, SGD), with what's left or over, and the daily pace.
 * Playful Pop: the ring lives on a coral → pink gradient hero card.
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
    const nextStart = period.to.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
    return {
      left,
      remaining,
      pct,
      over: total > budget,
      dailyLeft: left !== null && left > 0 && remaining > 0 ? remaining / left : 0,
      dailySoFar: total / elapsedDays,
      status: total > budget
        ? `Over by ${money(-remaining)} 😅 — fresh ${money(budget)} on ${nextStart}`
        : pct >= 0.9
          ? "Almost at the cap — easy does it!"
          : pct >= 0.5
            ? "Halfway through the month 💪"
            : "On track 🎉",
    };
  }, [total, period, budget]);

  const R = 52;
  const C = 2 * Math.PI * R;
  const shown = Math.min(stats.pct, 1);

  const ring = (size: number, stroke: number) => (
    <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90" aria-hidden>
      <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={stroke} />
      <circle
        cx="60"
        cy="60"
        r={R}
        fill="none"
        stroke="#ffffff"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - shown)}
        style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
    </svg>
  );

  if (compact) {
    return (
      <section className="bg-pop-gradient animate-fade-up rounded-3xl p-4 text-white shadow-lg shadow-pink-200/60 dark:shadow-none">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0 animate-pop">
            {ring(84, 10)}
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="text-lg font-extrabold tabular-nums">{Math.round(stats.pct * 100)}%</div>
                <div className="text-[10px] font-medium text-white/80">used</div>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white/85">
              {periodTitle(period, statementDay)} · {money(total)} of {money(budget)}
            </div>
            <div className="text-xl font-extrabold tabular-nums">
              {stats.over ? `${money(-stats.remaining)} over` : `${money(stats.remaining)} left`}
            </div>
            <div className="text-xs text-white/85">
              {stats.left !== null ? `${stats.left} day${stats.left === 1 ? "" : "s"} left` : "Period ended"}
              {stats.over ? ` · ${money(stats.dailySoFar)}/day so far` : ` · ${money(stats.dailyLeft)}/day left`}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="@container bg-pop-gradient animate-fade-up rounded-3xl p-5 text-white shadow-lg shadow-pink-200/60 dark:shadow-none">
      {/* Side by side when there's room; ring on top on small screens or with large text. */}
      <div className="flex flex-col items-center gap-4 text-center @min-[21rem]:flex-row @min-[21rem]:gap-5 @min-[21rem]:text-left">
        <div className="relative shrink-0 animate-pop">
          {ring(128, 11)}
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-2xl font-extrabold tabular-nums">{Math.round(stats.pct * 100)}%</div>
              <div className="text-[11px] font-medium text-white/80">used</div>
            </div>
          </div>
        </div>
        <div className="w-full min-w-0 flex-1">
          <div className="text-sm text-white/85">
            {periodTitle(period, statementDay)} · {periodRange(period)}
          </div>
          <div className="mt-0.5 truncate text-3xl font-extrabold tracking-tight tabular-nums">{money(total)}</div>
          <div className="text-sm font-semibold text-white/80 tabular-nums">of {money(budget)}</div>
          <div className="mt-1.5 inline-block rounded-full bg-white px-3 py-1 text-xs font-bold text-pink-600">
            {stats.over ? `${money(-stats.remaining)} over budget` : `${money(stats.remaining)} left`}
          </div>
          <p className="mt-2 text-sm text-white/90">{stats.status}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="min-w-0 rounded-2xl bg-white/25 px-1.5 py-2.5">
          <div className="truncate text-xs text-white/80">Days left</div>
          <div className="truncate text-sm font-extrabold tabular-nums @min-[21rem]:text-base">{stats.left ?? "—"}</div>
        </div>
        <div className="min-w-0 rounded-2xl bg-white/25 px-1.5 py-2.5">
          <div className="truncate text-xs text-white/80">{stats.over ? "Spent / day" : "Left / day"}</div>
          <div className="truncate text-sm font-extrabold tabular-nums @min-[21rem]:text-base">
            {money(stats.over ? stats.dailySoFar : stats.dailyLeft)}
          </div>
        </div>
        <div className="min-w-0 rounded-2xl bg-white/25 px-1.5 py-2.5">
          <div className="truncate text-xs text-white/80">Daily pace</div>
          <div className="truncate text-sm font-extrabold tabular-nums @min-[21rem]:text-base">{money(budget / Math.max(1, Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000)))}</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-white/75">
        Budget covers everything this period, all categories. Change it in Settings → Monthly budget.
      </p>
    </section>
  );
}

import { useMemo, useState, type PointerEvent } from "react";
import { money, moneyWhole, startOfDay } from "../lib/money";
import { daysLeft, type Period } from "../lib/period";
import { periodDays } from "../lib/safeToSpend";
import type { Expense } from "../lib/types";

const W = 320;
const H = 160;
const PAD = { l: 40, r: 10, t: 14, b: 22 };

/**
 * Running total across the period against an even pace to the budget.
 * The current period also gets a dashed line to where you'll land at today's rate.
 * Touch or hover the chart to read any day's running total.
 */
export function PaceChart({ expenses, period, budget }: { expenses: Expense[]; period: Period; budget: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => {
    const days = periodDays(period);
    const left = daysLeft(period);
    const shown = left === null ? days : days - left + 1; // days with data so far
    const perDay = new Array<number>(days).fill(0);
    const from = period.from.getTime();
    for (const e of expenses) {
      const i = Math.floor((startOfDay(new Date(e.spent_at)).getTime() - from) / 86_400_000);
      if (i >= 0 && i < days) perDay[i] += e.amount;
    }
    const cum: number[] = [];
    for (let i = 0; i < shown; i++) cum.push((cum[i - 1] ?? 0) + perDay[i]);
    const sum = cum[cum.length - 1] ?? 0;
    const projected = left !== null && shown >= 3 ? (sum / shown) * days : null;
    return { days, cum, total: sum, projected, current: left !== null };
  }, [expenses, period]);

  const { days, cum, total, projected, current } = data;
  const top = Math.max(budget, total, projected ?? 0) * 1.08 || 1;
  const step = niceStep(top / 3);
  const x = (day: number) => PAD.l + (day / days) * (W - PAD.l - PAD.r); // day 0 = period start
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const pts = [[0, 0], ...cum.map((v, i) => [i + 1, v])];
  const line = pts.map(([d, v]) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const pace = (budget / days) * (pts.length - 1);
  const diff = pace - total;
  const dateOf = (i: number) =>
    new Date(period.from.getFullYear(), period.from.getMonth(), period.from.getDate() + i).toLocaleDateString(
      "en-SG",
      { day: "numeric", month: "short" },
    );
  const ticks = [0, Math.round((days - 1) / 2), days - 1];

  function onMove(ev: PointerEvent<SVGSVGElement>) {
    const box = ev.currentTarget.getBoundingClientRect();
    const sx = ((ev.clientX - box.left) / box.width) * W;
    const day = Math.round(((sx - PAD.l) / (W - PAD.l - PAD.r)) * days);
    setHover(day >= 1 && day <= cum.length ? day : null);
  }

  return (
    <section className="animate-fade-up rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold">Pace</h2>
        {cum.length > 0 && (
          <span className={`text-sm font-semibold tabular-nums ${diff >= 0 ? "text-good" : "text-danger"}`}>
            {money(Math.abs(diff))} {diff >= 0 ? "under" : "over"} even pace
          </span>
        )}
      </div>
      <p className="mt-0.5 h-5 truncate text-sm text-ink-soft tabular-nums">
        {hover !== null
          ? `${dateOf(hover - 1)} · ${money(cum[hover - 1])} spent by then · even pace ${money((budget / days) * hover)}`
          : projected !== null
            ? `On pace to land at ${moneyWhole(projected)} of ${moneyWhole(budget)}`
            : current
              ? "A projection appears from day 3."
              : `Finished at ${money(total)} of ${money(budget)}`}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={`Running total ${money(total)} against a budget of ${money(budget)}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pace-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-pop-2)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--color-pop-2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, step, step * 2, step * 3].filter((v) => v <= top).map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--color-ink-faint)">
              {v === 0 ? "0" : `$${v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : v}`}
            </text>
          </g>
        ))}
        {ticks.map((i, k) => (
          <text
            key={i}
            x={x(i + 0.5)}
            y={H - 6}
            textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
            fontSize="9"
            fill="var(--color-ink-faint)"
          >
            {dateOf(i)}
          </text>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(budget)} y2={y(budget)} stroke="var(--color-ink-faint)" strokeWidth="1" />
        <text x={W - PAD.r} y={y(budget) - 4} textAnchor="end" fontSize="9" fill="var(--color-ink-soft)">
          Budget {moneyWhole(budget)}
        </text>
        <line
          x1={x(0)}
          y1={y(0)}
          x2={x(days)}
          y2={y(budget)}
          stroke="var(--color-ink-faint)"
          strokeWidth="1.2"
          strokeDasharray="2 3"
        />
        {cum.length > 0 && (
          <>
            <polygon points={`${x(0)},${y(0)} ${line} ${x(last[0])},${y(0)}`} fill="url(#pace-fill)" />
            <polyline
              points={line}
              fill="none"
              stroke="var(--color-pop-2)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {projected !== null && (
              <line
                x1={x(last[0])}
                y1={y(last[1])}
                x2={x(days)}
                y2={y(projected)}
                stroke="var(--color-pop-2)"
                strokeWidth="2"
                strokeDasharray="4 4"
                opacity="0.6"
              />
            )}
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-ink-faint)" strokeWidth="1" />
            )}
            <circle
              cx={x(hover ?? last[0])}
              cy={y(hover !== null ? cum[hover - 1] : last[1])}
              r="4.5"
              fill="var(--color-pop-2)"
              stroke="var(--color-card)"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-pop-2" /> Spent so far
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-ink-faint" /> Even pace
        </span>
        {projected !== null && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-pop-2 opacity-60" /> Projection
          </span>
        )}
      </div>
    </section>
  );
}

/** 1, 2 or 5 × a power of ten, so axis labels read $200, $500, $1k. */
function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

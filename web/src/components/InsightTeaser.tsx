import { dayLabel, money, moneyWhole } from "../lib/money";
import { useInsight } from "../lib/insight";

/**
 * Insights on Home: the AI headline about your spending, how the period is pacing, and
 * the next bill due. Tap anywhere to open the full Insights screen.
 */
export function InsightTeaser({
  nextBill,
  onOpen,
}: {
  nextBill: { name: string; amount: number; date: Date } | null;
  onOpen: () => void;
}) {
  const { result, busy } = useInsight();
  const projected = result?.totals.projectedThisPeriod ?? null;
  const billWhen = nextBill ? dayLabel(nextBill.date.toISOString()) : "";

  return (
    <button
      onClick={onOpen}
      aria-label="Open Insights"
      className="block w-full rounded-3xl bg-card p-4 text-left shadow-sm ring-1 ring-line transition active:scale-[0.99]"
    >
      <span className="flex items-center gap-2">
        <span className="text-xs font-bold tracking-wide text-ink-faint uppercase">✨ Insights</span>
        <span className="flex-1" />
        <span className="text-sm font-bold text-accent">See all ›</span>
      </span>

      {result ? (
        <span className={`mt-1.5 block font-semibold leading-snug ${busy ? "opacity-60" : ""}`}>{result.headline}</span>
      ) : busy ? (
        <span className="mt-2 block space-y-2" aria-hidden>
          <span className="block h-4 w-11/12 animate-pulse rounded bg-bg" />
          <span className="block h-4 w-3/5 animate-pulse rounded bg-bg" />
        </span>
      ) : (
        <span className="mt-1.5 block font-semibold leading-snug">Charts, spending patterns and your bills radar.</span>
      )}

      {(projected !== null || nextBill) && (
        <span className="mt-3 flex flex-wrap gap-1.5">
          {projected !== null && (
            <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-line">
              On pace for {moneyWhole(projected)}
            </span>
          )}
          {nextBill && (
            <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-line">
              Next bill: {nextBill.name} {money(nextBill.amount)} · {billWhen}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

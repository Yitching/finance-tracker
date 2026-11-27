import { useState } from "react";
import { money, moneyWhole, startOfDay } from "../lib/money";
import { committedUntil, holdsBack, yearlyCost, type BillsOutlook } from "../lib/bills";
import type { RecurringCandidate } from "../lib/recurring";
import { categoryBar } from "../lib/categoryStyle";
import { RepeatIcon } from "./RepeatIcon";

const HORIZON = 30;
const DAY = 86_400_000;
const shortDate = (d: Date) => d.toLocaleDateString("en-SG", { day: "numeric", month: "short" });

/**
 * Recurring charges as a 30-day radar: what's already spoken for before the budget
 * resets, a timeline of what's coming, price rises worth a second look, and bills
 * that stopped turning up. Built from confirmed charges only; nothing is scheduled.
 */
export function BillsRadar({
  outlook,
  hidden,
  seen,
  periodEnd,
  loading,
  onHide,
  onUnhide,
  onSeen,
  onManageRecurring,
}: {
  outlook: BillsOutlook;
  /** Recurring charges you hid ("not a bill" or stopped). */
  hidden: RecurringCandidate[];
  seen: Record<string, number>;
  /** First moment of the next budget period. */
  periodEnd: Date;
  loading: boolean;
  onHide: (key: string) => void;
  onUnhide: (key: string) => void;
  onSeen: (key: string, amount: number) => void;
  /** Open Settings → Recurring expenses. */
  onManageRecurring?: () => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const { upcoming, missed } = outlook;

  if (loading && !upcoming.length) return <div className="h-48 animate-pulse rounded-3xl bg-card" />;

  const today = startOfDay().getTime();
  const committed = committedUntil(upcoming, periodEnd);
  const beforeReset = upcoming.filter((d) => holdsBack(d.bill) && d.date < periodEnd).length;
  const after = upcoming.filter((d) => d.date >= periodEnd).reduce((s, d) => s + d.amount, 0);
  const resetAt = (periodEnd.getTime() - today) / DAY;
  const changes = [...new Map(upcoming.map((d) => [d.bill.key, d.bill])).values()].filter(
    (b) => b.priceChange !== 0 && seen[b.key] !== b.lastAmount,
  );
  // One row per bill, at its next date.
  const rows = [...new Map(upcoming.map((d) => [d.bill.key, d])).values()];
  const pos = (d: Date) => `${Math.min(100, Math.max(0, ((d.getTime() - today) / DAY / HORIZON) * 100))}%`;

  return (
    <div className="space-y-4">
      <section className="bg-pop-gradient animate-fade-up rounded-3xl p-5 text-white shadow-lg shadow-pink-200/60 dark:shadow-none">
        <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold">Bills radar</span>
        <div className="mt-2 text-sm text-white/85">Due before your budget resets on {shortDate(periodEnd)}</div>
        <div className="text-4xl font-extrabold tracking-tight tabular-nums">{money(committed)}</div>
        <p className="mt-1 text-sm text-white/90">
          {beforeReset
            ? `${beforeReset} charge${beforeReset === 1 ? "" : "s"}, held back from Safe to spend.`
            : "Nothing monthly due before then."}
          {after > 0 && ` Then ${moneyWhole(after)} more in the next ${HORIZON} days.`}
        </p>
      </section>

      {changes.map((b) => (
        <section key={b.key} className="animate-fade-up rounded-3xl bg-pink-100 p-4 ring-1 ring-line dark:bg-pink-400/20">
          <p className="font-bold">
            {b.name} went {b.priceChange > 0 ? "up" : "down"} by {money(Math.abs(b.priceChange))}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {money(b.typicalAmount)} → {money(b.lastAmount)} on the last charge.
            {b.priceChange > 0 && ` That's about ${moneyWhole(yearlyCost(b))} more a year.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => onSeen(b.key, b.lastAmount)}
              className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-bg transition active:scale-95"
            >
              Got it
            </button>
            <button
              onClick={() => onHide(b.key)}
              className="rounded-full bg-card px-4 py-2 text-sm font-bold ring-1 ring-line transition active:scale-95"
            >
              I've cancelled it
            </button>
          </div>
        </section>
      ))}

      {missed.map((b) => (
        <section key={b.key} className="animate-fade-up rounded-3xl bg-amber-100 p-4 ring-1 ring-line dark:bg-amber-400/20">
          <p className="font-bold">{b.name} hasn't charged since {shortDate(new Date(b.lastDate))}</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            It was due around {shortDate(new Date(b.nextDate))}. If you cancelled it, stop expecting it.
          </p>
          <button
            onClick={() => onHide(b.key)}
            className="mt-3 rounded-full bg-ink px-4 py-2 text-sm font-bold text-bg transition active:scale-95"
          >
            Stop expecting it
          </button>
        </section>
      ))}

      <section className="animate-fade-up rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-bold">Next {HORIZON} days</h2>
          <span className="text-xs text-ink-faint">
            {shortDate(new Date(today))} – {shortDate(new Date(today + (HORIZON - 1) * DAY))}
          </span>
        </div>

        {upcoming.length > 0 && (
          <div className="relative mx-3.5 mt-4 h-16" aria-hidden>
            <div className="absolute inset-x-0 top-[26px] h-1 rounded-full bg-line" />
            {resetAt > 0 && resetAt < HORIZON && (
              <div className="absolute top-0 bottom-3 w-0.5 bg-good" style={{ left: pos(periodEnd) }}>
                <span className="absolute -top-0.5 left-1 text-[10px] font-bold whitespace-nowrap text-good">New budget</span>
              </div>
            )}
            {upcoming.map((d, i) => (
              <span
                key={`${d.bill.key}-${i}`}
                className={`absolute top-[14px] -ml-3.5 grid size-7 place-items-center rounded-lg border-2 border-card text-[11px] font-extrabold text-white ${categoryBar(d.bill.category)}`}
                style={{ left: pos(d.date) }}
                title={`${d.bill.name} ${money(d.amount)} · ${shortDate(d.date)}`}
              >
                {d.bill.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            <span className="absolute -left-3.5 bottom-0 text-[10px] text-ink-faint">Today</span>
            <span className="absolute -right-3.5 bottom-0 text-[10px] text-ink-faint">+{HORIZON} days</span>
          </div>
        )}

        {rows.length ? (
          <ul className="mt-3 divide-y divide-line">
            {rows.map(({ bill: b, date }) => (
              <li key={b.key}>
                <button
                  onClick={() => setOpenKey(openKey === b.key ? null : b.key)}
                  aria-expanded={openKey === b.key}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white ${categoryBar(b.category)}`}
                  >
                    {b.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">{b.name}</span>
                    <span className="block text-xs text-ink-faint">
                      {date.getTime() === today ? "Due today" : shortDate(date)} · {b.cadence.toLowerCase()}
                      {!holdsBack(b) && " · not held back"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{money(b.expectedAmount)}</span>
                    {b.priceChange !== 0 && (
                      <span className={`block text-xs font-bold ${b.priceChange > 0 ? "text-danger" : "text-good"}`}>
                        {b.priceChange > 0 ? "▲" : "▼"} {money(Math.abs(b.priceChange))}
                      </span>
                    )}
                  </span>
                </button>
                {openKey === b.key && (
                  <div className="animate-fade-up -mt-1 flex items-center gap-3 pb-3 pl-12 text-sm">
                    {b.key.startsWith("rule:") ? (
                      <>
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-ink-soft">
                          <RepeatIcon className="size-3.5 text-accent" />
                          One of your recurring expenses.
                        </span>
                        {onManageRecurring && (
                          <button onClick={onManageRecurring} className="shrink-0 font-bold text-accent">
                            Edit
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 text-ink-soft">
                          Seen {b.occurrences} times, last on {shortDate(new Date(b.lastDate))}.
                        </span>
                        <button onClick={() => onHide(b.key)} className="shrink-0 font-bold text-accent">
                          Not a bill
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            No bills expected in the next {HORIZON} days. A charge shows up here after three similar confirmed charges on
            a steady schedule.
          </p>
        )}

        {hidden.length > 0 && (
          <div className="mt-2 border-t border-line pt-3 text-sm">
            <button onClick={() => setShowHidden((s) => !s)} className="font-medium text-ink-soft">
              {showHidden ? "Hide" : "Show"} {hidden.length} hidden
            </button>
            {showHidden && (
              <ul className="mt-2 space-y-2">
                {hidden.map((b) => (
                  <li key={b.key} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-ink-soft">
                      {b.name} · {money(b.expectedAmount)} {b.cadence.toLowerCase()}
                    </span>
                    <button onClick={() => onUnhide(b.key)} className="shrink-0 font-bold text-accent">
                      Bring back
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      <p className="px-1 text-xs text-ink-faint">
        Monthly and longer bills are held back from Safe to spend. Hidden bills and seen price changes are kept on this
        device.
        {onManageRecurring && (
          <>
            {" "}
            <button onClick={onManageRecurring} className="font-bold text-accent">
              Add a recurring expense
            </button>
          </>
        )}
      </p>
    </div>
  );
}

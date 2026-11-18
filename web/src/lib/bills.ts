import { useCallback, useState } from "react";
import { startOfDay } from "./money";
import type { RecurringCandidate } from "./recurring";

const DAY = 86_400_000;

/** One expected charge on one day. A weekly bill shows up several times in 30 days. */
export type BillDue = { bill: RecurringCandidate; date: Date; amount: number };

export type BillsOutlook = {
  /** Expected charges from today to `horizonDays` ahead, soonest first. */
  upcoming: BillDue[];
  /** Overdue by more than a quarter of their cycle (at least 3 days): likely cancelled. */
  missed: RecurringCandidate[];
};

/** Monthly or longer: steady enough to hold back from Safe to spend. Weekly ones are often groceries. */
export const holdsBack = (b: RecurringCandidate) => b.intervalDays >= 24;

export function billsOutlook(bills: RecurringCandidate[], horizonDays = 30, now = new Date()): BillsOutlook {
  const today = startOfDay(now).getTime();
  const end = today + horizonDays * DAY;
  const upcoming: BillDue[] = [];
  const missed: RecurringCandidate[] = [];
  for (const bill of bills) {
    let next = startOfDay(new Date(bill.nextDate)).getTime();
    const grace = Math.max(3, bill.intervalDays * 0.25) * DAY;
    if (next < today - grace) {
      missed.push(bill);
      continue;
    }
    // A day or two late is normal (weekends, bank cut-offs): expect it today.
    if (next < today) next = today;
    for (let t = next; t < end; t = startOfDay(new Date(t + bill.intervalDays * DAY)).getTime()) {
      upcoming.push({ bill, date: new Date(t), amount: bill.expectedAmount });
    }
  }
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { upcoming, missed };
}

/** Bills expected from today up to (not including) `until` that Safe to spend should hold back. */
export function committedUntil(upcoming: BillDue[], until: Date) {
  return upcoming
    .filter((d) => holdsBack(d.bill) && d.date.getTime() < until.getTime())
    .reduce((s, d) => s + d.amount, 0);
}

/** What a price change costs over a year, from the bill's own cycle. */
export const yearlyCost = (b: RecurringCandidate) => b.priceChange * (365 / b.intervalDays);

type Prefs = {
  /** Keys you said aren't bills, or stopped (no longer expected). */
  hidden: string[];
  /** Price changes you've seen: key → the new amount you acknowledged. */
  seen: Record<string, number>;
};

const KEY = "lazy-ledger.bills";

function load(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    return { hidden: Array.isArray(p.hidden) ? p.hidden : [], seen: p.seen && typeof p.seen === "object" ? p.seen : {} };
  } catch {
    return { hidden: [], seen: {} };
  }
}

/** Your choices on the Bills radar. Kept on this device. */
export function useBillPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const save = useCallback((update: (p: Prefs) => Prefs) => {
    setPrefs((p) => {
      const next = update(p);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Private mode: the choice lasts until the app closes.
      }
      return next;
    });
  }, []);
  return {
    prefs,
    hide: (key: string) => save((p) => ({ ...p, hidden: [...new Set([...p.hidden, key])] })),
    unhide: (key: string) => save((p) => ({ ...p, hidden: p.hidden.filter((k) => k !== key) })),
    markSeen: (key: string, amount: number) => save((p) => ({ ...p, seen: { ...p.seen, [key]: amount } })),
  };
}

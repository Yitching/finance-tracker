import type { Expense } from "./types";

export type RecurringCandidate = {
  /** Stable grouping key (merchant or item, digits and punctuation stripped). */
  key: string;
  name: string;
  category: string;
  cadence: string;
  intervalDays: number;
  /** Median of every charge before the latest one. */
  typicalAmount: number;
  lastAmount: number;
  lastDate: string;
  /** What the next charge should be: the latest amount when the price just changed. */
  expectedAmount: number;
  /** Latest charge minus the usual amount, when it moved by at least 50¢ and 2%; otherwise 0. */
  priceChange: number;
  nextDate: string;
  occurrences: number;
};

const DAY = 86_400_000;
/** Grouping key for a merchant or item name: lower case, digits and punctuation dropped. */
export function nameKey(value: string) { return value.toLowerCase().replace(/\d+/g, " ").replace(/[^a-z]+/g, " ").trim(); }
function keyOf(e: Expense) { return nameKey(e.merchant?.trim() || e.item); }
function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }
function cadence(days: number) { if (days >= 5 && days <= 9) return "Weekly"; if (days >= 24 && days <= 38) return "Monthly"; if (days >= 75 && days <= 110) return "Quarterly"; return `About every ${Math.round(days)} days`; }

/**
 * Conservative: three or more confirmed charges with stable timing and amount.
 * The latest charge may move by up to 50% (a price rise), as long as the ones before it agree.
 */
export function findRecurring(expenses: Expense[]): RecurringCandidate[] {
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) { const key = keyOf(e); if (key) groups.set(key, [...(groups.get(key) ?? []), e]); }
  const found: RecurringCandidate[] = [];
  for (const [key, rows] of groups) {
    if (rows.length < 3) continue;
    const ordered = [...rows].sort((a, b) => new Date(a.spent_at).getTime() - new Date(b.spent_at).getTime());
    const intervals = ordered.slice(1).map((e, i) => (new Date(e.spent_at).getTime() - new Date(ordered[i].spent_at).getTime()) / DAY);
    const interval = median(intervals); const intervalSpread = Math.max(...intervals.map((n) => Math.abs(n - interval))) / interval;
    const earlier = ordered.slice(0, -1).map((e) => e.amount);
    const amount = median(earlier); const amountSpread = Math.max(...earlier.map((a) => Math.abs(a - amount))) / Math.max(amount, 1);
    const last = ordered[ordered.length - 1];
    const lastJump = Math.abs(last.amount - amount) / Math.max(amount, 1);
    if (!Number.isFinite(interval) || interval < 5 || interval > 120 || intervalSpread > 0.25 || amountSpread > 0.15 || lastJump > 0.5) continue;
    const change = last.amount - amount;
    const priceChange = Math.abs(change) >= 0.5 && Math.abs(change) >= amount * 0.02 ? change : 0;
    found.push({
      key,
      name: last.item || last.merchant || "Recurring expense",
      category: last.category,
      cadence: cadence(interval),
      intervalDays: interval,
      typicalAmount: amount,
      lastAmount: last.amount,
      lastDate: last.spent_at,
      expectedAmount: priceChange ? last.amount : amount,
      priceChange,
      nextDate: new Date(new Date(last.spent_at).getTime() + interval * DAY).toISOString(),
      occurrences: ordered.length,
    });
  }
  return found.sort((a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime());
}

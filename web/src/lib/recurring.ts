import type { Expense } from "./types";

export type RecurringCandidate = { name: string; cadence: string; typicalAmount: number; nextDate: string; occurrences: number };
const DAY = 86_400_000;
function keyOf(e: Expense) { const value = e.merchant?.trim() || e.item; return value.toLowerCase().replace(/\d+/g, " ").replace(/[^a-z]+/g, " ").trim(); }
function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }
function cadence(days: number) { if (days >= 5 && days <= 9) return "Weekly"; if (days >= 24 && days <= 38) return "Monthly"; if (days >= 75 && days <= 110) return "Quarterly"; return `About every ${Math.round(days)} days`; }

/** Conservative: three or more confirmed charges with stable timing and amount. */
export function findRecurring(expenses: Expense[]): RecurringCandidate[] {
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) { const key = keyOf(e); if (key) groups.set(key, [...(groups.get(key) ?? []), e]); }
  const found: RecurringCandidate[] = [];
  for (const rows of groups.values()) {
    if (rows.length < 3) continue;
    const ordered = [...rows].sort((a, b) => new Date(a.spent_at).getTime() - new Date(b.spent_at).getTime());
    const intervals = ordered.slice(1).map((e, i) => (new Date(e.spent_at).getTime() - new Date(ordered[i].spent_at).getTime()) / DAY);
    const interval = median(intervals); const intervalSpread = Math.max(...intervals.map((n) => Math.abs(n - interval))) / interval;
    const amount = median(ordered.map((e) => e.amount)); const amountSpread = Math.max(...ordered.map((e) => Math.abs(e.amount - amount))) / Math.max(amount, 1);
    if (!Number.isFinite(interval) || interval < 5 || interval > 120 || intervalSpread > 0.25 || amountSpread > 0.15) continue;
    const last = ordered[ordered.length - 1];
    found.push({ name: last.item || last.merchant || "Recurring expense", cadence: cadence(interval), typicalAmount: amount, nextDate: new Date(new Date(last.spent_at).getTime() + interval * DAY).toISOString(), occurrences: ordered.length });
  }
  return found.sort((a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime());
}

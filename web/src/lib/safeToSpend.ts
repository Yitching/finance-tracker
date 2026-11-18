import { daysLeft as daysLeftIn, type Period } from "./period";
import { startOfDay } from "./money";
import type { Expense } from "./types";

const DAY = 86_400_000;

export type SafeToSpend = {
  /** Spent in the period so far, today included. */
  total: number;
  spentToday: number;
  /** Whole days in the period, and days left including today. */
  daysTotal: number;
  daysLeft: number;
  /** Today's share of what's left: (budget − spent before today − committed) ÷ days left. */
  allowance: number;
  /** What you can still spend today and stay on budget. Negative = over today's share. */
  safeToday: number;
  /** Spent everything (or more) before today: nothing left to share out. */
  budgetGone: boolean;
  /** Where the period lands at the current daily rate; null for the first two days (too noisy). */
  projected: number | null;
  /** Bills expected later this period, held back from the allowance. */
  committed: number;
};

/** Days in a period. Rounded, so a DST shift elsewhere can't make it 29.96 days. */
export const periodDays = (p: Period) => Math.round((p.to.getTime() - p.from.getTime()) / DAY);

/**
 * "Safe to spend today" for the period you're in now, or null for any other period.
 * `committed` is money already spoken for later this period (expected bills).
 */
export function safeToSpend(
  expenses: Expense[],
  period: Period,
  budget: number,
  committed = 0,
  now = new Date(),
): SafeToSpend | null {
  const left = daysLeftIn(period, now);
  if (left === null || left < 1) return null;
  const today = startOfDay(now).getTime();
  const from = period.from.getTime();
  const to = period.to.getTime();
  let before = 0;
  let spentToday = 0;
  for (const e of expenses) {
    const t = new Date(e.spent_at).getTime();
    if (t < from || t >= to) continue;
    if (t < today) before += e.amount;
    else spentToday += e.amount;
  }
  const daysTotal = periodDays(period);
  const elapsed = daysTotal - left + 1;
  const pool = budget - before - committed;
  const allowance = Math.max(0, pool) / left;
  const total = before + spentToday;
  return {
    total,
    spentToday,
    daysTotal,
    daysLeft: left,
    allowance,
    safeToday: allowance - spentToday,
    budgetGone: pool <= 0,
    projected: elapsed >= 3 ? (total / elapsed) * daysTotal : null,
    committed,
  };
}

/** Tomorrow's daily allowance if you spend `extra` more today. Null on the last day. */
export function tomorrowAllowance(s: SafeToSpend, budget: number, extra: number) {
  if (s.daysLeft <= 1) return null;
  return Math.max(0, budget - s.total - s.committed - extra) / (s.daysLeft - 1);
}

import type { Expense, PendingExpense } from "./types";

/** You typed it yourself around the time the bank alert came in. */
const CONFIRMED_WINDOW = 30 * 60_000;
/** Two alerts for one payment (e.g. card app + bank app). */
const PENDING_WINDOW = 5 * 60_000;

const cents = (n: number) => Math.round(n * 100);
const time = (e: PendingExpense) => new Date(e.spent_at).getTime();

/**
 * For each pending expense, the expense it most likely repeats, if any:
 * same amount as something already logged within 30 minutes, or as an
 * earlier pending alert within 5 minutes. Alerts with no amount can't be matched.
 */
export function findDuplicates(pending: PendingExpense[], confirmed: Expense[]) {
  const out = new Map<string, PendingExpense>();
  for (const p of pending) {
    if (p.amount === null) continue;
    const amount = cents(p.amount);
    const near = (e: PendingExpense, window: number) =>
      e.amount !== null && cents(e.amount) === amount && Math.abs(time(e) - time(p)) <= window;
    const match =
      confirmed.find((e) => near(e, CONFIRMED_WINDOW)) ??
      pending.find((e) => e.id !== p.id && e.created_at < p.created_at && near(e, PENDING_WINDOW));
    if (match) out.set(p.id, match);
  }
  return out;
}

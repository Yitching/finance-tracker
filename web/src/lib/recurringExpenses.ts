import { createContext, useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { dateValue, onDay } from "./money";
import type { RecurringCandidate } from "./recurring";
import type { Expense } from "./types";

/** Charges that arrive from your bank by themselves; repeating one would count it twice. */
export const BANK_SOURCES = ["notification", "email", "statement"];

/** "Repeat this" from the expense editor; null until the app provides it. */
export const RepeatContext = createContext<((e: Expense, cadence: Cadence) => Promise<void>) | null>(null);

/**
 * Recurring expenses you set up yourself: "Rent, $1,800, monthly from 1 Dec".
 * When the app opens it adds every occurrence that has come due since it last looked
 * (straight into your spending, or into the Inbox to confirm). `logged_through` remembers
 * how far it got, so an expense you delete stays deleted, and the database refuses a
 * second copy of the same date if two phones catch up at once.
 */

export type Cadence = "weekly" | "monthly" | "yearly";

export type RecurringExpense = {
  id: string;
  item: string;
  amount: number;
  category: string;
  cadence: Cadence;
  /** First due date, "YYYY-MM-DD". Monthly and yearly ones repeat on its day. */
  start_date: string;
  end_date: string | null;
  to_inbox: boolean;
  paused: boolean;
  /** Every due date up to and including this one has been handled. */
  logged_through: string | null;
};

export type RecurringDraft = Omit<RecurringExpense, "id" | "logged_through"> & {
  id?: string;
  logged_through?: string | null;
};

const parse = (v: string) => v.split("-").map(Number) as [number, number, number];
const fmt = (y: number, m0: number, d: number) => {
  const t = new Date(Date.UTC(y, m0, d));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};
const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** The k-th due date (k = 0 is the start). Short months use their last day. */
function nth(rule: Pick<RecurringExpense, "cadence" | "start_date">, k: number) {
  const [y, m, d] = parse(rule.start_date);
  if (rule.cadence === "weekly") return fmt(y, m - 1, d + 7 * k);
  if (rule.cadence === "monthly") {
    const t = new Date(Date.UTC(y, m - 1 + k, 1));
    return fmt(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, daysIn(t.getUTCFullYear(), t.getUTCMonth())));
  }
  return fmt(y + k, m - 1, Math.min(d, daysIn(y + k, m - 1)));
}

/** Due dates after `after` (exclusive) up to `through` (inclusive), oldest first. */
export function dueDates(rule: RecurringExpense, after: string | null, through: string, limit = 60) {
  const last = rule.end_date && rule.end_date < through ? rule.end_date : through;
  const out: string[] = [];
  for (let k = 0; out.length < limit && k < 5000; k++) {
    const d = nth(rule, k);
    if (d > last) break;
    if (!after || d > after) out.push(d);
  }
  return out;
}

/** The next due date still to come (after what's been added), or null if it has ended. */
export function nextDue(rule: RecurringExpense, today = dateValue()) {
  const yesterday = fmt(...(([y, m, d]) => [y, m - 1, d - 1] as const)(parse(today)));
  const after = rule.logged_through && rule.logged_through > yesterday ? rule.logged_through : yesterday;
  for (let k = 0; k < 5000; k++) {
    const d = nth(rule, k);
    if (rule.end_date && d > rule.end_date) return null;
    if (d > after) return d;
  }
  return null;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "Monthly on the 25th", "Weekly on Tuesdays", "Yearly on 3 Mar". */
export function describeCadence(rule: Pick<RecurringExpense, "cadence" | "start_date">) {
  const [y, m, d] = parse(rule.start_date);
  const date = new Date(y, m - 1, d);
  if (rule.cadence === "weekly") return `Weekly on ${date.toLocaleDateString("en-SG", { weekday: "long" })}s`;
  if (rule.cadence === "monthly") return `Monthly on the ${ordinal(d)}`;
  return `Yearly on ${date.toLocaleDateString("en-SG", { day: "numeric", month: "short" })}`;
}

const INTERVAL: Record<Cadence, number> = { weekly: 7, monthly: 30.44, yearly: 365.25 };

/** A recurring expense as a Bills radar entry, with its exact next date. */
export function asBill(rule: RecurringExpense): RecurringCandidate | null {
  const next = nextDue(rule);
  if (!next || rule.paused) return null;
  return {
    key: `rule:${rule.id}`,
    name: rule.item,
    category: rule.category,
    cadence: rule.cadence[0].toUpperCase() + rule.cadence.slice(1),
    intervalDays: INTERVAL[rule.cadence],
    typicalAmount: rule.amount,
    lastAmount: rule.amount,
    lastDate: onDay(rule.logged_through ?? rule.start_date).toISOString(),
    expectedAmount: rule.amount,
    priceChange: 0,
    nextDate: onDay(next).toISOString(),
    occurrences: 0,
  };
}

const toRule = (r: RecurringExpense): RecurringExpense => ({ ...r, amount: Number(r.amount) });

/** Your recurring expenses: load, save, delete, and catch up on what's due. */
export function useRecurringExpenses() {
  const [rules, setRules] = useState<RecurringExpense[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("recurring_expenses").select("*").order("created_at");
    if (!error && data) setRules(data.map(toRule));
    setLoaded(true); // also when the migration isn't pushed yet: just no recurring expenses
    return error ? [] : (data ?? []).map(toRule);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (draft: RecurringDraft) => {
      const { id, ...fields } = draft;
      const query = id
        ? supabase.from("recurring_expenses").update(fields).eq("id", id)
        : supabase.from("recurring_expenses").insert(fields);
      const { data, error } = await query.select().single();
      if (error) throw error;
      await load();
      return toRule(data as RecurringExpense);
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      setRules((rs) => rs.filter((r) => r.id !== id));
      const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    [],
  );

  /**
   * Add every due date since the last catch-up. Returns how many were added and how many
   * went to the Inbox. Safe to call often: dates already handled are skipped.
   */
  const catchUp = useCallback(async () => {
    const today = dateValue();
    const current = await load();
    let added = 0;
    let toInbox = 0;
    for (const rule of current) {
      if (rule.paused) continue;
      const after = rule.logged_through ?? fmt(...(([y, m, d]) => [y, m - 1, d - 1] as const)(parse(rule.start_date)));
      const dates = dueDates(rule, after, today);
      if (!dates.length) continue;
      const { data, error } = await supabase
        .from("expenses")
        .upsert(
          dates.map((d) => ({
            item: rule.item,
            amount: rule.amount,
            category: rule.category,
            source: "recurring",
            status: rule.to_inbox ? "pending" : "confirmed",
            spent_at: onDay(d).toISOString(),
            recurring_id: rule.id,
            recurring_on: d,
          })),
          { onConflict: "recurring_id,recurring_on", ignoreDuplicates: true },
        )
        .select("id");
      if (error) continue; // try again next time; logged_through stays put
      const n = data?.length ?? 0;
      added += n;
      if (rule.to_inbox) toInbox += n;
      await supabase.from("recurring_expenses").update({ logged_through: dates[dates.length - 1] }).eq("id", rule.id);
    }
    if (added) await load();
    return { added, toInbox };
  }, [load]);

  return { rules, loaded, save, remove, catchUp };
}

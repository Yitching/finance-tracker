import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { PeriodEnds } from "./period";

// Cached locally so periods render correctly before the network answers.
const KEY = "lazy-ledger.statement-day";

function cached(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return n >= 1 && n <= 31 ? n : null;
  } catch {
    return null;
  }
}

function cache(day: number | null) {
  try {
    if (day) localStorage.setItem(KEY, String(day));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the database copy still works.
  }
}

/** Your card's statement day (1–31), or null for calendar months. Synced via user_settings. */
export function useStatementDay() {
  const [day, setDay] = useState<number | null>(() => cached());

  useEffect(() => {
    let alive = true;
    void supabase
      .from("user_settings")
      .select("statement_day")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return; // e.g. migration not pushed yet: keep the cached value
        const next = data?.statement_day ?? null;
        setDay(next);
        cache(next);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: number | null) => {
    setDay(next);
    cache(next);
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, statement_day: next, updated_at: new Date().toISOString() });
    if (error) throw error;
  }, []);

  return [day, save] as const;
}

const BUDGET_KEY = "lazy-ledger.monthly-budget";
export const DEFAULT_BUDGET = 1200;

function cachedBudget(): number | null {
  try {
    const n = Number(localStorage.getItem(BUDGET_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function cacheBudget(budget: number | null) {
  try {
    if (budget) localStorage.setItem(BUDGET_KEY, String(budget));
    else localStorage.removeItem(BUDGET_KEY);
  } catch {
    // Private mode: the database copy still works.
  }
}

/** Monthly budget cap in SGD for the current spending period, all categories. Null until saved. Synced via user_settings. */
export function useMonthlyBudget() {
  const [budget, setBudget] = useState<number | null>(() => cachedBudget());

  useEffect(() => {
    let alive = true;
    void supabase
      .from("user_settings")
      .select("monthly_budget")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return; // e.g. migration not pushed yet: keep the cached value
        const next = data?.monthly_budget == null ? null : Number(data.monthly_budget);
        if (next !== null && (!Number.isFinite(next) || next <= 0)) return;
        setBudget(next);
        cacheBudget(next);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: number | null) => {
    if (next !== null && (!Number.isFinite(next) || next <= 0)) return;
    setBudget(next);
    cacheBudget(next);
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, monthly_budget: next, updated_at: new Date().toISOString() });
    if (error) throw error;
  }, []);

  return [budget, save] as const;
}

const ENDS_KEY = "lazy-ledger.period-ends";

/** Only well-formed entries: "YYYY-MM" → "YYYY-MM-DD". */
function cleanEnds(value: unknown): PeriodEnds | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: PeriodEnds = {};
  for (const [k, v] of Object.entries(value)) {
    if (/^\d{4}-\d{2}$/.test(k) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v;
  }
  return out;
}

function cachedEnds(): PeriodEnds {
  try {
    return cleanEnds(JSON.parse(localStorage.getItem(ENDS_KEY) ?? "null")) ?? {};
  } catch {
    return {};
  }
}

/** Periods you ended early when the statement came out. Synced via user_settings. */
export function usePeriodEnds() {
  const [ends, setEnds] = useState<PeriodEnds>(cachedEnds);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("user_settings")
      .select("period_ends")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return; // e.g. migration not pushed yet: keep the cached value
        const next = cleanEnds(data?.period_ends);
        if (!next) return;
        setEnds(next);
        try {
          localStorage.setItem(ENDS_KEY, JSON.stringify(next));
        } catch {
          // Private mode: the database copy still works.
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: PeriodEnds) => {
    setEnds(next);
    try {
      localStorage.setItem(ENDS_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the database copy still works.
    }
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, period_ends: next, updated_at: new Date().toISOString() });
    if (error) throw error;
  }, []);

  return [ends, save] as const;
}

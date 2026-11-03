import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

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

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Expense, Remembered } from "./types";

const HISTORY_DAYS = 62;

export function useLedger() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [memory, setMemory] = useState<Remembered[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
    const [exp, mem] = await Promise.all([
      supabase
        .from("expenses")
        .select("*")
        .eq("status", "confirmed")
        .gte("spent_at", since)
        .order("spent_at", { ascending: false }),
      supabase.from("price_memory").select("*").order("use_count", { ascending: false }).limit(200),
    ]);
    if (exp.data) setExpenses(exp.data.map((e) => ({ ...e, amount: Number(e.amount) })));
    if (mem.data) setMemory(mem.data.map((m) => ({ ...m, last_amount: Number(m.last_amount) })));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Free text → AI → saved rows. */
  const addText = useCallback(
    async (text: string) => {
      const { data, error } = await supabase.functions.invoke<{
        saved: Expense[];
        missingPrice: string[];
      }>("parse-expense", { body: { text } });
      if (error) throw error;
      await refresh();
      return data ?? { saved: [], missingPrice: [] };
    },
    [refresh],
  );

  /** Direct insert, no AI. Used by quick chips and "how much was X?" prompts. */
  const addDirect = useCallback(
    async (item: string, amount: number, category: string, source = "manual") => {
      const { data, error } = await supabase
        .from("expenses")
        .insert({ item, amount, category, source })
        .select()
        .single();
      if (error) throw error;
      await supabase.rpc("remember_item", { p_name: item, p_amount: amount, p_category: category });
      await refresh();
      return data as Expense;
    },
    [refresh],
  );

  const remove = useCallback(async (ids: string[]) => {
    setExpenses((prev) => prev.filter((e) => !ids.includes(e.id)));
    await supabase.from("expenses").delete().in("id", ids);
  }, []);

  const restore = useCallback(
    async (rows: Expense[]) => {
      await supabase.from("expenses").insert(
        rows.map(({ id, item, amount, category, spent_at, source, raw_input }) => ({
          id,
          item,
          amount,
          category,
          spent_at,
          source,
          raw_input,
        })),
      );
      await refresh();
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Pick<Expense, "item" | "amount" | "category">>) => {
      setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      await supabase.from("expenses").update(patch).eq("id", id);
    },
    [],
  );

  return { expenses, memory, loading, addText, addDirect, remove, restore, update, refresh };
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Expense, Remembered } from "./types";

const HISTORY_DAYS = 62;

const toExpense = (e: Expense) => ({ ...e, amount: Number(e.amount) });

export function useLedger() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pending, setPending] = useState<Expense[]>([]);
  const [memory, setMemory] = useState<Remembered[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
    const [exp, pend, mem] = await Promise.all([
      supabase
        .from("expenses")
        .select("*")
        .eq("status", "confirmed")
        .gte("spent_at", since)
        .order("spent_at", { ascending: false }),
      supabase
        .from("expenses")
        .select("*")
        .eq("status", "pending")
        .order("spent_at", { ascending: false }),
      supabase.from("price_memory").select("*").order("use_count", { ascending: false }).limit(200),
    ]);
    if (exp.data) setExpenses(exp.data.map(toExpense));
    if (pend.data) setPending(pend.data.map(toExpense));
    if (mem.data) setMemory(mem.data.map((m) => ({ ...m, last_amount: Number(m.last_amount) })));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Captured charges arrive while the app is in the background; pick them up on return.
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
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
    setPending((prev) => prev.filter((e) => !ids.includes(e.id)));
    await supabase.from("expenses").delete().in("id", ids);
  }, []);

  const restore = useCallback(
    async (rows: Expense[]) => {
      await supabase.from("expenses").insert(
        rows.map(({ id, item, amount, category, spent_at, source, status, raw_input, merchant }) => ({
          id,
          item,
          amount,
          category,
          spent_at,
          source,
          status,
          raw_input,
          merchant,
        })),
      );
      await refresh();
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Pick<Expense, "item" | "amount" | "category">>) => {
      const apply = (prev: Expense[]) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      setExpenses(apply);
      setPending(apply);
      const { data: row } = await supabase.from("expenses").update(patch).eq("id", id).select().single();
      // Renaming a captured charge teaches its merchant: "GRAB*A-6XYZ" → Grab / Transport from now on.
      if (row?.merchant && (patch.item || patch.category)) {
        await supabase.rpc("remember_merchant", {
          p_merchant: row.merchant,
          p_name: row.item,
          p_category: row.category,
        });
        await refresh(); // other pending charges from this merchant were renamed too
      }
    },
    [refresh],
  );

  /** Inbox: keep captured charges ("confirmed"), or put them back ("pending") for Undo. */
  const setStatus = useCallback(
    async (ids: string[], status: Expense["status"]) => {
      if (status === "confirmed") setPending((prev) => prev.filter((e) => !ids.includes(e.id)));
      await supabase.from("expenses").update({ status }).in("id", ids);
      await refresh();
    },
    [refresh],
  );

  return {
    expenses,
    pending,
    memory,
    loading,
    addText,
    addDirect,
    remove,
    restore,
    update,
    setStatus,
    refresh,
  };
}

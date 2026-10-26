import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Expense, ExpensePatch, PendingExpense, Remembered } from "./types";

const HISTORY_DAYS = 62;

const toExpense = (e: Expense) => ({ ...e, amount: Number(e.amount) });
const toPending = (e: PendingExpense) => ({ ...e, amount: e.amount === null ? null : Number(e.amount) });

export function useLedger() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pending, setPending] = useState<PendingExpense[]>([]);
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
    if (pend.data) setPending(pend.data.map(toPending));
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

  /** Free text → AI → saved rows. `spentAt` (ISO) puts them all on a day you picked. */
  const addText = useCallback(
    async (text: string, spentAt?: string) => {
      const { data, error } = await supabase.functions.invoke<{
        saved: Expense[];
        missingPrice: string[];
      }>("parse-expense", { body: { text, spentAt } });
      if (error) throw error;
      await refresh();
      return data ?? { saved: [], missingPrice: [] };
    },
    [refresh],
  );

  /** Receipt photo (base64 JPEG) → AI → pending rows in the Inbox. */
  const addReceipt = useCallback(
    async (image: string) => {
      const { data, error } = await supabase.functions.invoke<{
        saved: Expense[];
        store: string | null;
        notReceipt?: boolean;
      }>("parse-receipt", { body: { image, mediaType: "image/jpeg" } });
      if (error) throw error;
      await refresh();
      return data ?? { saved: [], store: null };
    },
    [refresh],
  );

  /** Direct insert, no AI. Used by quick chips and "how much was X?" prompts. */
  const addDirect = useCallback(
    async (item: string, amount: number, category: string, source = "manual", spentAt?: string) => {
      const { data, error } = await supabase
        .from("expenses")
        .insert({ item, amount, category, source, ...(spentAt ? { spent_at: spentAt } : {}) })
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
    async (rows: PendingExpense[]) => {
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
    async (id: string, patch: ExpensePatch) => {
      const apply = <T extends PendingExpense>(prev: T[]) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
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
      } else if (patch.spent_at) {
        await refresh(); // moved to another day: re-sort
      }
    },
    [refresh],
  );

  /**
   * Inbox: keep captured charges ("confirmed"), or put them back ("pending") for Undo.
   * `amount` fills in a charge that arrived without one, in the same update.
   */
  const setStatus = useCallback(
    async (ids: string[], status: Expense["status"], amount?: number) => {
      if (status === "confirmed") setPending((prev) => prev.filter((e) => !ids.includes(e.id)));
      await supabase
        .from("expenses")
        .update(amount === undefined ? { status } : { status, amount })
        .in("id", ids);
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
    addReceipt,
    addDirect,
    remove,
    restore,
    update,
    setStatus,
    refresh,
  };
}

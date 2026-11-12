import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { CATEGORIES, CATEGORY_EMOJI } from "./types";

/**
 * Pots: mini-budgets inside the monthly cap.
 *
 * A spending pot caps one category for the current period (e.g. Eating out →
 * Food, $350). Progress comes from real spending, so it fills, warns and tips
 * over as you log. A saving pot is a target you top up yourself (e.g. Furano
 * fun money, $500) — it isn't tied to a category.
 */

export type PotKind = "spend" | "save";

export type Pot = {
  id: string;
  name: string;
  emoji: string;
  kind: PotKind;
  /** Spending pots only: the category this pot tracks. */
  category: string | null;
  /** The cap (spending) or the target (saving), in SGD. */
  amount: number;
  /** Saving pots only: how much has been put in so far. */
  saved: number;
};

export const DEFAULT_POTS: Pot[] = [
  { id: "eating-out", name: "Eating out", emoji: "🍜", kind: "spend", category: "Food", amount: 350, saved: 0 },
  { id: "groceries", name: "Groceries", emoji: "🛒", kind: "spend", category: "Groceries", amount: 200, saved: 0 },
  { id: "fun", name: "Fun stuff", emoji: "🛍️", kind: "spend", category: "Shopping", amount: 250, saved: 0 },
  { id: "furano", name: "Furano fun money", emoji: "✈️", kind: "save", category: null, amount: 500, saved: 0 },
];

export const SAVE_EMOJIS = ["✈️", "🎿", "🏖️", "🎁", "💰", "🧳", "🏠", "🚗"];

/** Emoji to use when a new spending pot doesn't pick one. */
export function emojiForCategory(category: string): string {
  return CATEGORY_EMOJI[category] ?? "🫙";
}

function isPot(value: unknown): value is Pot {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id) return false;
  if (typeof p.name !== "string" || !p.name.trim()) return false;
  if (typeof p.emoji !== "string" || !p.emoji) return false;
  if (p.kind !== "spend" && p.kind !== "save") return false;
  if (p.kind === "spend" && (typeof p.category !== "string" || !CATEGORIES.includes(p.category as (typeof CATEGORIES)[number]))) return false;
  if (typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount <= 0) return false;
  if (typeof p.saved !== "number" || !Number.isFinite(p.saved) || p.saved < 0) return false;
  return true;
}

function sanitize(value: unknown): Pot[] | null {
  if (!Array.isArray(value)) return null;
  const pots = value.filter(isPot);
  // A stored list that lost everything is treated as "never set", so the
  // defaults show instead of an empty screen.
  return pots.length === value.length ? pots : pots.length ? pots : null;
}

const POTS_KEY = "lazy-ledger.pots";

function cached(): Pot[] | null {
  try {
    return sanitize(JSON.parse(localStorage.getItem(POTS_KEY) ?? "null"));
  } catch {
    return null;
  }
}

function cache(pots: Pot[]) {
  try {
    localStorage.setItem(POTS_KEY, JSON.stringify(pots));
  } catch {
    // Private mode: the database copy still works.
  }
}

/** Pots, synced via user_settings. Defaults until you save your own. */
export function usePots() {
  const [pots, setPots] = useState<Pot[]>(() => cached() ?? DEFAULT_POTS);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("user_settings")
      .select("pots")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return; // e.g. migration not pushed yet: keep the cached value
        const next = sanitize(data?.pots);
        if (next === null) return; // never set: keep defaults
        setPots(next);
        cache(next);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: Pot[]) => {
    const clean = next.filter(isPot);
    setPots(clean);
    cache(clean);
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, pots: clean, updated_at: new Date().toISOString() });
    if (error) throw error;
  }, []);

  /** Add money to a saving pot (and persist it). */
  const addToPot = useCallback(
    async (id: string, amount: number) => {
      const next = pots.map((p) =>
        p.id === id && p.kind === "save" ? { ...p, saved: Math.round((p.saved + amount) * 100) / 100 } : p,
      );
      await save(next);
    },
    [pots, save],
  );

  return [pots, save, addToPot] as const;
}

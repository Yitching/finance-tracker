import { createContext, useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { CATEGORIES, type Expense } from "./types";

/**
 * Card rewards: which card to use for what, and what each card has earned this period.
 *
 * A card earns `bonusRate` on its bonus categories, up to `bonusCap` of spend a period,
 * and `baseRate` on everything else. Some cards only pay the bonus once you've spent
 * `minSpend` on them in the period. Cashback rates are percentages; miles rates are
 * miles per dollar (mpd), valued at `mileValue` cents a mile so the two compare.
 *
 * Caps and minimums follow the app's period (calendar month, or your statement cycle
 * if you set one), which is close to, but not always exactly, each bank's own month.
 */

export type CardUnit = "cashback" | "miles";

export type Card = {
  id: string;
  name: string;
  /** Last four digits, used to match bank alerts to the card. "" if unknown. */
  last4: string;
  unit: CardUnit;
  /** % cashback, or miles per dollar. */
  baseRate: number;
  bonusRate: number;
  bonusCategories: string[];
  /** Spend per period that earns the bonus rate; null = no cap. */
  bonusCap: number | null;
  /** Spend per period needed before the bonus pays; null = none. */
  minSpend: number | null;
};

export type CardSettings = { cards: Card[]; mileValue: number };

export const DEFAULT_MILE_VALUE = 1.5;
const EMPTY: CardSettings = { cards: [], mileValue: DEFAULT_MILE_VALUE };

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const capOrNull = (v: unknown) => v === null || (num(v) && (v as number) > 0);

export function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    !!c.id &&
    typeof c.name === "string" &&
    !!c.name.trim() &&
    typeof c.last4 === "string" &&
    (c.last4 === "" || /^\d{4}$/.test(c.last4)) &&
    (c.unit === "cashback" || c.unit === "miles") &&
    num(c.baseRate) &&
    num(c.bonusRate) &&
    Array.isArray(c.bonusCategories) &&
    c.bonusCategories.every((x) => CATEGORIES.includes(x as (typeof CATEGORIES)[number])) &&
    capOrNull(c.bonusCap) &&
    capOrNull(c.minSpend)
  );
}

function sanitize(value: unknown): CardSettings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.cards)) return null;
  const mileValue = num(v.mileValue) && (v.mileValue as number) > 0 ? (v.mileValue as number) : DEFAULT_MILE_VALUE;
  return { cards: v.cards.filter(isCard), mileValue };
}

const KEY = "lazy-ledger.card-rewards";

function cached(): CardSettings | null {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return null;
  }
}

function cache(s: CardSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: the database copy still works.
  }
}

/** Your cards and the value of a mile, synced via user_settings. */
export function useCardSettings() {
  const [settings, setSettings] = useState<CardSettings>(() => cached() ?? EMPTY);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("user_settings")
      .select("card_rewards")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return; // e.g. migration not pushed yet: keep the cached value
        const next = sanitize(data?.card_rewards);
        if (!next) return;
        setSettings(next);
        cache(next);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: CardSettings) => {
    const clean = { cards: next.cards.filter(isCard), mileValue: next.mileValue };
    setSettings(clean);
    cache(clean);
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, card_rewards: clean, updated_at: new Date().toISOString() });
    if (error) throw error;
  }, []);

  return [settings, save] as const;
}

/** Your cards, for the card picker when editing an expense. */
export const CardsContext = createContext<Card[]>([]);

/** "ending 1234", "ending in 1234", "**1234", "xx1234", "Card 1234", "card no. -1234". */
function alertMentions(text: string, last4: string) {
  return new RegExp(`(?:ending(?:\\s+(?:in|with))?|[*x•.]{2,}|card(?:\\s+no\\.?)?)[\\s:#-]*${last4}(?!\\d)`, "i").test(
    text,
  );
}

/** The card that paid: the one you picked, or the one whose last four digits the bank alert names. */
export function cardFor(e: Expense, cards: Card[]): Card | null {
  if (e.card) return cards.find((c) => c.id === e.card) ?? null;
  const text = `${e.raw_input ?? ""} ${e.merchant ?? ""}`;
  if (!text.trim()) return null;
  return cards.find((c) => c.last4 && alertMentions(text, c.last4)) ?? null;
}

export type CardProgress = {
  card: Card;
  spend: number;
  charges: number;
  /** Spend in bonus categories that earned (or will earn, once unlocked) the bonus rate. */
  bonusSpend: number;
  /** Bonus spend left this period; null = no cap. */
  bonusRoom: number | null;
  unlocked: boolean;
  /** Spend still needed to unlock the bonus. */
  toUnlock: number;
  /** Miles or cashback dollars earned so far. */
  earned: number;
  /** Earned, in dollars. */
  value: number;
  /** What unlocking the minimum would add, in dollars. */
  lockedValue: number;
};

/** Cashback dollars per $1, or miles per $1 converted at `mileValue` cents: both as dollars per dollar. */
export const valuePerDollar = (card: Card, rate: number, mileValue: number) =>
  card.unit === "cashback" ? rate / 100 : (rate * mileValue) / 100;

export function cardProgress(card: Card, rows: Expense[], mileValue: number): CardProgress {
  const spend = rows.reduce((s, e) => s + e.amount, 0);
  const inBonus = rows.filter((e) => card.bonusCategories.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  const bonusSpend = card.bonusCap === null ? inBonus : Math.min(inBonus, card.bonusCap);
  const unlocked = !card.minSpend || spend >= card.minSpend;
  const earnedAt = (bonusPays: boolean) => {
    const atBonus = bonusPays ? bonusSpend : 0;
    const units = card.unit === "cashback" ? 0.01 : 1;
    return (atBonus * card.bonusRate + (spend - atBonus) * card.baseRate) * units;
  };
  const earned = earnedAt(unlocked);
  const toValue = (units: number) => (card.unit === "cashback" ? units : (units * mileValue) / 100);
  return {
    card,
    spend,
    charges: rows.length,
    bonusSpend,
    bonusRoom: card.bonusCap === null ? null : Math.max(0, card.bonusCap - inBonus),
    unlocked,
    toUnlock: unlocked ? 0 : (card.minSpend ?? 0) - spend,
    earned,
    value: toValue(earned),
    lockedValue: unlocked ? 0 : toValue(earnedAt(true) - earned),
  };
}

export type CardPick = {
  card: Card;
  /** Value of the next dollar on this card, as a percentage. */
  pct: number;
  rateLabel: string;
  /** Short reason or warning, e.g. "$620 bonus room left". */
  note: string | null;
  onBonus: boolean;
};

const rateText = (card: Card, rate: number) =>
  card.unit === "cashback" ? `${+rate.toFixed(2)}% cashback` : `${+rate.toFixed(2)} mpd`;

/** Cards ranked by what the next dollar in `category` earns, best first. */
export function rankCards(category: string, progress: CardProgress[], mileValue: number): CardPick[] {
  return progress
    .map(({ card, bonusRoom, unlocked, toUnlock }) => {
      const bonusCategory = card.bonusCategories.includes(category) && card.bonusRate > card.baseRate;
      const capHit = bonusCategory && bonusRoom !== null && bonusRoom <= 0;
      const onBonus = bonusCategory && !capHit;
      const rate = onBonus ? card.bonusRate : card.baseRate;
      const note = capHit
        ? "Bonus cap reached this period"
        : onBonus && !unlocked
          ? `Bonus unlocks after $${Math.ceil(toUnlock)} more spend`
          : onBonus && bonusRoom !== null
            ? `$${Math.floor(bonusRoom)} bonus room left`
            : null;
      return {
        card,
        pct: valuePerDollar(card, rate, mileValue) * 100,
        rateLabel: card.unit === "miles" ? `${rateText(card, rate)} ≈ ${+(valuePerDollar(card, rate, mileValue) * 100).toFixed(1)}%` : rateText(card, rate),
        note,
        onBonus,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

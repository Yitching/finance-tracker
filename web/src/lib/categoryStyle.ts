import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { CATEGORIES } from "./types";

/**
 * Category colours: a pastel chip behind each category's emoji, and a matching bar
 * colour for charts, pot jars and bill icons. You can pick each category's colour from
 * a palette in Settings → Category colours.
 *
 * Each category reads two CSS variables (--cat-<name>-chip and --cat-<name>-bar) that
 * point at a palette colour (--pal-<colour>-chip / -bar, defined in index.css with a
 * lighter chip in light mode and a stronger one in dark). Picking a colour just repoints
 * the category's variables on <html>, so every screen updates at once.
 * Classes are literal strings so Tailwind picks them up; `on-pastel` keeps text dark.
 */

export const PALETTE = [
  "amber",
  "orange",
  "rose",
  "pink",
  "purple",
  "violet",
  "sky",
  "teal",
  "emerald",
  "lime",
  "stone",
] as const;
export type PaletteColour = (typeof PALETTE)[number];

export const DEFAULT_COLOURS: Record<string, PaletteColour> = {
  Food: "amber",
  Transport: "sky",
  Groceries: "lime",
  Shopping: "pink",
  Bills: "violet",
  Entertainment: "orange",
  Health: "emerald",
  Others: "stone",
};

export const CATEGORY_CHIP: Record<string, string> = {
  Food: "bg-(--cat-food-chip) on-pastel",
  Transport: "bg-(--cat-transport-chip) on-pastel",
  Groceries: "bg-(--cat-groceries-chip) on-pastel",
  Shopping: "bg-(--cat-shopping-chip) on-pastel",
  Bills: "bg-(--cat-bills-chip) on-pastel",
  Entertainment: "bg-(--cat-entertainment-chip) on-pastel",
  Health: "bg-(--cat-health-chip) on-pastel",
  Others: "bg-(--cat-others-chip) on-pastel",
};

export const CATEGORY_BAR: Record<string, string> = {
  Food: "bg-(--cat-food-bar)",
  Transport: "bg-(--cat-transport-bar)",
  Groceries: "bg-(--cat-groceries-bar)",
  Shopping: "bg-(--cat-shopping-bar)",
  Bills: "bg-(--cat-bills-bar)",
  Entertainment: "bg-(--cat-entertainment-bar)",
  Health: "bg-(--cat-health-bar)",
  Others: "bg-(--cat-others-bar)",
};

export function categoryChip(category: string): string {
  return CATEGORY_CHIP[category] ?? CATEGORY_CHIP.Others;
}

export function categoryBar(category: string): string {
  return CATEGORY_BAR[category] ?? CATEGORY_BAR.Others;
}

/** Point each category's variables at its chosen palette colour. */
export function applyCategoryColours(colours: Record<string, PaletteColour>) {
  const style = document.documentElement.style;
  for (const category of CATEGORIES) {
    const colour = colours[category] ?? DEFAULT_COLOURS[category];
    const name = category.toLowerCase();
    style.setProperty(`--cat-${name}-chip`, `var(--pal-${colour}-chip)`);
    style.setProperty(`--cat-${name}-bar`, `var(--pal-${colour}-bar)`);
  }
}

const KEY = "lazy-ledger.category-colours";
const isColour = (v: unknown): v is PaletteColour => PALETTE.includes(v as PaletteColour);

/** Only known categories and palette colours; anything missing falls back to the default. */
function clean(value: unknown): Record<string, PaletteColour> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, PaletteColour> = {};
  for (const [k, v] of Object.entries(value)) {
    if (CATEGORIES.includes(k as (typeof CATEGORIES)[number]) && isColour(v)) out[k] = v;
  }
  return out;
}

export function cachedCategoryColours(): Record<string, PaletteColour> {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) ?? "null")) ?? {};
  } catch {
    return {};
  }
}

function cache(colours: Record<string, PaletteColour>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(colours));
  } catch {
    // Private mode: the database copy still works.
  }
}

/** Your category colours (only the ones you changed), synced via user_settings. */
export function useCategoryColours() {
  const [colours, setColours] = useState<Record<string, PaletteColour>>(cachedCategoryColours);

  useEffect(() => {
    applyCategoryColours(colours);
  }, [colours]);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("user_settings")
      .select("category_colors")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return; // e.g. migration not pushed yet: keep the cached value
        const next = clean(data?.category_colors);
        if (!next) return;
        setColours(next);
        cache(next);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: Record<string, PaletteColour>) => {
    setColours(next);
    cache(next);
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, category_colors: next, updated_at: new Date().toISOString() });
    if (error) throw error;
  }, []);

  return [colours, save] as const;
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Home screen layout: the order of Home's sections, and which are hidden.
 * Settings → Home layout edits it; it syncs via user_settings so every phone matches.
 * The Inbox banner isn't listed: it stays pinned at the top whenever charges need checking.
 */

export const HOME_SECTIONS = [
  { id: "safe", label: "Safe to spend", emoji: "💸" },
  { id: "pots", label: "Pots", emoji: "🫙" },
  { id: "chips", label: "Usual around now", emoji: "⚡" },
  { id: "summary", label: "Today / This week", emoji: "📅" },
  { id: "insights", label: "Insights", emoji: "✨" },
  { id: "recent", label: "Recent expenses", emoji: "🧾" },
] as const;

export type HomeSectionId = (typeof HOME_SECTIONS)[number]["id"];
export type HomeLayout = { order: HomeSectionId[]; hidden: HomeSectionId[] };

const IDS = HOME_SECTIONS.map((s) => s.id) as HomeSectionId[];
export const DEFAULT_LAYOUT: HomeLayout = { order: IDS, hidden: [] };
const isId = (v: unknown): v is HomeSectionId => IDS.includes(v as HomeSectionId);

/** Keep known sections only, no repeats; sections added in a later version go at the end. */
function clean(value: unknown): HomeLayout | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { order?: unknown; hidden?: unknown };
  if (!Array.isArray(v.order)) return null;
  const order = [...new Set(v.order.filter(isId))];
  for (const id of IDS) if (!order.includes(id)) order.push(id);
  const hidden = Array.isArray(v.hidden) ? [...new Set(v.hidden.filter(isId))] : [];
  return { order, hidden };
}

const KEY = "lazy-ledger.home-layout";

function cached(): HomeLayout {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) ?? "null")) ?? DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function cache(layout: HomeLayout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Private mode: the database copy still works.
  }
}

/** Your Home layout, synced via user_settings. */
export function useHomeLayout() {
  const [layout, setLayout] = useState<HomeLayout>(cached);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("user_settings")
      .select("home_layout")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return; // e.g. migration not pushed yet: keep the cached value
        const next = clean(data?.home_layout);
        if (!next) return;
        setLayout(next);
        cache(next);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: HomeLayout) => {
    setLayout(next);
    cache(next);
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, home_layout: next, updated_at: new Date().toISOString() });
    if (error) throw error;
  }, []);

  return [layout, save] as const;
}

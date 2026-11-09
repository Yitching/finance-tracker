// The Insights screen's headline: compare this period with the same point of the last one,
// work out the facts here, and let the model pick the one worth saying.
import { createClient } from "npm:@supabase/supabase-js@2";
import { aiConfigError, callTool } from "../_shared/ai.ts";
import { cors, json } from "../_shared/http.ts";
import { currentAndPrevious, DAY, type Period, placeOf, SGT, sgt } from "../_shared/period.ts";

type Row = { item: string; amount: number; category: string; spent_at: string; merchant: string | null; source: string };
type Highlight = { text: string; tone: "up" | "down" | "neutral" };
type Written = { headline: string; detail: string; highlights: Highlight[]; tip: string | null };

const round = (n: number) => Math.round(n * 100) / 100;

// ── Facts ──────────────────────────────────────────────────────────────────────

const sum = (rows: Row[]) => round(rows.reduce((s, r) => s + r.amount, 0));
const timeOfDay = (hour: number) =>
  hour < 5 || hour >= 22 ? "late night (10pm–5am)" : hour < 11 ? "morning (5–11am)" : hour < 15 ? "midday (11am–3pm)" : hour < 18 ? "afternoon (3–6pm)" : "evening (6–10pm)";

function compareBy(now: Row[], before: Row[], keyFn: (r: Row) => string, label: (rows: Row[]) => string) {
  const groups = new Map<string, { now: Row[]; before: Row[] }>();
  for (const [rows, side] of [[now, "now"], [before, "before"]] as const) {
    for (const r of rows) {
      const key = keyFn(r);
      if (!key) continue;
      const g = groups.get(key) ?? { now: [], before: [] };
      g[side].push(r);
      groups.set(key, g);
    }
  }
  return [...groups.values()].map((g) => ({
    name: label(g.now.length ? g.now : g.before),
    now: sum(g.now),
    sameTimeLastPeriod: sum(g.before),
    change: round(sum(g.now) - sum(g.before)),
    timesNow: g.now.length,
    timesLastPeriod: g.before.length,
  }));
}

/** Changes whenever a confirmed expense is added, removed or edited. */
function hashRows(rows: Row[]) {
  let h = 0;
  for (const r of rows) for (const c of `${r.item}|${r.amount}|${r.category}|${r.spent_at};`) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

const byChange = <T extends { change: number }>(a: T, b: T) => Math.abs(b.change) - Math.abs(a.change);

export function buildFacts(rows: Row[], current: Period, previous: Period, now: number) {
  const at = (r: Row) => new Date(r.spent_at).getTime();
  const elapsed = now - current.from;
  const cutoff = Math.min(previous.from + elapsed, previous.to);
  const thisPeriod = rows.filter((r) => at(r) >= current.from && at(r) <= now);
  const lastSoFar = rows.filter((r) => at(r) >= previous.from && at(r) < cutoff);
  const lastFull = rows.filter((r) => at(r) >= previous.from && at(r) < previous.to);
  // Statement lines only have a date, so their time of day means nothing.
  const timed = (list: Row[]) => list.filter((r) => r.source !== "statement");

  const daysElapsed = Math.max(1, Math.ceil(elapsed / DAY));
  const daysTotal = Math.round((current.to - current.from) / DAY);
  let weekdays = 0, weekendDays = 0;
  for (let t = current.from; t < now; t += DAY) {
    if (sgt(t).weekday % 6 === 0) weekendDays++;
    else weekdays++;
  }
  const weekend = (r: Row) => sgt(at(r)).weekday % 6 === 0;

  const total = sum(thisPeriod);
  const lastFullTotal = sum(lastFull);
  // A straight-line projection; only meaningful once there are a few days of data.
  const pace = elapsed >= 3 * DAY && now < current.to ? round((total / elapsed) * (current.to - current.from)) : null;

  return {
    period: { daysElapsed, daysTotal, ongoing: now < current.to },
    totals: { thisPeriod: total, sameTimeLastPeriod: sum(lastSoFar), lastPeriodFull: lastFullTotal, projectedThisPeriod: pace },
    categories: compareBy(thisPeriod, lastSoFar, (r) => r.category, (g) => g[0].category).sort(byChange),
    placesThatChangedMost: compareBy(thisPeriod, lastSoFar, placeOf, (g) => g[g.length - 1].item).sort(byChange).slice(0, 6),
    topPlacesThisPeriod: compareBy(thisPeriod, [], placeOf, (g) => g[g.length - 1].item).sort((a, b) => b.now - a.now).slice(0, 5)
      .map(({ name, now, timesNow }) => ({ name, total: now, times: timesNow })),
    timeOfDay: compareBy(timed(thisPeriod), timed(lastSoFar), (r) => timeOfDay(sgt(at(r)).hour), (g) => timeOfDay(sgt(at(g[0])).hour)).sort(byChange),
    perDay: {
      weekdayAverage: weekdays ? round(sum(thisPeriod.filter((r) => !weekend(r))) / weekdays) : null,
      weekendAverage: weekendDays ? round(sum(thisPeriod.filter(weekend)) / weekendDays) : null,
    },
    biggestThisPeriod: [...thisPeriod].sort((a, b) => b.amount - a.amount).slice(0, 3)
      .map((r) => ({ item: r.item, amount: round(r.amount), category: r.category, date: new Date(at(r) + SGT).toISOString().slice(0, 10) })),
  };
}

// ── Model ──────────────────────────────────────────────────────────────────────

const SYSTEM = `You write the one insight a person in Singapore sees when they open their expense tracker.
You get facts comparing this spending period with the same point of the last one ("sameTimeLastPeriod"), so comparisons are fair mid-period.

Rules:
- Use only numbers in the facts. You may round them, or add or subtract two of them. Never invent amounts, places or dates.
- The headline is the single most specific, noteworthy finding: usually the biggest change at a named place or category, otherwise a time-of-day or weekday/weekend habit, or an unusually large expense. Lead with the dollar amount.
- Name the place or item ("Grab", "kopi"), not just the category, whenever the facts allow.
- Highlights are up to 3 other findings, each different from the headline. tone "up" means spending more, "down" means spending less.
- The tip is one small, concrete action tied to a named item or place from the facts, or null if nothing fits. No generic advice like "make a budget" or "track your spending". No investment advice, no judging the person.
- If daysElapsed is under 4, say it is early in the period.
- Amounts are SGD; write them like $12.30. Keep it plain and friendly.`;

const tool = {
  name: "write_insight",
  description: "Write the spending insight shown on the Insights screen.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "One sentence, at most about 90 characters, leading with a dollar amount." },
      detail: { type: "string", description: "One or two sentences explaining the headline using the facts." },
      highlights: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: { text: { type: "string" }, tone: { type: "string", enum: ["up", "down", "neutral"] } },
          required: ["text", "tone"],
        },
      },
      tip: { type: ["string", "null"] },
    },
    required: ["headline", "detail", "highlights", "tip"],
  },
};

function clean(raw: Written | null): Written | null {
  if (!raw || typeof raw.headline !== "string" || !raw.headline.trim()) return null;
  return {
    headline: raw.headline.trim(),
    detail: typeof raw.detail === "string" ? raw.detail.trim() : "",
    highlights: (Array.isArray(raw.highlights) ? raw.highlights : [])
      .filter((h) => typeof h?.text === "string" && h.text.trim())
      .slice(0, 3)
      .map((h) => ({ text: h.text.trim(), tone: ["up", "down"].includes(h.tone) ? h.tone : "neutral" })),
    tip: typeof raw.tip === "string" && raw.tip.trim() ? raw.tip.trim() : null,
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const configError = aiConfigError();
  if (configError) return json({ error: configError }, 500);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not signed in" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return json({ error: "Not signed in" }, 401);
  const { refresh = false } = await req.json().catch(() => ({}));

  const { data: settings } = await supabase.from("user_settings").select("statement_day").maybeSingle();
  const statementDay: number | null = settings?.statement_day ?? null;
  const now = Date.now();
  const { current, previous } = currentAndPrevious(statementDay, now);

  const { data, error } = await supabase
    .from("expenses")
    .select("item, amount, category, spent_at, merchant, source")
    .eq("status", "confirmed")
    .gte("spent_at", new Date(previous.from).toISOString())
    .lte("spent_at", new Date(now).toISOString())
    .limit(5000);
  if (error) return json({ error: "Could not load expenses" }, 500);
  const rows: Row[] = (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) || 0 }));

  const facts = buildFacts(rows, current, previous, now);
  const base = {
    period: { key: current.key, from: new Date(current.from).toISOString(), to: new Date(current.to).toISOString(), ...facts.period },
    totals: facts.totals,
  };
  if (!rows.length) {
    return json({ ...base, headline: "Nothing confirmed yet this period.", detail: "Log a few expenses and your first insight will show up here.", highlights: [], tip: null, generatedAt: null, cached: false });
  }

  // Same data on the same day gives the same insight, so serve it from the cache.
  const { year, month0, day } = sgt(now);
  const fingerprint = [statementDay ?? "cal", `${year}-${month0 + 1}-${day}`, rows.length, hashRows(rows)].join("|");
  if (!refresh) {
    const { data: hit } = await supabase.from("insight_cache").select("fingerprint, result, created_at").eq("period_key", current.key).maybeSingle();
    if (hit?.fingerprint === fingerprint) return json({ ...base, ...hit.result, generatedAt: hit.created_at, cached: true });
  }

  try {
    const written = clean(await callTool<Written>(SYSTEM, JSON.stringify(facts), tool));
    if (!written) return json({ error: "No insight returned" }, 502);
    const generatedAt = new Date().toISOString();
    const { error: cacheError } = await supabase
      .from("insight_cache")
      .upsert({ user_id: userData.user.id, period_key: current.key, fingerprint, result: written, created_at: generatedAt });
    if (cacheError) console.error(cacheError);
    return json({ ...base, ...written, generatedAt, cached: false });
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't generate insights" }, 502);
  }
});

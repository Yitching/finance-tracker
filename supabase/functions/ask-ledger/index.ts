// Supabase Edge Function: ask-ledger
// Answers questions typed into the home text box: "how much on grab last month?",
// "biggest expenses this week", "food this bill vs last bill".
//
// The model only turns the question into a query (dates, search words, categories, view).
// The totals are worked out here from your confirmed expenses, so every number is exact.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { aiConfigError, callTool, CATEGORIES } from "../_shared/ai.ts";
import { cors, json } from "../_shared/http.ts";
import { currentAndPrevious, DAY, midnight, periodFor, placeOf, sgt, sgtDate, type Period } from "../_shared/period.ts";

type Row = { id: string; item: string; amount: number; category: string; spent_at: string; merchant: string | null; note: string | null };
type View = "total" | "biggest" | "recent" | "by_category" | "by_place" | "by_day" | "by_month";
type Query = {
  answerable: boolean;
  reply: string | null;
  title: string;
  from: string;
  to: string;
  search: string[];
  categories: string[];
  view: View;
  compare: { label: string; from: string; to: string } | null;
};

const VIEWS: View[] = ["total", "biggest", "recent", "by_category", "by_place", "by_day", "by_month"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const round = (n: number) => Math.round(n * 100) / 100;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const tool = {
  name: "query_ledger",
  description: "Turn the user's question about their own spending into a query over their expenses.",
  input_schema: {
    type: "object",
    properties: {
      answerable: {
        type: "boolean",
        description: "false if this is not a question about their recorded spending (advice, budgets, other topics).",
      },
      reply: {
        type: ["string", "null"],
        description: "Only when answerable is false: one short, friendly sentence saying what you can answer instead.",
      },
      title: { type: "string", description: 'Short label for the answer, e.g. "Grab · October", "Food this bill", "Biggest this week".' },
      from: { type: "string", description: "First day included, YYYY-MM-DD (Singapore)." },
      to: { type: "string", description: "Last day included, YYYY-MM-DD (Singapore)." },
      search: {
        type: "array",
        items: { type: "string" },
        description: "Lowercase words matched against item names, merchants and notes. Any word matching counts. Empty means everything.",
      },
      categories: { type: "array", items: { type: "string", enum: CATEGORIES }, description: "Only these categories. Empty means all." },
      view: { type: "string", enum: VIEWS },
      compare: {
        type: ["object", "null"],
        description: "A second date range to compare against, only if the user asks for a comparison.",
        properties: { label: { type: "string" }, from: { type: "string" }, to: { type: "string" } },
        required: ["label", "from", "to"],
      },
    },
    required: ["answerable", "reply", "title", "from", "to", "search", "categories", "view", "compare"],
  },
};

const range = (p: Period) => `${sgtDate(p.from)} to ${sgtDate(p.to - DAY)}`;

export function buildSystemPrompt(now: number, statementDay: number | null, known: string[]) {
  const { year, month0, weekday } = sgt(now);
  const thisMonth = periodFor(year, month0, null);
  const lastMonth = periodFor(year, month0 - 1, null);
  const bills = statementDay ? currentAndPrevious(statementDay, now) : null;
  return `You turn questions about a person's own spending into a query by calling query_ledger. They live in Singapore; amounts are SGD.
They may write in Singlish or shorthand ("how much i spend on grab sia", "kopi this wk").

Today is ${sgtDate(now)} (${WEEKDAYS[weekday]}). Weeks start on Monday.
This month: ${range(thisMonth)}. Last month: ${range(lastMonth)}.
${bills ? `Their card statement is issued on day ${statementDay}. "This bill"/"this cycle": ${range(bills.current)}. "Last bill": ${range(bills.previous)}.` : "They have no billing cycle set; \"bill\" or \"cycle\" means a calendar month."}
With no time mentioned, use this month. "All time"/"ever" starts at 2020-01-01. Never set "to" after today.

Views:
- total: how much / how many times.
- biggest: largest expenses. recent: list what they bought.
- by_category / by_place: breakdowns ("where does my money go", "top places").
- by_day / by_month: spending over time ("each day this week", "monthly").

search: words for the thing asked about, plus obvious spellings or names from the list below ("grab" for rides by Grab; "kopi", "coffee" for coffee). Leave empty for questions about categories or everything.
If the question names a category ("food", "transport"), use categories, not search.
compare: only if they ask to compare ("vs", "than last month", "more or less"). If the main range is still running (it ends today), end the earlier range at the same point so it's fair, e.g. 1–5 Oct against 1–5 Nov, and label it like "same time last month".

Item and place names they use:
${known.length ? known.join(", ") : "(none yet)"}`;
}

/** All confirmed expenses in [from, to), paged past the API's 1,000-row cap. */
async function loadRows(supabase: SupabaseClient, from: number, to: number) {
  const rows: Row[] = [];
  for (let start = 0; start < 20_000; start += 1000) {
    const { data, error } = await supabase
      .from("expenses")
      .select("id, item, amount, category, spent_at, merchant, note")
      .eq("status", "confirmed")
      .gte("spent_at", new Date(from).toISOString())
      .lt("spent_at", new Date(to).toISOString())
      .order("spent_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []).map((r) => ({ ...r, amount: Number(r.amount) || 0 })));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** "YYYY-MM-DD" (inclusive) → [Singapore midnight, next midnight). */
export function toRange(fromDay: string, toDay: string, now: number) {
  if (!DATE.test(fromDay) || !DATE.test(toDay)) return null;
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  const from = Math.max(midnight(fy, fm - 1, fd), midnight(2000, 0, 1));
  const to = Math.min(midnight(ty, tm - 1, td + 1), endOfToday(now));
  return Number.isFinite(from) && Number.isFinite(to) && from < to ? { from, to } : null;
}

const endOfToday = (now: number) => {
  const today = sgt(now);
  return midnight(today.year, today.month0, today.day + 1);
};

export function summarise(rows: Row[], range: { from: number; to: number }, q: Query, now: number) {
  const at = (r: Row) => new Date(r.spent_at).getTime();
  const terms = q.search.map((s) => s.toLowerCase().trim()).filter((s) => s.length >= 2).slice(0, 8);
  const matched = rows.filter((r) =>
    at(r) >= range.from && at(r) < range.to &&
    (!q.categories.length || q.categories.includes(r.category)) &&
    (!terms.length || terms.some((t) => `${r.item} ${r.merchant ?? ""} ${r.note ?? ""}`.toLowerCase().includes(t)))
  );
  const total = round(matched.reduce((s, r) => s + r.amount, 0));
  // Days so far, so "this month" on the 5th averages over 5 days, not 30.
  const days = Math.max(1, Math.round((Math.min(range.to, endOfToday(now)) - range.from) / DAY));
  return { matched, total, count: matched.length, days, perDay: round(total / days) };
}

export function groupRows(rows: Row[], view: View) {
  const keyOf = (r: Row) => {
    const t = new Date(r.spent_at).getTime();
    if (view === "by_category") return r.category;
    if (view === "by_place") return placeOf(r);
    if (view === "by_day") return sgtDate(t);
    return sgtDate(t).slice(0, 7);
  };
  const groups = new Map<string, { name: string; total: number; count: number }>();
  for (const r of rows) {
    const key = keyOf(r);
    if (!key) continue;
    const g = groups.get(key) ?? { name: view === "by_place" ? r.item : key, total: 0, count: 0 };
    g.total = round(g.total + r.amount);
    g.count++;
    if (view === "by_place") g.name = r.item; // rows are oldest first, so this ends on the latest name
    groups.set(key, g);
  }
  const list = [...groups.values()];
  // Over time: keep the latest stretch in order. Breakdowns: biggest first.
  const inOrder = () => list.sort((a, b) => a.name.localeCompare(b.name));
  if (view === "by_day") return inOrder().slice(-14);
  if (view === "by_month") return inOrder().slice(-12);
  return list.sort((a, b) => b.total - a.total).slice(0, 8);
}

function clean(raw: Query | null): Query | null {
  if (!raw || typeof raw !== "object") return null;
  const compare = raw.compare && typeof raw.compare === "object" && DATE.test(raw.compare.from) && DATE.test(raw.compare.to)
    ? { label: String(raw.compare.label || "Before").slice(0, 60), from: raw.compare.from, to: raw.compare.to }
    : null;
  return {
    answerable: raw.answerable !== false,
    reply: typeof raw.reply === "string" ? raw.reply.trim() : null,
    title: String(raw.title || "Your spending").slice(0, 80),
    from: String(raw.from ?? ""),
    to: String(raw.to ?? ""),
    search: Array.isArray(raw.search) ? raw.search.filter((s) => typeof s === "string") : [],
    categories: Array.isArray(raw.categories) ? raw.categories.filter((c) => CATEGORIES.includes(c as never)) : [],
    view: VIEWS.includes(raw.view) ? raw.view : "total",
    compare,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const configError = aiConfigError();
  if (configError) return json({ error: configError }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not signed in" }, 401);

  // A client that acts as the signed-in user, so row-level security applies.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return json({ error: "Not signed in" }, 401);

  const { text: rawText } = await req.json().catch(() => ({ text: "" }));
  const text = String(rawText ?? "").trim();
  if (!text) return json({ error: "Nothing to answer" }, 400);
  if (text.length > 300) return json({ error: "Keep it under 300 characters" }, 400);

  const [{ data: settings }, { data: memory }, { data: merchants }] = await Promise.all([
    supabase.from("user_settings").select("statement_day").maybeSingle(),
    supabase.from("price_memory").select("display_name").order("use_count", { ascending: false }).limit(60),
    supabase.from("merchant_rules").select("display_name").limit(60),
  ]);
  const statementDay: number | null = settings?.statement_day ?? null;
  const known = [...new Set([...(memory ?? []), ...(merchants ?? [])].map((m) => m.display_name))];
  const now = Date.now();

  let query: Query | null;
  try {
    query = clean(await callTool<Query>(buildSystemPrompt(now, statementDay, known), text, tool));
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't work that out, try again?" }, 502);
  }
  if (!query) return json({ error: "Couldn't work that out, try again?" }, 502);
  if (!query.answerable) {
    return json({ answerable: false, reply: query.reply || "I can answer questions about what you've logged, like \"how much on Grab this month?\"" });
  }

  const main = toRange(query.from, query.to, now);
  if (!main) return json({ error: "Couldn't work out the dates in that question" }, 422);
  const other = query.compare ? toRange(query.compare.from, query.compare.to, now) : null;

  let rows: Row[];
  try {
    rows = await loadRows(supabase, Math.min(main.from, other?.from ?? Infinity), Math.max(main.to, other?.to ?? 0));
  } catch (e) {
    console.error(e);
    return json({ error: "Could not load expenses" }, 500);
  }

  const result = summarise(rows, main, query, now);
  const isGrouped = query.view.startsWith("by_");
  const listed = query.view === "biggest"
    ? [...result.matched].sort((a, b) => b.amount - a.amount)
    : [...result.matched].reverse();
  const compared = other ? summarise(rows, other, query, now) : null;

  return json({
    answerable: true,
    title: query.title,
    from: sgtDate(main.from),
    to: sgtDate(main.to - DAY),
    search: query.search,
    categories: query.categories,
    view: query.view,
    total: result.total,
    count: result.count,
    perDay: result.perDay,
    groups: isGrouped ? groupRows(result.matched, query.view) : [],
    rows: isGrouped ? [] : listed.slice(0, 8).map(({ id, item, amount, category, spent_at }) => ({ id, item, amount, category, spent_at })),
    compare: compared && query.compare ? { label: query.compare.label, total: compared.total, count: compared.count } : null,
  });
});

import { createClient } from "npm:@supabase/supabase-js@2";
import { aiConfigError, callTool, CATEGORIES } from "../_shared/ai.ts";
import { cors, json } from "../_shared/http.ts";

const tool = { name: "spending_insights", description: "Return conservative spending insights from aggregate expense data.", input_schema: { type: "object", properties: { summary: { type: "string" }, patterns: { type: "array", items: { type: "string" } }, recurring: { type: "array", items: { type: "string" } }, forecast: { type: ["object", "null"], properties: { period: { type: "string" }, amount: { type: "number" }, confidence: { type: "string", enum: ["low", "medium", "high"] } }, required: ["period", "amount", "confidence"] }, suggestions: { type: "array", items: { type: "string" } }, limitations: { type: "array", items: { type: "string" } } }, required: ["summary", "patterns", "recurring", "forecast", "suggestions", "limitations"] } };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const configError = aiConfigError(); if (configError) return json({ error: configError }, 500);
  const authHeader = req.headers.get("Authorization"); if (!authHeader) return json({ error: "Not signed in" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await supabase.auth.getUser(); if (!userData.user) return json({ error: "Not signed in" }, 401);
  const { data: rows, error } = await supabase.from("expenses").select("item, amount, category, spent_at").eq("status", "confirmed").order("spent_at", { ascending: true }).limit(5000);
  if (error) return json({ error: "Could not load expenses" }, 500);
  if (!rows?.length) return json({ summary: "There is not enough confirmed data yet.", patterns: [], recurring: [], forecast: null, suggestions: ["Log a few expenses and check back."], limitations: ["Forecasts need confirmed history and are not financial advice."] });
  const byDay = new Map<string, number>(); const byCategory = new Map<string, number>(); const byItem = new Map<string, { total: number; count: number }>();
  for (const row of rows) { const day = String(row.spent_at).slice(0, 10); const amount = Number(row.amount) || 0; byDay.set(day, (byDay.get(day) ?? 0) + amount); byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + amount); const key = String(row.item).toLowerCase(); const current = byItem.get(key) ?? { total: 0, count: 0 }; byItem.set(key, { total: current.total + amount, count: current.count + 1 }); }
  const payload = { expenseCount: rows.length, days: [...byDay].slice(-62), categories: [...byCategory].filter(([category]) => CATEGORIES.includes(category as never)), repeatedItems: [...byItem].filter(([, value]) => value.count >= 3).sort((a, b) => b[1].count - a[1].count).slice(0, 20) };
  try { const result = await callTool("You are a careful personal finance analyst. Use only the aggregate data. Do not invent facts, diagnose users, or give investment advice. Forecast only when history supports it; otherwise return null. Mention uncertainty and the data window.", JSON.stringify(payload), tool); return json(result ?? { error: "No insight returned" }); } catch (e) { console.error(e); return json({ error: "Couldn't generate insights" }, 502); }
});

// Supabase Edge Function: parse-expense
// Takes free text like "kopi, chicken rice 5.5 and grab 12 yesterday",
// asks an AI model to split it into expenses, fills missing prices from
// price memory, saves everything and returns the new rows.
//
// The AI provider is configured in ../_shared/ai.ts.

import { createClient } from "npm:@supabase/supabase-js@2";
import { aiConfigError, callTool, CATEGORIES, type Category } from "../_shared/ai.ts";
import { cors, json } from "../_shared/http.ts";

type ParsedItem = {
  item: string;
  amount: number | null;
  category: Category;
  days_ago: number;
};

type Memory = {
  item_key: string;
  display_name: string;
  last_amount: number;
  category: string;
};

const recordTool = {
  name: "record_expenses",
  description: "Record every purchase mentioned in the user's message.",
  input_schema: {
    type: "object",
    properties: {
      expenses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: {
              type: "string",
              description:
                "Short item name, Title Case. If it matches a known item, use that known item's exact name.",
            },
            amount: {
              type: ["number", "null"],
              description: "Price in SGD. null if the user did not say and it is not a known item.",
            },
            category: { type: "string", enum: CATEGORIES },
            days_ago: {
              type: "integer",
              minimum: 0,
              description: "0 for today, 1 for yesterday, etc.",
            },
          },
          required: ["item", "amount", "category", "days_ago"],
        },
      },
    },
    required: ["expenses"],
  },
};

function buildSystemPrompt(memory: Memory[]) {
  const known = memory.length
    ? memory
        .map((m) => `- ${m.display_name}: $${Number(m.last_amount).toFixed(2)} (${m.category})`)
        .join("\n")
    : "(none yet)";

  return `You turn casual Singaporean expense notes into structured data.
The user may write in Singlish, shorthand or mixed languages ("kopi c kosong", "cai png 4.5", "grab home 14", "ntuc 37.80").
Currency is SGD. "5.5" or "5.50" or "$5.5" all mean 5.50.
If an item has no price but matches a known item below, use the known price.
If an item has no price and is unknown, set amount to null. Never invent prices.
Always answer by calling the record_expenses tool.
Known items:
${known}`;
}

async function askAI(text: string, memory: Memory[]): Promise<ParsedItem[]> {
  const out = await callTool<{ expenses?: ParsedItem[] }>(buildSystemPrompt(memory), text, recordTool);
  return out?.expenses ?? [];
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

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Not signed in" }, 401);

  let text = "";
  let spentAt: string | undefined;
  try {
    ({ text, spentAt } = await req.json());
  } catch {
    return json({ error: "Body must be JSON: { text, spentAt? }" }, 400);
  }
  text = (text ?? "").trim();
  if (!text) return json({ error: "Nothing to parse" }, 400);
  if (text.length > 500) return json({ error: "Keep it under 500 characters" }, 400);

  const { data: memory } = await supabase
    .from("price_memory")
    .select("item_key, display_name, last_amount, category")
    .order("use_count", { ascending: false })
    .limit(150);

  let parsed: ParsedItem[];
  try {
    parsed = await askAI(text, (memory ?? []) as Memory[]);
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't understand that, try again?" }, 502);
  }

  const byKey = new Map((memory ?? []).map((m) => [m.item_key, m as Memory]));
  const now = Date.now();
  const DAY = 86_400_000;

  // A day picked in the app (backfilling a missed day) wins over "yesterday" etc. in the text.
  const picked = spentAt ? new Date(spentAt) : null;
  if (picked && (Number.isNaN(picked.getTime()) || picked.getTime() > now + DAY || now - picked.getTime() > 366 * DAY)) {
    return json({ error: "That date is out of range" }, 400);
  }

  const saved = [];
  const missingPrice: string[] = [];

  for (const p of parsed) {
    const name = p.item.trim();
    const remembered = byKey.get(name.toLowerCase());
    // Some models send "5.50" as a string; treat anything non-numeric as missing.
    const said = p.amount === null || p.amount === undefined ? NaN : Number(p.amount);
    const amount = Number.isFinite(said) && said >= 0
      ? said
      : remembered
        ? Number(remembered.last_amount)
        : null;

    if (amount === null) {
      missingPrice.push(name);
      continue;
    }

    const category = CATEGORIES.includes(p.category) ? p.category : "Others";
    const daysAgo = Math.max(0, Math.min(60, p.days_ago ?? 0));

    const { data: row, error } = await supabase
      .from("expenses")
      .insert({
        item: name,
        amount,
        category,
        spent_at: picked ? picked.toISOString() : new Date(now - daysAgo * DAY).toISOString(),
        source: "ai",
        raw_input: text,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      continue;
    }
    saved.push(row);

    await supabase.rpc("remember_item", {
      p_name: name,
      p_amount: amount,
      p_category: category,
    });
  }

  return json({ saved, missingPrice });
});

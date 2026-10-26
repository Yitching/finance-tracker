// Supabase Edge Function: parse-expense
// Takes free text like "kopi, chicken rice 5.5 and grab 12 yesterday",
// asks an AI model to split it into expenses, fills missing prices from
// price memory, saves everything and returns the new rows.
//
// Provider is picked by the AI_PROVIDER secret: "groq" (free tier) or "anthropic".
// If AI_PROVIDER isn't set, whichever API key exists is used (Anthropic first).

import { createClient } from "npm:@supabase/supabase-js@2";

const CATEGORIES = [
  "Food",
  "Transport",
  "Groceries",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Others",
] as const;

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5";
const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";

const PROVIDER: "anthropic" | "groq" | null = (() => {
  const chosen = Deno.env.get("AI_PROVIDER")?.toLowerCase();
  if (chosen === "groq" || chosen === "anthropic") return chosen;
  if (ANTHROPIC_KEY) return "anthropic";
  if (GROQ_KEY) return "groq";
  return null;
})();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

type ParsedItem = {
  item: string;
  amount: number | null;
  category: (typeof CATEGORIES)[number];
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

async function askClaude(text: string, system: string): Promise<ParsedItem[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system,
      tools: [recordTool],
      tool_choice: { type: "tool", name: "record_expenses" },
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const block = data.content?.find((b: { type: string }) => b.type === "tool_use");
  return (block?.input?.expenses ?? []) as ParsedItem[];
}

// Groq uses the OpenAI-compatible chat completions format.
async function askGroq(text: string, system: string): Promise<ParsedItem[]> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: recordTool.name,
            description: recordTool.description,
            parameters: recordTool.input_schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: recordTool.name } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return [];
  const args = JSON.parse(call.function.arguments ?? "{}");
  return (args.expenses ?? []) as ParsedItem[];
}

function askAI(text: string, memory: Memory[]) {
  const system = buildSystemPrompt(memory);
  return PROVIDER === "groq" ? askGroq(text, system) : askClaude(text, system);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (PROVIDER === "anthropic" && !ANTHROPIC_KEY)
    return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 500);
  if (PROVIDER === "groq" && !GROQ_KEY) return json({ error: "GROQ_API_KEY secret is not set" }, 500);
  if (!PROVIDER) return json({ error: "Set GROQ_API_KEY or ANTHROPIC_API_KEY as a secret" }, 500);

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
  try {
    ({ text } = await req.json());
  } catch {
    return json({ error: "Body must be JSON: { text }" }, 400);
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
        spent_at: new Date(now - daysAgo * DAY).toISOString(),
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
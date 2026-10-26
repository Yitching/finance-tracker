// Supabase Edge Function: capture
// Your phone (MacroDroid) posts every bank or payment notification here.
// The AI decides whether it's money you spent. If so, it lands in the Inbox
// as a pending expense; OTPs, promos and incoming money are ignored.
// Alerts that don't say how much (common for PayNow) still come in, with no
// amount, and the Inbox asks you for it.
//
// Auth: the phone token from Settings, as "Authorization: Bearer ll_..." or
// "?token=ll_..." for tools that can't set headers. The app's test button may
// send the signed-in user's session token instead.
//
// Body: plain text (app name, title and text on separate lines), or JSON
// { app?, title?, text }.

import { createClient } from "npm:@supabase/supabase-js@2";
import { aiConfigError, callTool, CATEGORIES, type Category } from "../_shared/ai.ts";
import { cors, json } from "../_shared/http.ts";

// Service role: the phone has no user session, so we look up the user from
// the token and set user_id ourselves. Every query below filters by it.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const KINDS = ["spend", "otp", "promo", "incoming", "declined", "other"] as const;

type Verdict = {
  kind: (typeof KINDS)[number];
  merchant: string | null;
  item: string | null;
  amount: number | null;
  category: Category;
};

const classifyTool = {
  name: "classify_notification",
  description: "Classify one phone notification and, if it is spending, extract the charge.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: KINDS },
      merchant: {
        type: ["string", "null"],
        description: "Merchant or recipient exactly as written, e.g. \"GRAB*A-6XYZ\". null unless kind is spend.",
      },
      item: {
        type: ["string", "null"],
        description: "Short friendly name in Title Case, e.g. \"Grab\". null unless kind is spend.",
      },
      amount: {
        type: ["number", "null"],
        description:
          "Amount spent in SGD. null if the notification doesn't show it (common for PayNow), or unless kind is spend. Never guess.",
      },
      category: { type: "string", enum: CATEGORIES },
    },
    required: ["kind", "merchant", "item", "amount", "category"],
  },
};

const SYSTEM = `You read ONE phone notification, usually from a Singapore bank, card or payment app, and decide whether it shows money the user just spent.
kind:
- "spend": a card charge, NETS / PayNow / PayLah! / GrabPay / ShopeePay payment, bill payment, or money the user sent to someone.
  Money going OUT counts even when no amount is shown, and even when the recipient is masked. Examples that are all "spend":
  "You've sent money to JOHN TAN via PayNow"
  "UOB - Your PayNow transfer to SEEXXX on 26/10/26 is successful."
  "You have transferred SGD 20.00 to J***N T*N"
- "otp": one-time passwords, verification codes, login or new-device alerts.
- "promo": promotions, offers, cashback adverts, newsletters.
- "incoming": money received, refunds, reversals, salary, interest. Read the direction carefully: "received from X" / "X sent you" is incoming; "sent to X" / "transferred to X" / "paid X" is spend.
- "declined": failed, declined or cancelled transactions.
- "other": anything else, including balance updates, statements, moving money between the user's own accounts or wallets (top-ups), and non-finance apps.
For "spend":
- merchant: the merchant or recipient exactly as written in the notification, e.g. "GRAB*A-6XYZ" or "NTUC FP-BEDOK".
- item: a short friendly name in Title Case, e.g. "Grab", "NTUC FairPrice", "Shopee". For a transfer to a person, use their name; if the name is masked (e.g. "SEEXXX"), use "PayNow Transfer".
- amount: the amount in SGD as a number. If only a foreign-currency amount is shown, use that number. If no amount is shown at all, null. Never guess.
- category: your best guess.
For any other kind, set merchant, item and amount to null and category to "Others".
Always answer by calling the classify_notification tool.`;

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function userFromRequest(req: Request): Promise<string | null> {
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const token = bearer || new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return null;

  if (token.startsWith("ll_")) {
    const { data } = await admin
      .from("capture_tokens")
      .select("user_id")
      .eq("token_hash", await sha256Hex(token))
      .maybeSingle();
    if (!data) return null;
    await admin
      .from("capture_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", data.user_id);
    return data.user_id;
  }

  // The app's "Send a test" button on a device that doesn't hold the phone token.
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

async function readText(req: Request): Promise<string> {
  const raw = await req.text();
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === "object") {
      return [body.app, body.title, body.text]
        .filter((s) => typeof s === "string" && s.trim())
        .join("\n");
    }
  } catch {
    // Not JSON: plain text is the normal MacroDroid body.
  }
  return raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const configError = aiConfigError();
  if (configError) return json({ error: configError }, 500);

  const userId = await userFromRequest(req);
  if (!userId) return json({ error: "Unknown phone token. Make a new one in Settings." }, 401);

  const text = (await readText(req)).replace(/\n{2,}/g, "\n").trim().slice(0, 1000);

  // Every request lands in capture_log, so Settings can show why something didn't arrive.
  const log = async (outcome: "pending" | "ignored" | "error", detail: string | null, expenseId?: string) => {
    await admin.from("capture_log").insert({
      user_id: userId,
      raw_input: text || "(empty)",
      outcome,
      detail,
      expense_id: expenseId ?? null,
    });
    await admin
      .from("capture_log")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString());
  };

  if (!text) {
    await log("error", "empty notification: check the MacroDroid body");
    return json({ error: "Empty notification" }, 400);
  }

  // Android sometimes posts the same notification twice (or updates it in place).
  const { data: repeat } = await admin
    .from("expenses")
    .select("id")
    .eq("user_id", userId)
    .eq("raw_input", text)
    .gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString())
    .limit(1);
  if (repeat?.length) {
    await log("ignored", "repeat");
    return json({ status: "ignored", reason: "repeat" });
  }

  let verdict: Verdict | null;
  try {
    verdict = await callTool<Verdict>(SYSTEM, text, classifyTool);
  } catch (e) {
    console.error(e);
    await log("error", `AI: ${String(e).slice(0, 300)}`);
    return json({ error: "Couldn't reach the AI, try again" }, 502);
  }
  if (!verdict || verdict.kind !== "spend") {
    const reason = verdict?.kind ?? "other";
    await log("ignored", reason);
    return json({ status: "ignored", reason });
  }

  // No amount (e.g. "You've sent money to JOHN TAN via PayNow"): keep it anyway, the Inbox asks for it.
  const said = verdict.amount === null || verdict.amount === undefined ? NaN : Number(verdict.amount);
  const amount = Number.isFinite(said) && said > 0 ? Math.round(said * 100) / 100 : null;

  const merchant = verdict.merchant?.trim() || null;
  let item = verdict.item?.trim() || merchant || "Card payment";
  let category: string = CATEGORIES.includes(verdict.category) ? verdict.category : "Others";

  // Merchant memory: you renamed this merchant before, so use your name for it.
  if (merchant) {
    const { data: rule } = await admin
      .rpc("lookup_merchant", { p_user_id: userId, p_merchant: merchant })
      .maybeSingle();
    const r = rule as { display_name: string; category: string } | null;
    if (r) {
      item = r.display_name;
      category = r.category;
    }
  }

  const { data: row, error } = await admin
    .from("expenses")
    .insert({
      user_id: userId,
      item,
      amount,
      category,
      merchant,
      source: "notification",
      status: "pending",
      raw_input: text,
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    await log("error", `save: ${error.message}`);
    return json({ error: "Couldn't save it" }, 500);
  }
  await log("pending", amount === null ? "no amount" : null, row.id);
  return json({ status: "pending", expense: row, needsAmount: amount === null });
});

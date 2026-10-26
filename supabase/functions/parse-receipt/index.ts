// Supabase Edge Function: parse-receipt
// Takes a photo of a receipt, asks a vision model for the line items and
// puts them in the Inbox as pending expenses, so a misread never lands
// straight in your totals.
//
// Body: { image: base64 (no data: prefix), mediaType: "image/jpeg" | "image/png" | "image/webp" }

import { createClient } from "npm:@supabase/supabase-js@2";
import { aiConfigError, callTool, CATEGORIES, type Category } from "../_shared/ai.ts";
import { cors, json } from "../_shared/http.ts";

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BASE64 = 6_500_000; // ~5 MB of image, the Claude API limit

type Line = { item: string; amount: number; category: Category };

type Receipt = {
  is_receipt: boolean;
  store: string | null;
  date: string | null;
  total: number | null;
  lines: Line[];
};

const receiptTool = {
  name: "record_receipt",
  description: "Record the purchases on the receipt in the photo.",
  input_schema: {
    type: "object",
    properties: {
      is_receipt: { type: "boolean", description: "false if the photo is not a readable receipt or bill." },
      store: { type: ["string", "null"], description: "Shop or restaurant name, Title Case." },
      date: { type: ["string", "null"], description: "Purchase date as YYYY-MM-DD, or null if not shown." },
      total: { type: ["number", "null"], description: "The final amount paid, in SGD." },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string", description: "Short, readable item name in Title Case." },
            amount: {
              type: "number",
              description: "Line price in SGD (quantity already multiplied). Negative for discounts.",
            },
            category: { type: "string", enum: CATEGORIES },
          },
          required: ["item", "amount", "category"],
        },
      },
    },
    required: ["is_receipt", "store", "date", "total", "lines"],
  },
};

const SYSTEM = `You read photos of Singapore receipts and bills and list what was bought.
- One line per purchased item, using the line price (quantity × unit price). Expand cryptic abbreviations into readable names ("CHKN RICE" → "Chicken Rice").
- GST and service charge: add each as its own line only if it is charged on top of the item prices.
- Discounts, vouchers and rebates: a line with a negative amount.
- Skip anything that isn't a purchase: subtotal, total, rounding, payment method, cash, change, card numbers, points.
- The lines should add up to the total paid.
- Currency is SGD.
Always answer by calling the record_receipt tool.`;

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Folds discount lines (negative amounts) into the items, proportionally,
 * since expenses can't be negative. The cent left over by rounding goes on
 * the biggest item so the lines still add up.
 */
function applyDiscounts(lines: Line[]): Line[] {
  const items = lines.filter((l) => l.amount > 0);
  const discount = -lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
  const gross = items.reduce((s, l) => s + l.amount, 0);
  if (!discount || !gross) return items.map((l) => ({ ...l, amount: cents(l.amount) }));

  const net = Math.max(0, gross - discount);
  const scaled = items.map((l) => ({ ...l, amount: cents((l.amount * net) / gross) }));
  const drift = cents(net - scaled.reduce((s, l) => s + l.amount, 0));
  const biggest = scaled.reduce((a, b) => (b.amount > a.amount ? b : a));
  biggest.amount = Math.max(0, cents(biggest.amount + drift));
  return scaled;
}

/** The receipt's date at noon Singapore time, or now if it's missing, today, or implausible. */
function spentAt(date: string | null) {
  const now = new Date();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return now.toISOString();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }); // YYYY-MM-DD
  if (date >= today) return now.toISOString();
  const t = new Date(`${date}T12:00:00+08:00`);
  if (Number.isNaN(t.getTime()) || now.getTime() - t.getTime() > 60 * 86_400_000) return now.toISOString();
  return t.toISOString();
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

  let image = "";
  let mediaType = "";
  try {
    ({ image, mediaType } = await req.json());
  } catch {
    return json({ error: "Body must be JSON: { image, mediaType }" }, 400);
  }
  if (!image || !MEDIA_TYPES.includes(mediaType)) return json({ error: "Send a JPEG, PNG or WebP photo" }, 400);
  if (image.length > MAX_BASE64) return json({ error: "That photo is too big" }, 413);

  let receipt: Receipt | null;
  try {
    receipt = await callTool<Receipt>(SYSTEM, "Here's my receipt.", receiptTool, { mediaType, data: image });
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't read that receipt, try again?" }, 502);
  }
  if (!receipt?.is_receipt) return json({ saved: [], store: null, notReceipt: true });

  const lines = applyDiscounts(
    (receipt.lines ?? [])
      .map((l) => ({
        item: String(l.item ?? "").trim(),
        amount: Number(l.amount),
        category: CATEGORIES.includes(l.category) ? l.category : "Others",
      }))
      .filter((l) => l.item && Number.isFinite(l.amount) && l.amount !== 0),
  ).filter((l) => l.amount > 0);

  if (!lines.length) return json({ saved: [], store: receipt.store });

  const store = receipt.store?.trim() || null;
  const at = spentAt(receipt.date);

  // No merchant on these rows: merchant memory is for bank alerts, and renaming
  // one receipt item mustn't rename everything else from that shop.
  const { data: saved, error } = await supabase
    .from("expenses")
    .insert(
      lines.map((l) => ({
        item: l.item,
        amount: l.amount,
        category: l.category,
        spent_at: at,
        source: "receipt",
        status: "pending",
        raw_input: `🧾 ${store ?? "Receipt"}${receipt!.total ? ` · total ${Number(receipt!.total).toFixed(2)}` : ""}`,
      })),
    )
    .select();

  if (error) {
    console.error(error);
    return json({ error: "Couldn't save the items" }, 500);
  }
  return json({ saved, store });
});

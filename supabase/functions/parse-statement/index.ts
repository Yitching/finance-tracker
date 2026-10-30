import pdf from "npm:pdf-parse@1.1.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGroqTool } from "../_shared/ai.ts";
import { cors, json } from "../_shared/http.ts";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 180_000;

type Row = { date: string; description: string; amount: number; direction: "debit" | "credit" | "unknown" };
type Parsed = { rows: Row[] };

const tool = {
  name: "record_statement",
  description: "Return transaction rows from a bank statement. Never invent rows.",
  input_schema: {
    type: "object",
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "Transaction date as YYYY-MM-DD, preserving the statement year." },
            description: { type: "string" },
            amount: { type: "number", description: "Positive absolute amount." },
            direction: { type: "string", enum: ["debit", "credit", "unknown"] },
          },
          required: ["date", "description", "amount", "direction"],
        },
      },
    },
    required: ["rows"],
  },
};

const SYSTEM = `Extract transaction rows from bank statement text.
- Preserve every historical date and year exactly; do not replace old dates with today.
- Require a date, concise description, positive amount, and direction for every row.
- debit means money leaving the account (purchases, transfers sent, fees); credit means deposits, refunds, transfers received, salary, or interest.
- Ignore credits, deposits, balances, opening/closing balances, subtotals, totals, page headers, and non-transaction rows.
- If direction is ambiguous, use unknown so the application can safely ignore it.
- Return only rows represented in the text. Always call record_statement.`;

function decodeBase64(value: string) {
  const clean = value.replace(/^data:application\/pdf;base64,/, "");
  const binary = atob(clean);
  if (binary.length > MAX_PDF_BYTES) throw new Error("PDF is too large (10 MB maximum)");
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function dateIso(value: string) {
  const v = String(value).trim().replace(/[/.]/g, "-");
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
    ? d.toISOString()
    : null;
}

async function fingerprint(row: Row) {
  const value = `${row.date}|${row.description.trim().toLowerCase().replace(/\s+/g, " ")}|${row.amount.toFixed(2)}|debit`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not signed in" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Not signed in" }, 401);

  let pdfBase64: string;
  try {
    const body = await req.json();
    pdfBase64 = String(body.pdf ?? "");
  } catch {
    return json({ error: "Body must be JSON: { pdf }" }, 400);
  }
  if (!pdfBase64) return json({ error: "Choose a PDF bank statement" }, 400);

  let text: string;
  try {
    const bytes = decodeBase64(pdfBase64);
    if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return json({ error: "That file is not a PDF" }, 400);
    const parsed = await pdf(bytes);
    text = String(parsed.text ?? "").slice(0, MAX_TEXT_CHARS);
  } catch (e) {
    console.error(e);
    return json({ error: "Could not extract text from this PDF. Try a text-based bank statement, not a scanned image." }, 422);
  }
  if (!text.trim()) return json({ error: "This PDF has no selectable text. Scanned statements are not supported yet." }, 422);

  let parsed: Parsed | null;
  try {
    parsed = await callGroqTool<Parsed>(SYSTEM, text, tool);
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't read that statement with Groq" }, 502);
  }
  const rows = (parsed?.rows ?? []).map((r) => ({
    date: dateIso(r.date),
    description: String(r.description ?? "").trim().slice(0, 240),
    amount: Number(r.amount),
    direction: r.direction,
  })).filter((r) => r.date && r.description && Number.isFinite(r.amount) && r.amount > 0 && r.direction === "debit");
  const withFingerprints = await Promise.all(rows.map(async (r) => ({ ...r, statement_fingerprint: await fingerprint(r as Row) })));
  const { data: saved, error } = await supabase.from("expenses").upsert(
    withFingerprints.map((r) => ({ item: r.description, amount: Math.round(r.amount * 100) / 100, category: "Others", spent_at: r.date, source: "statement", status: "pending", raw_input: `Statement · ${r.description}`, statement_fingerprint: r.statement_fingerprint })),
    { onConflict: "user_id,statement_fingerprint", ignoreDuplicates: true },
  ).select();
  if (error) {
    console.error(error);
    return json({ error: "Couldn't save statement rows" }, 500);
  }
  return json({ saved: saved ?? [], parsed: rows.length, inserted: saved?.length ?? 0, skipped: rows.length - (saved?.length ?? 0) });
});

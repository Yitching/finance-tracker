import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  CAPTURE_URL,
  MACRODROID_BODY,
  savedToken,
  saveToken,
  SIMULATIONS,
  simulationText,
  type Simulation,
} from "../lib/capture";
import { dayLabel, money, timeLabel } from "../lib/money";
import { applyTheme, savedTheme, type Theme } from "../lib/theme";
import { CATEGORY_EMOJI, type MerchantRule } from "../lib/types";
import { ScreenHeader } from "./ScreenHeader";

type TokenInfo = { user_id: string; created_at: string; last_used_at: string | null };
type TestResult = { ok: boolean; text: string };

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "📱 System" },
  { value: "light", label: "☀️ Light" },
  { value: "dark", label: "🌙 Dark" },
];

const when = (iso: string) => `${dayLabel(iso)}, ${timeLabel(iso)}`;

export function Settings({ onBack, onCaptured }: { onBack: () => void; onCaptured: () => void }) {
  const [info, setInfo] = useState<TokenInfo | null | undefined>(undefined);
  const [token, setToken] = useState<string | null>(() => savedToken());
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => savedTheme());

  const load = useCallback(async () => {
    const [tok, rul, ses] = await Promise.all([
      supabase.from("capture_tokens").select("user_id, created_at, last_used_at").maybeSingle(),
      supabase
        .from("merchant_rules")
        .select("merchant_key, example, display_name, category")
        .order("display_name"),
      supabase.auth.getSession(),
    ]);
    setInfo(tok.data ?? null);
    // Turned off (maybe from another device): forget the copy kept here.
    if (!tok.error && !tok.data) {
      setToken(null);
      saveToken(null);
    }
    if (rul.data) setRules(rul.data);
    setEmail(ses.data.session?.user.email ?? "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard blocked: the text is still selectable.
    }
  }

  async function createToken() {
    if (info && !window.confirm("Make a new token? The old one stops working, so update MacroDroid too.")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_capture_token");
    setBusy(false);
    if (error || typeof data !== "string") {
      setResult({ ok: false, text: "Couldn't create a token. Has the Phase 2 database migration been pushed?" });
      return;
    }
    setToken(data);
    saveToken(data);
    setResult(null);
    await load();
  }

  async function turnOff() {
    if (!info || !window.confirm("Turn off phone capture? MacroDroid's requests will be refused.")) return;
    await supabase.from("capture_tokens").delete().eq("user_id", info.user_id);
    setToken(null);
    saveToken(null);
    setResult(null);
    await load();
  }

  async function sendTest(sim: Simulation) {
    setBusy(true);
    setResult(null);
    try {
      const auth = token ?? (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(CAPTURE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth}`, "Content-Type": "text/plain" },
        body: simulationText(sim),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, text: body.error ?? `The capture endpoint answered ${res.status}.` });
        return;
      }

      if (body.status === "pending") {
        onCaptured();
        void load();
      }
      const got =
        body.status !== "pending" ? "ignored" : body.needsAmount ? "pending-no-amount" : "pending";
      const what =
        body.status !== "pending"
          ? `ignored it (${body.reason})`
          : body.needsAmount
            ? `put ${body.expense.item} in your Inbox, asking for the amount`
            : `put ${body.expense.item} ${money(Number(body.expense.amount))} in your Inbox`;
      setResult(
        got === sim.expect
          ? {
              ok: true,
              text: `As expected: it ${what}.${body.status === "pending" ? " Toss it when you're done." : ""}`,
            }
          : { ok: false, text: `Unexpected: it ${what}.` },
      );
    } catch {
      setResult({
        ok: false,
        text: "Couldn't reach the capture endpoint. Is the capture function deployed?",
      });
    } finally {
      setBusy(false);
    }
  }

  async function forget(rule: MerchantRule) {
    setRules((prev) => prev.filter((r) => r.merchant_key !== rule.merchant_key));
    await supabase.from("merchant_rules").delete().eq("merchant_key", rule.merchant_key);
  }

  const shownToken = token ?? "ll_… (make a new token on this device to see it)";

  return (
    <div className="flex flex-1 flex-col space-y-5 px-4 pb-24">
      <ScreenHeader title="Settings" subtitle={email || " "} onBack={onBack} />

      <section className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-line">
        <h2 className="text-lg font-semibold">🎨 Appearance</h2>
        <div className="flex gap-1 rounded-full bg-bg p-1 text-sm">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                applyTheme(t.value);
                setTheme(t.value);
              }}
              className={`flex-1 rounded-full px-3 py-1.5 font-medium transition ${
                theme === t.value ? "bg-card shadow-sm" : "text-ink-soft"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-3xl bg-card p-5 ring-1 ring-line">
        <div>
          <h2 className="text-lg font-semibold">📲 Phone capture</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Your phone forwards bank and payment notifications here. Spending lands in your Inbox to
            confirm; OTPs, promos and incoming money are ignored.
          </p>
        </div>

        {info === undefined ? (
          <div className="h-12 animate-pulse rounded-2xl bg-bg" />
        ) : info === null ? (
          <button
            onClick={() => void createToken()}
            disabled={busy}
            className="w-full rounded-2xl bg-accent px-4 py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-60"
          >
            Create phone token
          </button>
        ) : (
          <>
            <div className="text-sm text-ink-soft">
              Token made {when(info.created_at)} ·{" "}
              {info.last_used_at ? `last used ${when(info.last_used_at)}` : "not used yet"}
            </div>
            <CopyField label="Token" value={shownToken} canCopy={!!token} copied={copied} onCopy={copy} />
            <div className="flex gap-2 text-sm font-medium">
              <button
                onClick={() => void createToken()}
                disabled={busy}
                className="rounded-xl bg-bg px-3 py-2 ring-1 ring-line"
              >
                New token
              </button>
              <button onClick={() => void turnOff()} className="rounded-xl px-3 py-2 text-danger">
                Turn off
              </button>
            </div>
          </>
        )}
      </section>

      {info && (
        <section className="space-y-4 rounded-3xl bg-card p-5 ring-1 ring-line">
          <h2 className="text-lg font-semibold">🤖 Set up MacroDroid</h2>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              Install <b>MacroDroid</b> from the Play Store and open it.
            </li>
            <li>
              <b>Add Macro</b> → add a <b>Notification</b> trigger (search “Notification”) →{" "}
              <b>Notification Received</b>. Pick your bank and wallet apps (UOB TMRW, DBS, OCBC, GrabPay,
              YouTrip…), any content. Allow notification access when asked.
            </li>
            <li>
              Add the <b>HTTP Request</b> action (search “HTTP”) and set:
              <div className="mt-2 space-y-2">
                <CopyField label="Method" value="POST" copied={copied} onCopy={copy} />
                <CopyField label="URL" value={CAPTURE_URL} copied={copied} onCopy={copy} />
                <CopyField label="Header name" value="Authorization" copied={copied} onCopy={copy} />
                <CopyField
                  label="Header value"
                  value={`Bearer ${shownToken}`}
                  canCopy={!!token}
                  copied={copied}
                  onCopy={copy}
                />
                <CopyField
                  label="Body (content type text/plain)"
                  value={MACRODROID_BODY}
                  copied={copied}
                  onCopy={copy}
                />
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                The body words in brackets are MacroDroid “magic text”. If pasting doesn't work, insert
                notification app name, title and text from the magic text (…) button, one per line.
              </p>
            </li>
            <li>
              Save the macro. In Android settings, set MacroDroid's battery use to <b>Unrestricted</b> so it
              keeps running in the background.
            </li>
            <li>Run a simulation below, then buy something small and watch it arrive 🎯</li>
          </ol>
        </section>
      )}

      <section className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-line">
        <h2 className="text-lg font-semibold">🧪 Simulate a notification</h2>
        <p className="text-sm text-ink-soft">
          Sends a sample alert through the same path as your phone and checks what happens.
          {!token && " This device doesn't hold the phone token, so it signs in with your login instead."}
        </p>
        {SIMULATIONS.map((sim) => (
          <button
            key={sim.id}
            onClick={() => void sendTest(sim)}
            disabled={busy}
            className="w-full rounded-2xl bg-bg px-4 py-3 text-left text-sm font-semibold ring-1 ring-line active:scale-[0.98] disabled:opacity-60"
          >
            {sim.label}
          </button>
        ))}
        {busy && <p className="text-sm text-ink-soft">Sending…</p>}
        {result && (
          <p className={`text-sm ${result.ok ? "text-good" : "text-danger"}`}>
            {result.ok ? "✓ " : "✕ "}
            {result.text}
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-line">
        <h2 className="text-lg font-semibold">🏷️ Merchants I remember</h2>
        {rules.length ? (
          <ul className="divide-y divide-line">
            {rules.map((r) => (
              <li key={r.merchant_key} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {CATEGORY_EMOJI[r.category] ?? "📦"} {r.display_name}
                  </div>
                  <div className="truncate font-mono text-xs text-ink-faint">{r.example ?? r.merchant_key}</div>
                </div>
                <button
                  onClick={() => void forget(r)}
                  aria-label={`Forget ${r.display_name}`}
                  className="px-2 text-ink-faint"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">
            Rename or recategorise a captured charge once (say “GRAB*A-6XYZ” → Grab, Transport) and every
            future charge from that merchant arrives already sorted.
          </p>
        )}
      </section>

      <button
        onClick={() => void supabase.auth.signOut()}
        className="w-full rounded-2xl bg-card px-4 py-3 font-medium text-danger ring-1 ring-line"
      >
        Sign out
      </button>
    </div>
  );
}

function CopyField({
  label,
  value,
  canCopy = true,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  canCopy?: boolean;
  copied: string | null;
  onCopy: (label: string, value: string) => void;
}) {
  return (
    <div className="rounded-xl bg-bg px-3 py-2">
      <div className="flex items-center justify-between text-xs text-ink-faint">
        <span>{label}</span>
        {canCopy && (
          <button type="button" onClick={() => onCopy(label, value)} className="font-semibold text-accent">
            {copied === label ? "Copied ✓" : "Copy"}
          </button>
        )}
      </div>
      <div className="mt-0.5 font-mono text-xs break-all whitespace-pre-line select-all">{value}</div>
    </div>
  );
}

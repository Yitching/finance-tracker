import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { useLedger } from "./lib/useLedger";
import { findDuplicates } from "./lib/duplicates";
import { shrinkPhoto } from "./lib/image";
import { dayLabel, money, onDay, startOfDay, startOfWeek } from "./lib/money";
import type { Expense, PendingExpense, Remembered } from "./lib/types";
import { Login } from "./components/Login";
import { QuickAdd } from "./components/QuickAdd";
import { Chips } from "./components/Chips";
import { Summary, SummaryStrip } from "./components/Summary";
import { RecentList } from "./components/RecentList";
import { AskPrice } from "./components/AskPrice";
import { Inbox, InboxBanner } from "./components/Inbox";
import { Settings } from "./components/Settings";
import { ScreenHeader } from "./components/ScreenHeader";
import { Insights } from "./components/Insights";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null; // brief, avoids a login flash
  return session ? <Home /> : <Login />;
}

type Toast = { text: string; undo?: () => void };
type View = "home" | "spending" | "insights" | "inbox" | "settings";

function Home() {
  const {
    expenses,
    pending,
    memory,
    loading,
    addText,
    addReceipt,
    addStatement,
    getConfirmedRange,
    addDirect,
    remove,
    restore,
    update,
    setStatus,
    refresh,
  } = useLedger();
  const [view, setView] = useState<View>("home");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  // Each "how much was X?" remembers which day X was logged for.
  const [askQueue, setAskQueue] = useState<{ item: string; day: string | null }[]>([]);
  // The day new entries go on ("YYYY-MM-DD"); null = today. Stays until you clear it, for backfilling.
  const [day, setDay] = useState<string | null>(null);
  const [historyMonth, setHistoryMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [historyExpenses, setHistoryExpenses] = useState<Expense[]>(expenses);
  const [historyLoading, setHistoryLoading] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  // Each screen gets a history entry, so Android's back gesture returns home instead of closing the app.
  useEffect(() => {
    const onPop = () => setView("home");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function open(v: View) {
    window.history.pushState({ view: v }, "");
    setView(v);
  }
  const goHome = () => window.history.back();

  function showToast(t: Toast) {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }

  useEffect(() => {
    if (view !== "spending") return;
    const from = `${historyMonth}-01T00:00:00.000Z`;
    const d = new Date(`${historyMonth}-01T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    setHistoryLoading(true);
    void getConfirmedRange(from, d.toISOString()).then(setHistoryExpenses).catch(() => showToast({ text: "Couldn't load that month" })).finally(() => setHistoryLoading(false));
  }, [view, historyMonth, getConfirmedRange]);

  /** Midday on the picked day as ISO, or undefined for "now". */
  const spentAt = (d: string | null) => (d ? onDay(d).toISOString() : undefined);
  const forDay = (d: string | null) => (d ? ` for ${dayLabel(onDay(d).toISOString())}` : "");

  function describe(rows: PendingExpense[]) {
    if (rows.length === 1) {
      const [r] = rows;
      return r.amount === null ? r.item : `${r.item} ${money(r.amount)}`;
    }
    return `${rows.length} items · ${money(rows.reduce((s, r) => s + (r.amount ?? 0), 0))}`;
  }

  async function handleText(text: string) {
    setBusy(true);
    try {
      const { saved, missingPrice } = await addText(text, spentAt(day));
      if (saved.length) {
        const ids = saved.map((r) => r.id);
        showToast({ text: `Added ${describe(saved)}${forDay(day)}`, undo: () => void remove(ids) });
      }
      if (missingPrice.length) setAskQueue((q) => [...q, ...missingPrice.map((item) => ({ item, day }))]);
      if (!saved.length && !missingPrice.length) showToast({ text: "Hmm, didn't catch any purchase there 🤔" });
    } catch {
      showToast({ text: "Couldn't reach the AI. Check your connection?" });
    } finally {
      setBusy(false);
    }
  }

  async function handleChip(m: Remembered) {
    navigator.vibrate?.(15);
    const row = await addDirect(m.display_name, m.last_amount, m.category, "chip", spentAt(day));
    showToast({ text: `Added ${describe([row])}${forDay(day)}`, undo: () => void remove([row.id]) });
  }

  async function handleRemembered(item: string, amount: number, category: string) {
    const row = await addDirect(item, amount, category, "memory", spentAt(day));
    showToast({ text: `Added ${describe([row])}${forDay(day)}`, undo: () => void remove([row.id]) });
  }

  // Receipt items go to the Inbox to check, since a photo can be misread.
  async function handlePhoto(file: File) {
    setBusy(true);
    try {
      const { saved, store, notReceipt } = await addReceipt(await shrinkPhoto(file));
      if (saved.length) {
        const ids = saved.map((r) => r.id);
        showToast({
          text: `🧾 ${store ? `${store}: ` : ""}${describe(saved)} to check`,
          undo: () => void remove(ids),
        });
        open("inbox");
      } else {
        showToast({
          text: notReceipt ? "That doesn't look like a receipt 🤔" : "Couldn't find any items on that receipt",
        });
      }
    } catch {
      showToast({ text: "Couldn't read the receipt. Try a clearer photo?" });
    } finally {
      setBusy(false);
    }
  }

  async function handleStatement(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      showToast({ text: "That PDF is too large (10 MB maximum)" });
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const result = await addStatement(btoa(binary));
      showToast({ text: `Statement: ${result.inserted} new rows${result.skipped ? ` · ${result.skipped} already imported` : ""} to check` });
      if (result.inserted) open("inbox");
    } catch (e) {
      showToast({ text: e instanceof Error ? e.message : "Couldn't read that statement" });
    } finally {
      setBusy(false);
    }
  }

  function csvCell(value: string | number) {
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async function exportCsv(allHistory: boolean) {
    try {
      let rows: Expense[];
      if (allHistory) rows = await getConfirmedRange();
      else {
        const from = `${historyMonth}-01T00:00:00.000Z`;
        const d = new Date(`${historyMonth}-01T00:00:00.000Z`);
        d.setUTCMonth(d.getUTCMonth() + 1);
        rows = await getConfirmedRange(from, d.toISOString());
      }
      const csv = ["Date,Description,Amount,Category,Source", ...rows.map((r) => [r.spent_at.slice(0, 10), r.item, r.amount.toFixed(2), r.category, r.source].map(csvCell).join(","))].join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `lazy-ledger-${allHistory ? "all-history" : historyMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast({ text: "Couldn't export expenses" });
    }
  }

  async function handleAskedPrice(ask: { item: string; day: string | null }, amount: number) {
    setAskQueue((q) => q.slice(1));
    const row = await addDirect(ask.item, amount, "Others", "manual", spentAt(ask.day));
    showToast({
      text: `Added ${describe([row])}${forDay(ask.day)} · tap it to set a category`,
      undo: () => void remove([row.id]),
    });
  }

  function handleDelete(e: Expense) {
    void remove([e.id]);
    showToast({ text: `Deleted ${e.item}`, undo: () => void restore([e]) });
  }

  const duplicates = useMemo(() => findDuplicates(pending, expenses), [pending, expenses]);

  function handleKeep(e: PendingExpense, amount?: number) {
    void setStatus([e.id], "confirmed", amount);
    showToast({
      text: `Kept ${describe([{ ...e, amount: amount ?? e.amount }])}`,
      undo: () => void setStatus([e.id], "pending"),
    });
  }

  function handleToss(e: PendingExpense) {
    void remove([e.id]);
    showToast({ text: `Tossed ${describe([e])}`, undo: () => void restore([e]) });
  }

  // Likely duplicates and charges with no amount stay behind for a manual call.
  function handleKeepAll() {
    const keep = pending.filter((e) => !duplicates.has(e.id) && e.amount !== null);
    if (!keep.length) return;
    const ids = keep.map((e) => e.id);
    void setStatus(ids, "confirmed");
    const skipped = pending.length - keep.length;
    showToast({
      text: `Kept ${describe(keep)}${skipped ? ` · ${skipped} left to check` : ""}`,
      undo: () => void setStatus(ids, "pending"),
    });
  }

  // Gentle, unbreakable consistency signal: days logged this week (Mon–Sun).
  const daysLogged = useMemo(() => {
    const from = startOfWeek().getTime();
    const days = new Set(
      expenses
        .filter((e) => new Date(e.created_at).getTime() >= from)
        .map((e) => startOfDay(new Date(e.created_at)).getTime()),
    );
    return days.size;
  }, [expenses]);

  const toastBar = toast && (
    <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-lg">
      <span className="min-w-0 flex-1 truncate">{toast.text}</span>
      {toast.undo && (
        <button
          onClick={() => {
            toast.undo?.();
            setToast(null);
          }}
          className="font-semibold text-accent-soft"
        >
          Undo
        </button>
      )}
    </div>
  );

  // Home only lists today and yesterday; the full history lives in Spending.
  const recent = useMemo(() => {
    const from = startOfDay(new Date(Date.now() - 86_400_000)).getTime();
    return expenses.filter((e) => new Date(e.spent_at).getTime() >= from);
  }, [expenses]);

  if (view !== "home") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        {view === "spending" ? (
          <div className="flex flex-1 flex-col space-y-5 px-4 pb-24">
            <ScreenHeader title="Spending" onBack={goHome} action={<button onClick={() => open("insights")} className="rounded-xl bg-bg px-3 py-2 text-sm font-medium ring-1 ring-line">Insights</button>} />
            <div className="flex items-center gap-2">
              <input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-line" />
              <button onClick={() => void exportCsv(false)} className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white">Export</button>
              <button onClick={() => void exportCsv(true)} className="rounded-xl bg-bg px-3 py-2 text-sm font-medium ring-1 ring-line">All</button>
            </div>
            {historyLoading ? <div className="h-32 animate-pulse rounded-3xl bg-card" /> : <><Summary expenses={historyExpenses} /><RecentList expenses={historyExpenses} onDelete={handleDelete} onUpdate={update} /></>}
          </div>
        ) : view === "insights" ? (
          <div className="flex flex-1 flex-col space-y-5 px-4 pb-24"><ScreenHeader title="Insights" subtitle="Charts and AI patterns" onBack={goHome} /><Insights expenses={expenses} /></div>
        ) : view === "inbox" ? (
          <Inbox
            pending={pending}
            duplicates={duplicates}
            onKeep={handleKeep}
            onToss={handleToss}
            onKeepAll={handleKeepAll}
            onUpdate={(id, patch) => void update(id, patch)}
            onBack={goHome}
          />
        ) : (
          <Settings onBack={goHome} onCaptured={() => void refresh()} />
        )}
        {toastBar && (
          <div className="fixed inset-x-0 bottom-0 z-10">
            <div className="mx-auto max-w-lg px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">{toastBar}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Lazy Ledger</h1>
          <p className="text-sm text-ink-soft">
            {daysLogged > 0 ? `🔥 Logged ${daysLogged} of 7 days this week` : "New week, fresh start ✨"}
          </p>
        </div>
        <button
          onClick={() => open("settings")}
          aria-label="Settings"
          className="-mr-2 grid size-10 place-items-center rounded-full text-xl active:bg-card"
        >
          ⚙️
        </button>
      </header>

      <main className="flex-1 space-y-5 px-4 pb-48">
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-card" />
        ) : (
          <>
            {pending.length > 0 && <InboxBanner pending={pending} onOpen={() => open("inbox")} />}
            <Chips memory={memory} onTap={(m) => void handleChip(m)} />
            <SummaryStrip expenses={expenses} onOpen={() => open("spending")} />
            {(recent.length > 0 || expenses.length === 0) && (
              <RecentList expenses={recent} onDelete={handleDelete} onUpdate={update} />
            )}
          </>
        )}
      </main>

      {/* Thumb zone: everything you need to log lives at the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-bg via-bg to-transparent pt-8">
        <div className="mx-auto max-w-lg space-y-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {toastBar}
          {askQueue[0] && (
            <AskPrice
              key={askQueue[0].item + askQueue.length}
              item={askQueue[0].item}
              onSave={(n) => void handleAskedPrice(askQueue[0], n)}
              onSkip={() => setAskQueue((q) => q.slice(1))}
            />
          )}
          <QuickAdd
            onSubmit={handleText}
            onRemembered={handleRemembered}
            onPhoto={handlePhoto}
            onStatement={handleStatement}
            memory={memory}
            busy={busy}
            day={day}
            onDayChange={setDay}
          />
        </div>
      </div>
    </div>
  );
}

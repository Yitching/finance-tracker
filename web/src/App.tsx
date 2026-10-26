import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { useLedger } from "./lib/useLedger";
import { money, startOfDay, startOfWeek } from "./lib/money";
import type { Expense, Remembered } from "./lib/types";
import { Login } from "./components/Login";
import { QuickAdd } from "./components/QuickAdd";
import { Chips } from "./components/Chips";
import { Summary } from "./components/Summary";
import { RecentList } from "./components/RecentList";
import { AskPrice } from "./components/AskPrice";

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

function Home() {
  const { expenses, memory, loading, addText, addDirect, remove, restore, update } = useLedger();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [askQueue, setAskQueue] = useState<string[]>([]);
  const toastTimer = useRef<number | undefined>(undefined);

  function showToast(t: Toast) {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }

  function describe(rows: Expense[]) {
    if (rows.length === 1) return `${rows[0].item} ${money(rows[0].amount)}`;
    return `${rows.length} items · ${money(rows.reduce((s, r) => s + r.amount, 0))}`;
  }

  async function handleText(text: string) {
    setBusy(true);
    try {
      const { saved, missingPrice } = await addText(text);
      if (saved.length) {
        const ids = saved.map((r) => r.id);
        showToast({ text: `Added ${describe(saved)}`, undo: () => void remove(ids) });
      }
      if (missingPrice.length) setAskQueue((q) => [...q, ...missingPrice]);
      if (!saved.length && !missingPrice.length) showToast({ text: "Hmm, didn't catch any purchase there 🤔" });
    } catch {
      showToast({ text: "Couldn't reach the AI. Check your connection?" });
    } finally {
      setBusy(false);
    }
  }

  async function handleChip(m: Remembered) {
    navigator.vibrate?.(15);
    const row = await addDirect(m.display_name, m.last_amount, m.category, "chip");
    showToast({ text: `Added ${describe([row])}`, undo: () => void remove([row.id]) });
  }

  async function handleAskedPrice(item: string, amount: number) {
    setAskQueue((q) => q.slice(1));
    const row = await addDirect(item, amount, "Others", "manual");
    showToast({ text: `Added ${describe([row])} · tap it to set a category`, undo: () => void remove([row.id]) });
  }

  function handleDelete(e: Expense) {
    void remove([e.id]);
    showToast({ text: `Deleted ${e.item}`, undo: () => void restore([e]) });
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

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Lazy Ledger</h1>
          <p className="text-sm text-ink-soft">
            {daysLogged > 0 ? `🔥 Logged ${daysLogged} of 7 days this week` : "New week, fresh start ✨"}
          </p>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-ink-faint">
          Sign out
        </button>
      </header>

      <main className="flex-1 space-y-5 px-4 pb-48">
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-card" />
        ) : (
          <>
            <Summary expenses={expenses} />
            <RecentList expenses={expenses} onDelete={handleDelete} onUpdate={update} />
          </>
        )}
      </main>

      {/* Thumb zone: everything you need to log lives at the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-bg via-bg to-transparent pt-8">
        <div className="mx-auto max-w-lg space-y-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {toast && (
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
          )}
          {askQueue[0] && (
            <AskPrice
              key={askQueue[0] + askQueue.length}
              item={askQueue[0]}
              onSave={(n) => void handleAskedPrice(askQueue[0], n)}
              onSkip={() => setAskQueue((q) => q.slice(1))}
            />
          )}
          <Chips memory={memory} onTap={(m) => void handleChip(m)} />
          <QuickAdd onSubmit={handleText} busy={busy} />
        </div>
      </div>
    </div>
  );
}

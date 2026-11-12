import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { money, startOfDay } from "../lib/money";
import { periodRange } from "../lib/period";
import { CATEGORY_EMOJI, type Expense } from "../lib/types";
import { categoryBar, categoryChip } from "../lib/categoryStyle";
import { findRecurring, type RecurringCandidate } from "../lib/recurring";

type InsightResponse = {
  period: { key: string; from: string; to: string; daysElapsed: number; daysTotal: number; ongoing: boolean };
  totals: { thisPeriod: number; sameTimeLastPeriod: number; lastPeriodFull: number; projectedThisPeriod: number | null };
  headline: string;
  detail: string;
  highlights: { text: string; tone: "up" | "down" | "neutral" }[];
  tip: string | null;
  generatedAt: string | null;
};

function LocalAnalytics({ expenses }: { expenses: Expense[] }) {
  const { days, total, average, topCategories } = useMemo(() => {
    const today = startOfDay();
    const days = Array.from({ length: 14 }, (_, i) => { const day = new Date(today); day.setDate(today.getDate() - (13 - i)); const next = new Date(day); next.setDate(day.getDate() + 1); return { label: day.toLocaleDateString("en-SG", { weekday: "short" }), amount: expenses.filter((e) => { const t = new Date(e.spent_at); return t >= day && t < next; }).reduce((sum, e) => sum + e.amount, 0) }; });
    const total = expenses.reduce((sum, e) => sum + e.amount, 0); const activeDays = new Set(expenses.map((e) => new Date(e.spent_at).toDateString())).size;
    const categoryTotals = new Map<string, number>(); for (const e of expenses) categoryTotals.set(e.category, (categoryTotals.get(e.category) ?? 0) + e.amount);
    return { days, total, average: activeDays ? total / activeDays : 0, topCategories: [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4) };
  }, [expenses]);
  const max = Math.max(...days.map((d) => d.amount), 1);
  return <><section className="grid grid-cols-2 gap-3"><div className="rounded-3xl bg-lime-200/70 p-4 ring-1 ring-line dark:bg-lime-900/40"><div className="text-xs font-semibold text-ink-soft">Tracked total</div><div className="mt-1 text-2xl font-extrabold tabular-nums">{money(total)}</div></div><div className="rounded-3xl bg-amber-100 p-4 ring-1 ring-line dark:bg-amber-900/40"><div className="text-xs font-semibold text-ink-soft">Average active day</div><div className="mt-1 text-2xl font-extrabold tabular-nums">{money(average)}</div></div></section><section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line"><h2 className="font-bold">Last 14 days</h2><div className="mt-5 flex h-36 items-end gap-1.5" aria-label="Spending over the last 14 days">{days.map((d, i) => <div key={`${d.label}-${i}`} className="flex h-full flex-1 flex-col justify-end gap-1"><div className="bg-pop-gradient rounded-t-lg" style={{ height: `${Math.max(d.amount ? 8 : 2, (d.amount / max) * 112)}px` }} title={`${d.label}: ${money(d.amount)}`} /><span className="text-center text-[10px] text-ink-faint">{d.label.slice(0, 2)}</span></div>)}</div></section><section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line"><h2 className="font-bold">Top categories</h2><div className="mt-4 space-y-3">{topCategories.length ? topCategories.map(([category, amount]) => <div key={category}><div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-medium"><span className={`grid size-8 place-items-center rounded-xl ${categoryChip(category)}`}>{CATEGORY_EMOJI[category] ?? "📦"}</span>{category}</span><span className="tabular-nums text-ink-soft">{money(amount)}</span></div><div className="mt-1 h-2.5 rounded-full bg-bg"><div className={`h-full rounded-full ${categoryBar(category)}`} style={{ width: `${(amount / topCategories[0][1]) * 100}%` }} /></div></div>) : <p className="text-sm text-ink-soft">Add a few confirmed expenses to see patterns.</p>}</div></section></>;
}

export function Insights({ expenses, historyExpenses = expenses, historyLoading = false }: { expenses: Expense[]; historyExpenses?: Expense[]; historyLoading?: boolean }) {
  const recurring = useMemo(() => findRecurring(historyExpenses), [historyExpenses]);
  return <div className="space-y-5"><InsightCard /><LocalAnalytics expenses={expenses} /><RecurringSection candidates={recurring} loading={historyLoading} /></div>;
}

const TONE = { up: { mark: "▲", className: "text-danger" }, down: { mark: "▼", className: "text-accent" }, neutral: { mark: "•", className: "text-ink-faint" } };

/** The AI headline. Loads on open; the server caches it until your data or the day changes. */
function InsightCard() {
  const [result, setResult] = useState<InsightResponse | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (refresh: boolean) => { setBusy(true); setError(null); const { data, error: invokeError } = await supabase.functions.invoke<InsightResponse>("spending-insights", { body: { refresh } }); if (invokeError || !data || typeof data.headline !== "string") setError("Couldn't load your insight. Please try again."); else setResult(data); setBusy(false); }, []);
  useEffect(() => { void load(false); }, [load]);
  const p = result?.period; const t = result?.totals;
  return <section className="animate-fade-up rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
    <div className="flex items-center gap-2 text-xs text-ink-faint"><span className="flex-1">{p ? `${periodRange({ key: p.key, from: new Date(p.from), to: new Date(p.to) })}${p.ongoing ? ` · day ${p.daysElapsed} of ${p.daysTotal}` : ""}` : "This period"}</span><button onClick={() => void load(true)} disabled={busy} className="font-medium text-accent disabled:opacity-50">{busy ? "Thinking…" : "Refresh"}</button></div>
    {error && <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    {!result && busy && <div className="mt-3 space-y-2"><div className="h-6 w-4/5 animate-pulse rounded bg-bg" /><div className="h-4 w-3/5 animate-pulse rounded bg-bg" /></div>}
    {result && <div className={`mt-2 space-y-4 ${busy ? "opacity-60" : ""}`}>
      <div><p className="text-lg font-semibold leading-snug">{result.headline}</p>{result.detail && <p className="mt-1 text-sm text-ink-soft">{result.detail}</p>}</div>
      {t && t.thisPeriod > 0 && <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-2xl bg-bg p-3"><div className="text-xs text-ink-faint">So far</div><div className="mt-0.5 font-bold tabular-nums">{money(t.thisPeriod)}</div><div className="text-xs text-ink-soft">{money(t.sameTimeLastPeriod)} same time last period</div></div>{t.projectedThisPeriod !== null ? <div className="rounded-2xl bg-bg p-3"><div className="text-xs text-ink-faint">On pace for</div><div className="mt-0.5 font-bold tabular-nums">{money(t.projectedThisPeriod)}</div><div className="text-xs text-ink-soft">{money(t.lastPeriodFull)} last period</div></div> : <div className="rounded-2xl bg-bg p-3"><div className="text-xs text-ink-faint">Last period</div><div className="mt-0.5 font-bold tabular-nums">{money(t.lastPeriodFull)}</div></div>}</div>}
      {(result.highlights ?? []).length > 0 && <ul className="space-y-2 text-sm">{(result.highlights ?? []).map((h) => { const tone = TONE[h.tone] ?? TONE.neutral; return <li key={h.text} className="flex gap-2"><span className={tone.className}>{tone.mark}</span><span>{h.text}</span></li>; })}</ul>}
      {result.tip && <p className="rounded-2xl bg-amber-100 p-3 text-sm dark:bg-amber-900/40"><span className="font-semibold">Try: </span>{result.tip}</p>}
    </div>}
  </section>;
}

function RecurringSection({ candidates, loading }: { candidates: RecurringCandidate[]; loading: boolean }) {
  return <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line"><h2 className="font-bold">Likely recurring</h2><p className="mt-1 text-sm text-ink-soft">Confirmed charges with repeated timing and similar amounts. Nothing is scheduled or charged automatically.</p>{loading ? <div className="mt-4 h-16 animate-pulse rounded-2xl bg-bg" /> : candidates.length ? <ul className="mt-4 divide-y divide-line">{candidates.map((c) => <li key={`${c.name}-${c.nextDate}`} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="truncate font-medium">{c.name}</div><div className="mt-0.5 text-sm text-ink-soft">{c.cadence} · {c.occurrences} confirmed charges</div><div className="text-xs text-ink-faint">Next expected {new Date(c.nextDate).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}</div></div><div className="shrink-0 text-right font-semibold tabular-nums">{money(c.typicalAmount)}<div className="text-xs font-normal text-ink-faint">typical</div></div></div></li>)}</ul> : <p className="mt-4 text-sm text-ink-soft">Not enough consistent history yet. Three or more similar confirmed charges are needed.</p>}</section>;
}
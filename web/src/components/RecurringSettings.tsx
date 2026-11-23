import { useState } from "react";
import { dateValue, money, onDay } from "../lib/money";
import {
  describeCadence,
  nextDue,
  type Cadence,
  type RecurringDraft,
  type RecurringExpense,
} from "../lib/recurringExpenses";
import { CATEGORY_EMOJI } from "../lib/types";
import { categoryChip } from "../lib/categoryStyle";
import { CategoryPicker } from "./CategoryPicker";

const CADENCES: { value: Cadence; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const blank = (): RecurringDraft => ({
  item: "",
  amount: 0,
  category: "Bills",
  cadence: "monthly",
  start_date: dateValue(),
  end_date: null,
  to_inbox: false,
  paused: false,
});

const field = "w-full rounded-xl bg-bg px-3 py-2 text-sm outline-none ring-1 ring-line focus:ring-accent";
const short = (v: string) => onDay(v).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

/**
 * Settings → Recurring expenses: rent, insurance, subscriptions. Each one is added on its
 * due date (or sent to the Inbox to confirm), and shows on the Bills radar.
 */
export function RecurringSettings({
  rules,
  onSave,
  onDelete,
}: {
  rules: RecurringExpense[];
  onSave: (draft: RecurringDraft) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<RecurringDraft | null>(null);
  const [amountText, setAmountText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(draft: RecurringDraft) {
    setEditing(draft);
    setAmountText(draft.amount ? String(draft.amount) : "");
    setConfirmDelete(false);
    setError(null);
  }

  async function save() {
    if (!editing) return;
    const amount = Number(amountText);
    if (!editing.item.trim()) return setError("Give it a name, like Rent or Netflix.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter an amount over $0.");
    if (editing.end_date && editing.end_date < editing.start_date) return setError("The end date is before the first date.");
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...editing, item: editing.item.trim(), amount: Math.round(amount * 100) / 100 });
      setEditing(null);
    } catch {
      setError("Couldn't save that. Has the latest database migration been pushed?");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing?.id) return;
    setBusy(true);
    try {
      await onDelete(editing.id);
      setEditing(null);
    } catch {
      setError("Couldn't delete that. Try again?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-line">
      <div>
        <h2 className="text-lg font-semibold">🔁 Recurring expenses</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Rent, insurance, subscriptions. Each one is added on its due date, the next time you open the app, and shows on
          the Bills radar. Deleting one that was added doesn't bring it back. Skip ones your bank alerts already capture, or
          they'd count twice.
        </p>
      </div>

      {rules.length > 0 && (
        <ul className="divide-y divide-line">
          {rules.map((r) => {
            const next = nextDue(r);
            return (
              <li key={r.id}>
                <button onClick={() => open({ ...r })} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-2xl text-xl ${categoryChip(r.category)}`}>
                    {CATEGORY_EMOJI[r.category] ?? "📦"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.item}</span>
                    <span className="block truncate text-xs text-ink-soft">
                      {describeCadence(r)}
                      {r.to_inbox && " · to Inbox"}
                    </span>
                    <span className="block text-xs text-ink-faint">
                      {r.paused ? "Paused" : next ? `Next: ${short(next)}` : "Ended"}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{money(r.amount)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <div className="animate-fade-up space-y-3 rounded-2xl bg-bg/60 p-3 ring-1 ring-line">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <label className="text-xs text-ink-soft">
              Name
              <input
                value={editing.item}
                onChange={(e) => setEditing({ ...editing, item: e.target.value })}
                placeholder="e.g. Rent"
                maxLength={120}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Amount
              <input
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={`${field} mt-1 text-right tabular-nums`}
              />
            </label>
          </div>
          <CategoryPicker value={editing.category} onChange={(category) => setEditing({ ...editing, category })} bleed="-mx-3 px-3" />
          <div className="flex gap-1.5" role="group" aria-label="How often">
            {CADENCES.map((c) => (
              <button
                key={c.value}
                onClick={() => setEditing({ ...editing, cadence: c.value })}
                aria-pressed={editing.cadence === c.value}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ring-1 ${
                  editing.cadence === c.value ? "bg-ink text-bg ring-ink" : "ring-line"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-soft">
              First (or next) date
              <input
                type="date"
                value={editing.start_date}
                onChange={(e) => e.target.value && setEditing({ ...editing, start_date: e.target.value })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Ends (optional)
              <input
                type="date"
                value={editing.end_date ?? ""}
                onChange={(e) => setEditing({ ...editing, end_date: e.target.value || null })}
                className={`${field} mt-1`}
              />
            </label>
          </div>
          <p className="text-xs text-ink-faint">
            {describeCadence(editing)}. A date in the past adds the ones you've missed since then.
          </p>
          <Toggle
            label="Send to Inbox to confirm"
            hint="For bills whose amount changes, like electricity."
            on={editing.to_inbox}
            onChange={(to_inbox) => setEditing({ ...editing, to_inbox })}
          />
          {editing.id && (
            <Toggle label="Paused" on={editing.paused} onChange={(paused) => setEditing({ ...editing, paused })} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {editing.id &&
              (confirmDelete ? (
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-ink-soft">Delete? Past expenses stay.</span>
                  <button disabled={busy} onClick={() => void remove()} className="font-bold text-danger">
                    Delete
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="text-sm font-medium text-danger">
                  Delete
                </button>
              ))}
            <span className="flex-1" />
            <button onClick={() => setEditing(null)} className="rounded-xl px-3 py-2 text-sm font-medium text-ink-soft">
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={() => void save()}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      ) : (
        <button
          onClick={() => open(blank())}
          className="w-full rounded-xl border border-dashed border-line px-3 py-2.5 text-sm font-bold text-accent"
        >
          + Add a recurring expense
        </button>
      )}
    </section>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-ink-faint">{hint}</div>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

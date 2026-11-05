import { useMemo, useState } from "react";
import { dateValue, dayLabel, money, onDay } from "../lib/money";
import { CATEGORY_EMOJI, type Expense, type ExpensePatch } from "../lib/types";
import { CategoryPicker } from "./CategoryPicker";
import { DayPicker } from "./DayPicker";

type Props = {
  expenses: Expense[];
  onDelete: (e: Expense) => void;
  onUpdate: (id: string, patch: ExpensePatch) => void;
  /** Most rows to show; omit to show everything (the Spending screen). */
  limit?: number;
};

export function RecentList({ expenses, onDelete, onUpdate, limit }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of limit ? expenses.slice(0, limit) : expenses) {
      const label = dayLabel(e.spent_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(e);
    }
    return [...map.entries()];
  }, [expenses, limit]);

  if (!groups.length) {
    return (
      <div className="py-10 text-center text-ink-soft">
        <div className="text-4xl">🌱</div>
        <p className="mt-2">Nothing yet. Type your last purchase below.</p>
        <p className="text-sm text-ink-faint">Try: "kopi 1.8 and kaya toast 2.5"</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(([label, rows]) => (
        <section key={label}>
          <div className="mb-1.5 flex justify-between px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            <span>{label}</span>
            <span className="tabular-nums">{money(rows.reduce((s, r) => s + r.amount, 0))}</span>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">
            {rows.map((e) =>
              openId === e.id ? (
                <EditRow
                  key={e.id}
                  expense={e}
                  onDone={() => setOpenId(null)}
                  onDelete={() => {
                    setOpenId(null);
                    onDelete(e);
                  }}
                  onSave={(patch) => {
                    onUpdate(e.id, patch);
                    setOpenId(null);
                  }}
                />
              ) : (
                <li key={e.id}>
                  <button
                    onClick={() => setOpenId(e.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-bg"
                  >
                    <span className="text-xl">{CATEGORY_EMOJI[e.category] ?? "📦"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.item}</span>
                      {e.note && <span className="block truncate text-xs text-ink-soft">📝 {e.note}</span>}
                    </span>
                    <span className="font-medium tabular-nums">{money(e.amount)}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EditRow({
  expense,
  onSave,
  onDelete,
  onDone,
}: {
  expense: Expense;
  onSave: (patch: ExpensePatch) => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const [item, setItem] = useState(expense.item);
  const [amount, setAmount] = useState(String(expense.amount));
  const [category, setCategory] = useState(expense.category);
  const [day, setDay] = useState(dateValue(new Date(expense.spent_at)));
  const [note, setNote] = useState(expense.note ?? "");

  return (
    <li className="space-y-3 bg-bg/60 px-4 py-3">
      <div className="flex gap-2">
        <input
          value={item}
          onChange={(e) => setItem(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-card px-3 py-2 outline-none ring-1 ring-line focus:ring-accent"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="w-24 rounded-xl bg-card px-3 py-2 text-right tabular-nums outline-none ring-1 ring-line focus:ring-accent"
        />
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={280}
        placeholder="📝 Note, e.g. paid for Mei and hubby too"
        aria-label="Note"
        className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none ring-1 ring-line placeholder:text-ink-faint focus:ring-accent"
      />
      <CategoryPicker value={category} onChange={setCategory} />
      <DayPicker
        value={day}
        onChange={setDay}
        className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-line"
      >
        <span>📅</span>
        <span className="flex-1">{dayLabel(onDay(day).toISOString())}</span>
        <span className="text-ink-faint">Change</span>
      </DayPicker>
      <div className="flex gap-2 text-sm font-medium">
        <button onClick={onDelete} className="rounded-xl px-3 py-2 text-danger">
          Delete
        </button>
        <span className="flex-1" />
        <button onClick={onDone} className="rounded-xl px-3 py-2 text-ink-soft">
          Cancel
        </button>
        <button
          onClick={() => {
            const n = Number(amount);
            const moved = day !== dateValue(new Date(expense.spent_at));
            onSave({
              item: item.trim() || expense.item,
              amount: Number.isFinite(n) && n >= 0 ? n : expense.amount,
              category,
              note: note.trim() || null,
              // Same time of day, new date
              ...(moved ? { spent_at: onDay(day, new Date(expense.spent_at)).toISOString() } : {}),
            });
          }}
          className="rounded-xl bg-accent px-4 py-2 text-white"
        >
          Save
        </button>
      </div>
    </li>
  );
}

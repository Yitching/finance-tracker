import { useMemo, useState } from "react";
import { dayLabel, money } from "../lib/money";
import { CATEGORY_EMOJI, type Expense } from "../lib/types";
import { CategoryPicker } from "./CategoryPicker";

type Props = {
  expenses: Expense[];
  onDelete: (e: Expense) => void;
  onUpdate: (id: string, patch: Partial<Pick<Expense, "amount" | "category" | "item">>) => void;
};

export function RecentList({ expenses, onDelete, onUpdate }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of expenses.slice(0, 80)) {
      const label = dayLabel(e.spent_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(e);
    }
    return [...map.entries()];
  }, [expenses]);

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
                    <span className="min-w-0 flex-1 truncate">{e.item}</span>
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
  onSave: (patch: Partial<Pick<Expense, "amount" | "category" | "item">>) => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const [item, setItem] = useState(expense.item);
  const [amount, setAmount] = useState(String(expense.amount));
  const [category, setCategory] = useState(expense.category);

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
      <CategoryPicker value={category} onChange={setCategory} />
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
            onSave({
              item: item.trim() || expense.item,
              amount: Number.isFinite(n) && n >= 0 ? n : expense.amount,
              category,
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

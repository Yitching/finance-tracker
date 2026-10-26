import { useEffect, useRef, useState } from "react";
import { dayLabel, money, timeLabel } from "../lib/money";
import { CATEGORY_EMOJI, type Expense, type PendingExpense } from "../lib/types";
import { CategoryPicker } from "./CategoryPicker";
import { ScreenHeader } from "./ScreenHeader";

type Patch = Partial<Pick<Expense, "item" | "amount" | "category">>;

const sum = (rows: PendingExpense[]) => rows.reduce((s, e) => s + (e.amount ?? 0), 0);

/** "3 to confirm · $57.50", plus how many still need an amount. */
function headline(rows: PendingExpense[]) {
  const unpriced = rows.filter((e) => e.amount === null).length;
  return `${rows.length} to confirm · ${money(sum(rows))}${unpriced ? ` · ${unpriced} without amount` : ""}`;
}

/** Home-screen nudge: "3 to confirm · $57.50". */
export function InboxBanner({ pending, onOpen }: { pending: PendingExpense[]; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 text-left text-white shadow-sm transition active:scale-[0.98]"
    >
      <span className="text-xl">📥</span>
      <span className="flex-1 font-semibold tabular-nums">{headline(pending)}</span>
      <span className="text-2xl leading-none">›</span>
    </button>
  );
}

type Props = {
  pending: PendingExpense[];
  /** pending id → the expense it probably repeats */
  duplicates: Map<string, PendingExpense>;
  /** `amount` is set when you filled in a charge that arrived without one. */
  onKeep: (e: PendingExpense, amount?: number) => void;
  onToss: (e: PendingExpense) => void;
  onKeepAll: () => void;
  onUpdate: (id: string, patch: Patch) => void;
  onBack: () => void;
};

export function Inbox({ pending, duplicates, onKeep, onToss, onKeepAll, onUpdate, onBack }: Props) {
  const [celebrate, setCelebrate] = useState(false);
  const hadItems = useRef(pending.length > 0);

  // Only celebrate when you clear the inbox, not when you open an empty one.
  useEffect(() => {
    if (pending.length > 0) {
      hadItems.current = true;
    } else if (hadItems.current) {
      hadItems.current = false;
      setCelebrate(true);
      navigator.vibrate?.([20, 60, 20]);
    }
  }, [pending.length]);

  const dupes = pending.filter((e) => duplicates.has(e.id)).length;
  const unpriced = pending.filter((e) => e.amount === null).length;
  const keepable = pending.filter((e) => !duplicates.has(e.id) && e.amount !== null).length;
  const skips = [
    dupes && `${dupes} likely duplicate${dupes > 1 ? "s" : ""}`,
    unpriced && `${unpriced} without an amount`,
  ].filter(Boolean);
  const top = pending[0];

  return (
    <div className="flex flex-1 flex-col px-4 pb-24">
      <ScreenHeader
        title="Inbox"
        onBack={onBack}
        subtitle={pending.length ? headline(pending) : "Nothing waiting"}
        action={
          keepable > 0 && (
            <button
              onClick={onKeepAll}
              className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white active:scale-95"
            >
              Keep all
            </button>
          )
        }
      />

      {top ? (
        <>
          {skips.length > 0 && keepable > 0 && (
            <p className="mb-3 text-sm text-ink-soft">“Keep all” skips {skips.join(" and ")}.</p>
          )}
          <SwipeCard
            key={top.id}
            expense={top}
            behind={Math.min(2, pending.length - 1)}
            dupe={duplicates.get(top.id)}
            onKeep={(amount) => onKeep(top, amount)}
            onToss={() => onToss(top)}
            onUpdate={(patch) => onUpdate(top.id, patch)}
          />
        </>
      ) : (
        <InboxZero celebrate={celebrate} onBack={onBack} />
      )}
    </div>
  );
}

const SWIPE = 90; // px past which a release counts as a swipe

function SwipeCard({
  expense: e,
  behind,
  dupe,
  onKeep,
  onToss,
  onUpdate,
}: {
  expense: PendingExpense;
  behind: number;
  dupe?: PendingExpense;
  onKeep: (amount?: number) => void;
  onToss: () => void;
  onUpdate: (patch: Patch) => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [gone, setGone] = useState<0 | 1 | -1>(0);
  const [editing, setEditing] = useState(false);
  // For a charge that arrived without an amount (often PayNow): what you type in.
  const [price, setPrice] = useState("");
  const priceRef = useRef<HTMLInputElement>(null);
  const startX = useRef(0);

  function fling(dir: 1 | -1) {
    if (gone) return;
    const n = Number(price);
    const priced = price.trim() !== "" && Number.isFinite(n) && n > 0;
    if (dir === 1 && e.amount === null && !priced) {
      // Can't keep it without a price: snap back and ask.
      setDx(0);
      priceRef.current?.focus();
      navigator.vibrate?.([10, 40, 10]);
      return;
    }
    navigator.vibrate?.(15);
    setGone(dir);
    window.setTimeout(() => (dir === 1 ? onKeep(e.amount === null ? n : undefined) : onToss()), 180);
  }

  const x = gone ? gone * window.innerWidth * 1.2 : dx;
  const stamp = (v: number) => Math.max(0, Math.min(1, v / SWIPE));

  return (
    <div>
      <div className="relative">
        {/* The next cards peeking out underneath */}
        {Array.from({ length: behind }, (_, i) => behind - i).map((depth) => (
          <div
            key={depth}
            aria-hidden
            className="absolute inset-0 rounded-3xl bg-card ring-1 ring-line"
            style={{ transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.05})` }}
          />
        ))}

        <article
          onPointerDown={(ev) => {
            if (editing || gone) return;
            startX.current = ev.clientX;
            setDragging(true);
            ev.currentTarget.setPointerCapture(ev.pointerId);
          }}
          onPointerMove={(ev) => dragging && setDx(ev.clientX - startX.current)}
          onPointerUp={() => {
            if (!dragging) return;
            setDragging(false);
            if (dx > SWIPE) fling(1);
            else if (dx < -SWIPE) fling(-1);
            else setDx(0);
          }}
          onPointerCancel={() => {
            setDragging(false);
            setDx(0);
          }}
          style={{
            transform: `translateX(${x}px) rotate(${x / 18}deg)`,
            transition: dragging ? "none" : "transform 200ms ease-out",
          }}
          className={`relative rounded-3xl bg-card p-5 shadow-lg ring-1 ring-line ${
            editing ? "" : "touch-pan-y select-none"
          }`}
        >
          <span
            aria-hidden
            style={{ opacity: stamp(x) }}
            className="absolute top-5 left-5 -rotate-12 rounded-lg border-2 border-good px-2 py-0.5 text-sm font-bold tracking-widest text-good uppercase"
          >
            Keep
          </span>
          <span
            aria-hidden
            style={{ opacity: stamp(-x) }}
            className="absolute top-5 right-5 rotate-12 rounded-lg border-2 border-danger px-2 py-0.5 text-sm font-bold tracking-widest text-danger uppercase"
          >
            Toss
          </span>

          {editing ? (
            <CardEditor
              expense={e}
              onCancel={() => setEditing(false)}
              onSave={(patch) => {
                onUpdate(patch);
                setEditing(false);
              }}
            />
          ) : (
            <>
              <div className="pt-6 text-center">
                <div className="text-5xl">{CATEGORY_EMOJI[e.category] ?? "📦"}</div>
                <div className="mt-3 text-xl font-semibold">{e.item}</div>
                {e.amount === null ? (
                  <>
                    <label className="mt-2 flex items-center justify-center gap-1">
                      <span className="text-3xl font-bold text-ink-faint">$</span>
                      <input
                        ref={priceRef}
                        value={price}
                        onChange={(ev) => setPrice(ev.target.value)}
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onKeyDown={(ev) => ev.key === "Enter" && fling(1)}
                        autoFocus
                        inputMode="decimal"
                        enterKeyHint="done"
                        placeholder="How much?"
                        aria-label="Amount"
                        className="w-44 rounded-2xl bg-bg px-3 py-2 text-center text-3xl font-bold tabular-nums outline-none ring-2 ring-accent/40 placeholder:text-xl placeholder:font-medium placeholder:text-ink-faint focus:ring-accent"
                      />
                    </label>
                    <div className="mt-1 text-xs text-ink-soft">
                      The alert didn't say how much. Fill it in to keep it.
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{money(e.amount)}</div>
                )}
                <div className="mt-2 text-sm text-ink-soft">
                  {e.category} · {dayLabel(e.spent_at)}, {timeLabel(e.spent_at)}
                </div>
                {e.merchant && e.merchant !== e.item && (
                  <div className="mt-1 font-mono text-xs text-ink-faint">{e.merchant}</div>
                )}
              </div>

              {dupe && (
                <div className="mt-4 rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger">
                  ⚠️ Likely duplicate:{" "}
                  {dupe.status === "pending" ? "another alert for " : "you already added "}
                  <b>
                    {dupe.status === "pending" ? money(dupe.amount ?? 0) : `${dupe.item} ${money(dupe.amount ?? 0)}`}
                  </b>{" "}
                  at {timeLabel(dupe.spent_at)}
                </div>
              )}

              {e.raw_input && (
                <p className="mt-4 line-clamp-3 rounded-2xl bg-bg px-3 py-2 text-xs whitespace-pre-line text-ink-soft">
                  {e.raw_input}
                </p>
              )}
            </>
          )}
        </article>
      </div>

      {!editing && (
        <>
          <div className="mt-8 flex items-center justify-center gap-5">
            <button
              onClick={() => fling(-1)}
              aria-label="Toss"
              className="grid size-16 place-items-center rounded-full bg-card text-2xl text-danger shadow-md ring-1 ring-line active:scale-90"
            >
              ✕
            </button>
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit"
              className="grid size-12 place-items-center rounded-full bg-card text-lg shadow-sm ring-1 ring-line active:scale-90"
            >
              ✏️
            </button>
            <button
              onClick={() => fling(1)}
              aria-label="Keep"
              className="grid size-16 place-items-center rounded-full bg-accent text-2xl text-white shadow-md active:scale-90"
            >
              ✓
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-ink-faint">Swipe right to keep, left to toss</p>
        </>
      )}
    </div>
  );
}

function CardEditor({
  expense,
  onSave,
  onCancel,
}: {
  expense: PendingExpense;
  onSave: (patch: Patch) => void;
  onCancel: () => void;
}) {
  const [item, setItem] = useState(expense.item);
  const [amount, setAmount] = useState(expense.amount === null ? "" : String(expense.amount));
  const [category, setCategory] = useState(expense.category);

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        const n = Number(amount);
        const valid = amount.trim() !== "" && Number.isFinite(n) && n >= 0;
        onSave({ item: item.trim() || expense.item, category, ...(valid ? { amount: n } : {}) });
      }}
      className="space-y-3 pt-8"
    >
      <div className="flex gap-2">
        <input
          value={item}
          onChange={(ev) => setItem(ev.target.value)}
          aria-label="Name"
          className="min-w-0 flex-1 rounded-xl bg-bg px-3 py-2 outline-none ring-1 ring-line focus:ring-accent"
        />
        <input
          value={amount}
          onChange={(ev) => setAmount(ev.target.value)}
          aria-label="Amount"
          inputMode="decimal"
          className="w-24 rounded-xl bg-bg px-3 py-2 text-right tabular-nums outline-none ring-1 ring-line focus:ring-accent"
        />
      </div>
      <CategoryPicker value={category} onChange={setCategory} bleed="-mx-5 px-5" />
      {expense.merchant && (
        <p className="text-xs text-ink-soft">
          Future <span className="font-mono">{expense.merchant}</span> charges will arrive with this name and
          category.
        </p>
      )}
      <div className="flex justify-end gap-2 text-sm font-medium">
        <button type="button" onClick={onCancel} className="rounded-xl px-3 py-2 text-ink-soft">
          Cancel
        </button>
        <button className="rounded-xl bg-accent px-4 py-2 text-white">Save</button>
      </div>
    </form>
  );
}

// Inbox-zero confetti: pieces spread around a circle, each flying to its own spot.
const PIECES = Array.from({ length: 24 }, (_, i) => {
  const angle = (i / 24) * Math.PI * 2 + (i % 3) * 0.25;
  const dist = 90 + (i % 4) * 30;
  return {
    emoji: ["🎉", "✨", "🪙", "🥳", "💸"][i % 5],
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    r: (i % 2 ? 1 : -1) * (120 + i * 15),
    delay: (i % 4) * 35,
  };
});

function InboxZero({ celebrate, onBack }: { celebrate: boolean; onBack: () => void }) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div>
        <div className="relative inline-block text-6xl">
          {celebrate ? "🎉" : "📭"}
          {celebrate && (
            <div aria-hidden className="burst pointer-events-none absolute top-1/2 left-1/2">
              {PIECES.map((p, i) => (
                <span
                  key={i}
                  style={
                    {
                      "--x": `${p.x}px`,
                      "--y": `${p.y}px`,
                      "--r": `${p.r}deg`,
                      "--d": `${p.delay}ms`,
                    } as React.CSSProperties
                  }
                >
                  {p.emoji}
                </span>
              ))}
            </div>
          )}
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">Inbox zero</h2>
        <p className="mt-1 text-ink-soft">
          {celebrate ? "All sorted. Nice one." : "New charges from your phone will show up here."}
        </p>
        <button
          onClick={onBack}
          className="mt-6 rounded-2xl bg-accent px-6 py-3 font-semibold text-white active:scale-95"
        >
          Back home
        </button>
      </div>
    </div>
  );
}

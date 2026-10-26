import { useState } from "react";

/** Shown when the AI saw an item it couldn't price ("laksa" with no amount, never bought before). */
export function AskPrice({
  item,
  onSave,
  onSkip,
}: {
  item: string;
  onSave: (amount: number) => void;
  onSkip: () => void;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) onSave(n);
      }}
      className="flex items-center gap-2 rounded-2xl bg-card p-2 pl-4 shadow-sm ring-1 ring-accent/40"
    >
      <span className="min-w-0 flex-1 truncate text-sm">
        How much was <b>{item}</b>?
      </span>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder="0.00"
        className="w-20 rounded-xl bg-bg px-2 py-2 text-right tabular-nums outline-none"
      />
      <button className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white">Add</button>
      <button type="button" onClick={onSkip} className="px-2 text-sm text-ink-soft">
        Skip
      </button>
    </form>
  );
}

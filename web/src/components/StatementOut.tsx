import { useState } from "react";
import { startOfDay } from "../lib/money";
import { periodTitle, type Period } from "../lib/period";

/**
 * "Statement's out? Start a new budget": ends the current period today, for when the
 * card statement arrives before your usual statement day. Asks first, in place.
 * `tone="pop"` sits on the pink gradient (Home); `tone="card"` on a plain card.
 */
export function StatementOut({
  current,
  next,
  statementDay,
  onConfirm,
  tone = "card",
}: {
  current: Period;
  /** The period that would start today. */
  next: Period;
  statementDay: number;
  onConfirm: () => Promise<void> | void;
  tone?: "pop" | "card";
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const pop = tone === "pop";
  // Nothing to end if the period only started today.
  if (startOfDay().getTime() <= current.from.getTime()) return null;

  if (!asking) {
    return (
      <button
        onClick={() => setAsking(true)}
        className={`text-sm font-bold underline underline-offset-4 active:scale-95 ${
          pop ? "text-white/95 decoration-white/40" : "text-accent decoration-accent/30"
        }`}
      >
        🧾 Statement's out? Start a new budget
      </button>
    );
  }

  return (
    <div className={`animate-fade-up rounded-2xl p-3 text-sm ${pop ? "bg-white/20" : "bg-bg ring-1 ring-line"}`}>
      <p className={pop ? "text-white" : ""}>
        End <b>{periodTitle(current, statementDay)}</b> today and start <b>{periodTitle(next, statementDay)}</b>?
        Spending from today counts towards the new budget.
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              setAsking(false);
            } finally {
              setBusy(false);
            }
          }}
          className={`rounded-full px-4 py-2 font-bold transition active:scale-95 disabled:opacity-60 ${
            pop ? "bg-white text-pink-600" : "bg-ink text-bg"
          }`}
        >
          {busy ? "Starting…" : "Start new budget"}
        </button>
        <button
          onClick={() => setAsking(false)}
          className={`rounded-full px-4 py-2 font-bold ${pop ? "text-white/90" : "text-ink-soft"}`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

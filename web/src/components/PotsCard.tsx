import { money } from "../lib/money";
import type { Pot } from "../lib/pots";
import { categoryBar, categoryChip } from "../lib/categoryStyle";

/**
 * Pots on Home: mini-budgets inside the monthly cap. A spending pot fills from
 * real spending in its category this period; a saving pot fills as you top it
 * up. Bars warn at 80% and turn pink when a pot tips over.
 * Playful Pop: pastel chips and bars on a plain card, under the budget ring.
 */
export function PotsCard({
  pots,
  spentByCategory,
  onAddToPot,
  onManage,
}: {
  pots: Pot[];
  spentByCategory: Record<string, number>;
  onAddToPot: (id: string, amount: number) => void;
  onManage: () => void;
}) {
  return (
    <section className="animate-fade-up rounded-3xl bg-card p-4 shadow-sm ring-1 ring-line">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-extrabold">🫙 Pots</h2>
        <span className="flex-1" />
        <button onClick={onManage} className="text-sm font-bold text-accent active:scale-95">
          Manage
        </button>
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">Mini-budgets inside your $1,200 — each pot fills, warns, and tips over.</p>

      {pots.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-bg px-3 py-3 text-sm text-ink-soft">
          No pots yet. Add one in Settings → Pots.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {pots.map((pot) => {
            const spent = pot.kind === "spend" ? (spentByCategory[pot.category ?? ""] ?? 0) : 0;
            const filled = pot.kind === "spend" ? spent : pot.saved;
            const pct = pot.amount > 0 ? filled / pot.amount : 0;
            const over = pot.kind === "spend" && filled > pot.amount;
            const hit = pot.kind === "save" && filled >= pot.amount;
            const warn = !over && !hit && pct >= 0.8;
            const bar =
              pot.kind === "save"
                ? hit
                  ? "bg-emerald-500"
                  : "bg-lime-400"
                : over
                  ? "bg-pink-500"
                  : warn
                    ? "bg-amber-500"
                    : categoryBar(pot.category ?? "");
            const status =
              pot.kind === "save"
                ? hit
                  ? "Target hit! 🎉"
                  : `${money(pot.amount - filled)} to go`
                : over
                  ? `Over by ${money(filled - pot.amount)} 😅`
                  : warn
                    ? `${money(pot.amount - filled)} left — nearly there`
                    : `${money(pot.amount - filled)} left`;
            return (
              <li key={pot.id}>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl text-lg ${
                      pot.kind === "save" ? "bg-amber-100 dark:bg-amber-900/50" : categoryChip(pot.category ?? "")
                    }`}
                  >
                    {pot.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold">{pot.name}</span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">
                        {money(filled)} <span className="font-medium text-ink-faint">of {money(pot.amount)}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-bg ring-1 ring-line/50">
                      <div
                        className={`h-full rounded-full ${bar}`}
                        style={{ width: `${Math.min(pct, 1) * 100}%`, transition: "width 0.6s ease" }}
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
                      <span className={over ? "font-bold text-pink-600 dark:text-pink-400" : hit ? "font-bold text-emerald-600 dark:text-emerald-400" : ""}>
                        {status}
                      </span>
                      <span className="flex-1" />
                      {pot.kind === "save" && !hit && (
                        <span className="flex gap-1">
                          {[10, 50].map((n) => (
                            <button
                              key={n}
                              onClick={() => onAddToPot(pot.id, n)}
                              className="rounded-full bg-lime-100 px-2.5 py-1 text-xs font-bold text-lime-800 transition active:scale-95 dark:bg-lime-900/60 dark:text-lime-200"
                            >
                              +${n}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import { money, moneyWhole } from "../lib/money";
import type { Pot } from "../lib/pots";
import { categoryBar } from "../lib/categoryStyle";

/**
 * Pots on Home, as jars: mini-budgets inside the monthly cap.
 * A spending jar holds what's left in its category this period and drains as you
 * log; it turns amber near the bottom and pink once it's empty. Go over and it
 * overflows: brim-full of pink, lid popped, drips down the sides and a puddle that
 * spreads the further over you are. A saving jar fills
 * as you top it up, and turns green when it hits the target.
 * The liquid level is the money, so nobody has to read a percentage.
 */
export function PotsCard({
  pots,
  spentByCategory,
  budget,
  onAddToPot,
  onManage,
}: {
  pots: Pot[];
  spentByCategory: Record<string, number>;
  budget: number;
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
      <p className="mt-0.5 text-xs text-ink-soft">
        Mini-budgets inside your {moneyWhole(budget)}. Spending jars drain as you log; saving jars fill up.
      </p>

      {pots.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-bg px-3 py-3 text-sm text-ink-soft">No pots yet. Add one in Settings → Pots.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-x-2 gap-y-4">
          {pots.map((pot) => (
            <Jar
              key={pot.id}
              pot={pot}
              spent={pot.kind === "spend" ? (spentByCategory[pot.category ?? ""] ?? 0) : 0}
              onAdd={(n) => onAddToPot(pot.id, n)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Jar({ pot, spent, onAdd }: { pot: Pot; spent: number; onAdd: (amount: number) => void }) {
  const save = pot.kind === "save";
  const left = pot.amount - spent;
  // Spending jars hold what's left; saving jars hold what's saved.
  const level = save ? pot.saved / pot.amount : Math.max(0, left) / pot.amount;
  const over = !save && left < 0;
  const empty = !save && left <= 0;
  const low = !save && !empty && level < 0.2;
  const hit = save && pot.saved >= pot.amount;
  const liquid = save
    ? hit
      ? "bg-emerald-500"
      : "bg-lime-400"
    : empty
      ? "bg-pink-500"
      : low
        ? "bg-amber-500"
        : categoryBar(pot.category ?? "");
  const status = save
    ? hit
      ? "Target hit! 🎉"
      : `${moneyWhole(pot.amount - pot.saved)} to go`
    : over
      ? `Over by ${moneyWhole(-left)}`
      : empty
        ? "Empty"
        : low
          ? `${moneyWhole(left)} left!`
          : `${moneyWhole(left)} left`;
  // Over budget: the jar is brim-full and spilling; the puddle grows with how far over.
  const fill = over ? 1 : Math.min(1, level);
  const shownPct = over ? Math.round((spent / pot.amount) * 100) : Math.round(fill * 100);
  const spread = over ? 4 + Math.min(1, -left / pot.amount) * 12 : 0;
  const label = save
    ? `${pot.name}: ${money(pot.saved)} saved of ${money(pot.amount)}`
    : `${pot.name}: ${money(Math.max(0, left))} left of ${money(pot.amount)}${over ? `, over by ${money(-left)}` : ""}`;

  return (
    <li className="flex min-w-0 flex-col items-center text-center" aria-label={label}>
      <div className={`relative w-full max-w-[5.5rem] ${over ? "jar-shake" : ""}`} aria-hidden>
        {/* Lid, knocked off when the jar overflows */}
        <div
          className={`mx-auto h-2.5 w-3/5 rounded-t-md rounded-b-sm bg-ink-faint/60 ${over ? "jar-lid-off" : ""}`}
        />
        <div className="relative mt-0.5">
        {/* Glass */}
        <div className="relative h-28 overflow-hidden rounded-t-xl rounded-b-[1.6rem] bg-bg">
          {/* Liquid; re-keyed on the amount so it sloshes when you log something */}
          <div
            key={save ? pot.saved : spent}
            className="jar-slosh absolute inset-x-0 bottom-0"
            style={{ height: `${fill * 100}%`, transition: "height 0.7s cubic-bezier(0.22, 1, 0.36, 1)" }}
          >
            {fill > 0 && !over && (
              <div className="absolute -top-2 left-0 h-2.5 w-[200%] overflow-hidden">
                <div className={`jar-wave h-full w-full ${liquid}`} />
              </div>
            )}
            <div className={`h-full w-full ${liquid}`} />
          </div>
          {/* Glass shine */}
          <div className="absolute top-3 left-2 h-12 w-1.5 rounded-full bg-white/50" />
          <div
            className={`absolute inset-x-0 bottom-2 text-sm font-extrabold tabular-nums ${
              fill > 0.25 ? "text-white drop-shadow-sm" : "text-ink"
            }`}
          >
            {shownPct}%
          </div>
          <div className="absolute inset-x-0 top-2 text-lg">{pot.emoji}</div>
        </div>
        {/* The glass edge, drawn over the liquid */}
        <div
          className={`pointer-events-none absolute inset-0 rounded-t-xl rounded-b-[1.6rem] ring-2 ring-inset ${
            over ? "ring-pink-700/50 dark:ring-pink-300/60" : "ring-ink-faint/50"
          }`}
        />
        {over && (
          <>
            {/* A dome of liquid bulging over the rim */}
            <div className="jar-brim absolute -top-2.5 inset-x-0 h-4 rounded-t-full rounded-b-md bg-pink-500" />
            {/* Drips: two down the outside, two down the front, each dropping off its tip */}
            {[
              { pos: "-left-[5px] w-[5px]", length: "64%", delay: "0s", tone: "bg-pink-500" },
              { pos: "-right-[5px] w-[5px]", length: "40%", delay: "0.35s", tone: "bg-pink-500" },
              { pos: "left-[28%] w-1.5", length: "30%", delay: "0.2s", tone: "bg-pink-700" },
              { pos: "right-[22%] w-1", length: "18%", delay: "0.55s", tone: "bg-pink-700" },
            ].map((d) => (
              <div key={d.pos} className={`absolute top-0 ${d.pos}`} style={{ height: d.length }}>
                <div className={`jar-drip h-full w-full rounded-b-full ${d.tone}`} style={{ animationDelay: d.delay }} />
                <div
                  className={`jar-drop absolute -bottom-1.5 left-1/2 -ml-[3px] size-1.5 rounded-full ${d.tone}`}
                  style={{ animationDelay: `calc(${d.delay} + 1s)` }}
                />
              </div>
            ))}
            {/* The puddle */}
            <div
              className="jar-puddle absolute -bottom-2.5 h-2.5 rounded-[50%] bg-pink-500/70"
              style={{ left: `${-spread}%`, right: `${-spread}%` }}
            />
          </>
        )}
        </div>
      </div>
      <div className={`${over ? "mt-3.5" : "mt-1.5"} w-full truncate text-xs font-bold`}>{pot.name}</div>
      <div
        className={`text-[11px] tabular-nums ${
          empty ? "font-bold text-pink-600 dark:text-pink-400" : hit ? "font-bold text-emerald-600 dark:text-emerald-400" : low ? "font-bold text-amber-600 dark:text-amber-400" : "text-ink-soft"
        }`}
      >
        {status}
      </div>
      <div className="text-[10px] text-ink-faint tabular-nums">of {moneyWhole(pot.amount)}</div>
      {save && !hit && (
        <div className="mt-1 flex gap-1">
          {[10, 50].map((n) => (
            <button
              key={n}
              onClick={() => onAdd(n)}
              aria-label={`Add $${n} to ${pot.name}`}
              className="rounded-full bg-lime-100 px-2 py-0.5 text-[11px] font-bold text-lime-800 transition active:scale-95 dark:bg-lime-900/60 dark:text-lime-200"
            >
              +${n}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

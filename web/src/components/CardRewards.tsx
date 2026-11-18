import { useMemo } from "react";
import { money, moneyWhole } from "../lib/money";
import { periodRange, periodTitle, type Period } from "../lib/period";
import { cardFor, cardProgress, rankCards, type CardSettings } from "../lib/cards";
import { CATEGORIES, CATEGORY_EMOJI, type Expense } from "../lib/types";
import { categoryChip } from "../lib/categoryStyle";

const units = (n: number, unit: "cashback" | "miles") =>
  unit === "cashback" ? money(n) : `${Math.round(n).toLocaleString("en-SG")} miles`;

/**
 * Card rewards: which card to tap for each category right now, and what each card
 * has earned this period. "Right now" accounts for bonus caps you've already used up
 * and minimum spends you haven't reached yet.
 */
export function CardRewards({
  settings,
  expenses,
  period,
  statementDay,
  onManage,
}: {
  settings: CardSettings;
  /** Confirmed expenses in the current period. */
  expenses: Expense[];
  period: Period;
  statementDay: number | null;
  onManage: () => void;
}) {
  const { cards, mileValue } = settings;
  const { progress, untagged, byCategory } = useMemo(() => {
    const rows = new Map(cards.map((c) => [c.id, [] as Expense[]]));
    const untagged: Expense[] = [];
    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
      const card = cardFor(e, cards);
      if (card) rows.get(card.id)!.push(e);
      else untagged.push(e);
    }
    return { progress: cards.map((c) => cardProgress(c, rows.get(c.id)!, mileValue)), untagged, byCategory };
  }, [cards, expenses, mileValue]);

  if (!cards.length) {
    return (
      <section className="animate-fade-up rounded-3xl bg-card p-6 text-center shadow-sm ring-1 ring-line">
        <div className="text-5xl">💳</div>
        <h2 className="mt-3 text-lg font-extrabold">Which card should I use?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Add your credit cards with their cashback or miles rates, bonus categories and monthly caps. Lazy Ledger then
          tells you the best card for each kind of spending, and tracks what each card has earned.
        </p>
        <button
          onClick={onManage}
          className="bg-pop-gradient mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md transition active:scale-95"
        >
          Add your cards
        </button>
      </section>
    );
  }

  const totalValue = progress.reduce((s, p) => s + p.value, 0);
  const miles = progress.filter((p) => p.card.unit === "miles").reduce((s, p) => s + p.earned, 0);
  const cashback = progress.filter((p) => p.card.unit === "cashback").reduce((s, p) => s + p.earned, 0);
  const untaggedTotal = untagged.reduce((s, e) => s + e.amount, 0);
  // Categories you spend most on first.
  const categories = [...CATEGORIES].sort((a, b) => (byCategory[b] ?? 0) - (byCategory[a] ?? 0));

  return (
    <div className="space-y-5">
      <section className="bg-pop-gradient animate-fade-up rounded-3xl p-5 text-white shadow-lg shadow-pink-200/60 dark:shadow-none">
        <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold">Earned this period</span>
        <div className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums">{money(totalValue)}</div>
        <p className="mt-1 text-sm text-white/90">
          {[miles > 0 && units(miles, "miles"), cashback > 0 && `${money(cashback)} cashback`].filter(Boolean).join(" + ") ||
            "Nothing earned yet"}{" "}
          · {statementDay ? `${periodTitle(period, statementDay)}, ` : ""}{periodRange(period)}
        </p>
        {miles > 0 && <p className="mt-0.5 text-xs text-white/80">Miles valued at {mileValue}¢ each.</p>}
      </section>

      <section className="animate-fade-up rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
        <h2 className="font-bold">Best card right now</h2>
        <p className="mt-0.5 text-sm text-ink-soft">For your next purchase in each category, after caps used so far.</p>
        <ul className="mt-3 divide-y divide-line">
          {categories.map((category) => {
            const [best, next] = rankCards(category, progress, mileValue);
            return (
              <li key={category} className="flex items-center gap-3 py-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-2xl text-xl ${categoryChip(category)}`}>
                  {CATEGORY_EMOJI[category] ?? "📦"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink-faint">{category}</span>
                  <span className="block truncate font-bold">{best.card.name}</span>
                  {(best.note || next) && (
                    <span className="block text-xs text-ink-soft">
                      {best.note ?? (next && next.pct < best.pct ? `Next best: ${next.card.name}` : "")}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                    best.onBonus ? "bg-lime-200 text-lime-900 dark:bg-lime-400/20 dark:text-lime-100" : "bg-bg text-ink-soft"
                  }`}
                >
                  {best.rateLabel}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-bold">Your cards</h2>
          <button onClick={onManage} className="text-sm font-bold text-accent">
            Manage
          </button>
        </div>
        {progress.map((p) => (
          <article key={p.card.id} className="animate-fade-up rounded-3xl bg-card p-4 shadow-sm ring-1 ring-line">
            <div className="flex items-start gap-3">
              <span className="bg-pop-gradient grid h-9 w-12 shrink-0 place-items-center rounded-lg text-xs font-extrabold text-white">
                {p.card.last4 ? `••${p.card.last4.slice(-2)}` : "💳"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{p.card.name}</div>
                <div className="text-xs text-ink-soft">
                  {p.card.last4 && `••${p.card.last4} · `}
                  {money(p.spend)} on {p.charges} charge{p.charges === 1 ? "" : "s"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-bold tabular-nums">{units(p.earned, p.card.unit)}</div>
                {p.card.unit === "miles" && <div className="text-xs text-ink-faint tabular-nums">≈ {money(p.value)}</div>}
              </div>
            </div>

            {p.card.bonusCategories.length > 0 && p.card.bonusRate > p.card.baseRate && (
              <Meter
                label={`Bonus ${p.card.unit === "cashback" ? `${p.card.bonusRate}%` : `${p.card.bonusRate} mpd`} on ${p.card.bonusCategories.join(", ")}`}
                value={p.bonusSpend}
                max={p.card.bonusCap}
                done={p.bonusRoom === 0 ? "Cap reached: base rate from here" : null}
              />
            )}
            {p.card.minSpend && (
              <Meter
                label={p.unlocked ? "Minimum spend reached" : `Spend ${moneyWhole(p.toUnlock)} more to unlock the bonus (+${money(p.lockedValue)})`}
                value={Math.min(p.spend, p.card.minSpend)}
                max={p.card.minSpend}
                done={null}
                tone={p.unlocked ? "good" : "warn"}
              />
            )}
          </article>
        ))}
      </section>

      {untagged.length > 0 && (
        <p className="rounded-2xl bg-card px-4 py-3 text-sm text-ink-soft ring-1 ring-line">
          <b className="text-ink">{money(untaggedTotal)}</b> on {untagged.length} charge{untagged.length === 1 ? "" : "s"}{" "}
          has no card. Charges from bank alerts are matched by the card's last four digits; for anything else, tap the
          charge in Spending and pick the card.
        </p>
      )}
    </div>
  );
}

function Meter({
  label,
  value,
  max,
  done,
  tone = "pop",
}: {
  label: string;
  value: number;
  max: number | null;
  done: string | null;
  tone?: "pop" | "good" | "warn";
}) {
  const fill = tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-pop-gradient";
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-ink-soft">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums">
          {moneyWhole(value)}
          {max !== null && <span className="font-normal text-ink-faint"> / {moneyWhole(max)}</span>}
        </span>
      </div>
      {max !== null && (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg ring-1 ring-line/50">
          <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.min(1, value / max) * 100}%` }} />
        </div>
      )}
      {done && <div className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">{done}</div>}
    </div>
  );
}

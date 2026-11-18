import { useState } from "react";
import { DEFAULT_MILE_VALUE, isCard, type Card, type CardSettings, type CardUnit } from "../lib/cards";
import { CATEGORIES, CATEGORY_EMOJI } from "../lib/types";

type Draft = {
  id: string;
  name: string;
  last4: string;
  unit: CardUnit;
  baseRate: string;
  bonusRate: string;
  bonusCategories: string[];
  bonusCap: string;
  minSpend: string;
};

const toDraft = (c: Card): Draft => ({
  ...c,
  baseRate: String(c.baseRate),
  bonusRate: String(c.bonusRate),
  bonusCap: c.bonusCap === null ? "" : String(c.bonusCap),
  minSpend: c.minSpend === null ? "" : String(c.minSpend),
});

const optional = (s: string) => (s.trim() === "" ? null : Number(s));

const toCard = (d: Draft): Card => ({
  id: d.id,
  name: d.name.trim(),
  last4: d.last4.trim(),
  unit: d.unit,
  baseRate: Number(d.baseRate || 0),
  bonusRate: Number(d.bonusRate || 0),
  bonusCategories: d.bonusCategories,
  bonusCap: optional(d.bonusCap),
  minSpend: optional(d.minSpend),
});

const field = "w-full rounded-xl bg-bg px-3 py-2 text-sm outline-none ring-1 ring-line focus:ring-accent";

/**
 * Settings → Cards: your credit cards and how each earns, for the card rewards optimiser.
 * Edited as a draft and saved as one list, like Pots.
 */
export function CardsSettings({
  settings,
  onSave,
}: {
  settings: CardSettings;
  onSave: (next: CardSettings) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => settings.cards.map(toDraft));
  const [mileValue, setMileValue] = useState(String(settings.mileValue));
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // Keep the draft in step when cards arrive from the server.
  const [prev, setPrev] = useState(settings);
  if (prev !== settings) {
    setPrev(settings);
    setDrafts(settings.cards.map(toDraft));
    setMileValue(String(settings.mileValue));
  }

  const patch = (id: string, change: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...change } : d)));

  function addCard() {
    const id = crypto.randomUUID();
    setDrafts((ds) => [
      ...ds,
      { id, name: "", last4: "", unit: "miles", baseRate: "1.2", bonusRate: "4", bonusCategories: [], bonusCap: "", minSpend: "" },
    ]);
    setOpenId(id);
    setMessage(null);
  }

  async function save() {
    setMessage(null);
    const cards = drafts.map(toCard);
    const bad: Card | undefined = cards.find((c): boolean => !isCard(c));
    if (bad) {
      setOpenId(bad.id);
      setMessage({
        text: !bad.name
          ? "Every card needs a name."
          : bad.last4 && !/^\d{4}$/.test(bad.last4)
            ? "Last four digits should be exactly 4 numbers, or left empty."
            : "Rates, caps and minimum spends must be numbers of 0 or more (leave caps empty for none).",
        error: true,
      });
      return;
    }
    const mv = Number(mileValue);
    if (!Number.isFinite(mv) || mv <= 0) {
      setMessage({ text: "A mile needs a value over 0¢.", error: true });
      return;
    }
    try {
      await onSave({ cards, mileValue: mv });
      setMessage({ text: "Saved.", error: false });
      setOpenId(null);
    } catch {
      setMessage({ text: "Couldn't save that. Has the latest database migration been pushed?", error: true });
    }
  }

  return (
    <section className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-line">
      <div>
        <h2 className="text-lg font-semibold">💳 Cards</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Add the credit cards you use and how each one earns. Rates are % for cashback or miles per dollar for miles.
          The bonus cap is the spend per period that earns the bonus rate. Copy the numbers from your bank's terms.
        </p>
      </div>

      {drafts.length === 0 && (
        <p className="rounded-xl bg-bg px-3 py-2 text-sm text-ink-soft">No cards yet. Add your first one below.</p>
      )}

      <ul className="space-y-2">
        {drafts.map((d) => {
          const open = openId === d.id;
          const unitLabel = d.unit === "cashback" ? "%" : "mpd";
          return (
            <li key={d.id} className="rounded-2xl ring-1 ring-line">
              <button
                onClick={() => setOpenId(open ? null : d.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="text-xl">💳</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{d.name || "New card"}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {d.bonusRate || 0} {unitLabel}
                    {d.bonusCategories.length ? ` on ${d.bonusCategories.join(", ")}` : ""} · {d.baseRate || 0} {unitLabel}{" "}
                    otherwise{d.last4 ? ` · ••${d.last4}` : ""}
                  </span>
                </span>
                <span className="text-ink-faint">{open ? "▴" : "▾"}</span>
              </button>
              {open && (
                <div className="space-y-3 border-t border-line px-3 py-3">
                  <div className="grid grid-cols-[1fr_6rem] gap-2">
                    <label className="text-xs text-ink-soft">
                      Name
                      <input value={d.name} onChange={(e) => patch(d.id, { name: e.target.value })} placeholder="e.g. Rewards Visa" className={`${field} mt-1`} />
                    </label>
                    <label className="text-xs text-ink-soft">
                      Last 4 digits
                      <input
                        value={d.last4}
                        onChange={(e) => patch(d.id, { last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                        inputMode="numeric"
                        placeholder="1234"
                        className={`${field} mt-1 tabular-nums`}
                      />
                    </label>
                  </div>
                  <div className="flex gap-1.5" role="group" aria-label="Reward type">
                    {(["miles", "cashback"] as const).map((u) => (
                      <button
                        key={u}
                        onClick={() => patch(d.id, { unit: u })}
                        aria-pressed={d.unit === u}
                        className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ring-1 ${d.unit === u ? "bg-ink text-bg ring-ink" : "ring-line"}`}
                      >
                        {u === "miles" ? "✈️ Miles" : "💵 Cashback"}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-ink-soft">
                      Bonus rate ({unitLabel})
                      <input value={d.bonusRate} onChange={(e) => patch(d.id, { bonusRate: e.target.value })} inputMode="decimal" className={`${field} mt-1 tabular-nums`} />
                    </label>
                    <label className="text-xs text-ink-soft">
                      Everything else ({unitLabel})
                      <input value={d.baseRate} onChange={(e) => patch(d.id, { baseRate: e.target.value })} inputMode="decimal" className={`${field} mt-1 tabular-nums`} />
                    </label>
                  </div>
                  <div>
                    <div className="text-xs text-ink-soft">Bonus categories</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {CATEGORIES.map((c) => {
                        const on = d.bonusCategories.includes(c);
                        return (
                          <button
                            key={c}
                            onClick={() =>
                              patch(d.id, {
                                bonusCategories: on ? d.bonusCategories.filter((x) => x !== c) : [...d.bonusCategories, c],
                              })
                            }
                            aria-pressed={on}
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${on ? "bg-lime-200 text-lime-900 ring-lime-300 dark:bg-lime-900/60 dark:text-lime-100 dark:ring-lime-800" : "ring-line"}`}
                          >
                            {CATEGORY_EMOJI[c]} {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-ink-soft">
                      Bonus cap ($ spend)
                      <input value={d.bonusCap} onChange={(e) => patch(d.id, { bonusCap: e.target.value })} inputMode="decimal" placeholder="No cap" className={`${field} mt-1 tabular-nums`} />
                    </label>
                    <label className="text-xs text-ink-soft">
                      Minimum spend ($)
                      <input value={d.minSpend} onChange={(e) => patch(d.id, { minSpend: e.target.value })} inputMode="decimal" placeholder="None" className={`${field} mt-1 tabular-nums`} />
                    </label>
                  </div>
                  <button
                    onClick={() => {
                      setDrafts((ds) => ds.filter((x) => x.id !== d.id));
                      setOpenId(null);
                    }}
                    className="text-sm font-medium text-danger"
                  >
                    Remove card
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button onClick={addCard} className="w-full rounded-xl px-3 py-2.5 text-sm font-bold text-accent border border-dashed border-line">
        + Add a card
      </button>

      <label className="flex items-center gap-3 text-sm">
        <span className="flex-1 text-ink-soft">Value of one mile (cents)</span>
        <input
          value={mileValue}
          onChange={(e) => setMileValue(e.target.value)}
          inputMode="decimal"
          placeholder={String(DEFAULT_MILE_VALUE)}
          className="w-20 rounded-xl bg-bg px-3 py-2 text-right tabular-nums outline-none ring-1 ring-line focus:ring-accent"
        />
      </label>

      <button
        onClick={() => void save()}
        className="w-full rounded-xl bg-accent px-4 py-2.5 font-semibold text-white active:scale-[0.98]"
      >
        Save cards
      </button>
      {message && <p className={`text-sm ${message.error ? "text-danger" : "text-good"}`}>{message.text}</p>}
    </section>
  );
}

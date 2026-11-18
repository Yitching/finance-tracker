/**
 * Spending periods: either calendar months, or credit-card billing cycles.
 *
 * A billing cycle is named after the month its statement is issued in. With a
 * statement date of the 14th, the "Nov" cycle runs 15 Oct → 14 Nov (inclusive).
 * Statement dates past the end of a short month land on its last day (31st → 30 Apr).
 *
 * All boundaries are local midnights, so an expense at 2am SGT on the 1st stays on the 1st.
 *
 * A statement that arrives early can end its period early ("Statement's out"): `ends`
 * maps that period's key to the day the next one starts ("YYYY-MM-DD"). The next period
 * keeps its own name and normal end date, and simply starts on that day.
 */

/** "YYYY-MM": the calendar month, or the month the statement is issued in. */
export type PeriodKey = string;

export type Period = {
  key: PeriodKey;
  /** First moment of the period (local midnight). */
  from: Date;
  /** First moment after the period (exclusive). */
  to: Date;
  /** You ended it early when the statement came out. */
  endedEarly?: boolean;
};

/** Period key → the day the next period starts ("YYYY-MM-DD"), for periods ended early. */
export type PeriodEnds = Record<PeriodKey, string>;

const dayStart = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const daysIn = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

export const keyOf = (year: number, month0: number): PeriodKey => {
  const d = new Date(year, month0, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const parseKey = (key: PeriodKey) => {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month0: m - 1 };
};

/** Midnight after the statement day of that month, i.e. the start of the next cycle. */
function afterStatement(year: number, month0: number, statementDay: number) {
  const d = new Date(year, month0, 1);
  const day = Math.min(statementDay, daysIn(d.getFullYear(), d.getMonth()));
  return new Date(d.getFullYear(), d.getMonth(), day + 1);
}

function basePeriod(key: PeriodKey, statementDay: number | null): Period {
  const { year, month0 } = parseKey(key);
  if (!statementDay) {
    return { key, from: new Date(year, month0, 1), to: new Date(year, month0 + 1, 1) };
  }
  return {
    key,
    from: afterStatement(year, month0 - 1, statementDay),
    to: afterStatement(year, month0, statementDay),
  };
}

/** `statementDay` null = calendar months. `ends` = periods you ended early. */
export function periodFor(key: PeriodKey, statementDay: number | null, ends: PeriodEnds = {}): Period {
  const base = basePeriod(key, statementDay);
  const { year, month0 } = parseKey(key);
  const prevKey = keyOf(year, month0 - 1);
  // An end only counts if it still leaves the period at least a day long.
  const startEarly = ends[prevKey] ? dayStart(ends[prevKey]) : null;
  const from = startEarly && startEarly < base.to ? startEarly : base.from;
  const endEarly = ends[key] ? dayStart(ends[key]) : null;
  const ended = !!endEarly && endEarly > from;
  return { key, from, to: ended ? endEarly : base.to, ...(ended ? { endedEarly: true } : {}) };
}

/** The period that contains `at` (default: now). */
export function periodContaining(statementDay: number | null, ends: PeriodEnds = {}, at = new Date()): Period {
  let p = periodFor(keyOf(at.getFullYear(), at.getMonth()), statementDay, ends);
  // Early ends move boundaries by days, so a step or two always lands in the right one.
  for (let i = 0; i < 3 && at < p.from; i++) p = shiftPeriod(p.key, -1, statementDay, ends);
  for (let i = 0; i < 3 && at >= p.to; i++) p = shiftPeriod(p.key, 1, statementDay, ends);
  return p;
}

export function shiftPeriod(key: PeriodKey, by: number, statementDay: number | null, ends: PeriodEnds = {}): Period {
  const { year, month0 } = parseKey(key);
  return periodFor(keyOf(year, month0 + by), statementDay, ends);
}

const short = (d: Date) => d.toLocaleDateString("en-SG", { day: "numeric", month: "short" });

/** "October 2026", or "Nov bill" for a billing cycle. */
export function periodTitle(p: Period, statementDay: number | null) {
  const { year, month0 } = parseKey(p.key);
  const d = new Date(year, month0, 1);
  if (!statementDay) return d.toLocaleDateString("en-SG", { month: "long", year: "numeric" });
  const thisYear = year === new Date().getFullYear();
  return `${d.toLocaleDateString("en-SG", { month: "short", ...(thisYear ? {} : { year: "numeric" }) })} bill`;
}

/** "15 Oct – 14 Nov" (both ends inclusive). */
export function periodRange(p: Period) {
  const last = new Date(p.to.getFullYear(), p.to.getMonth(), p.to.getDate() - 1);
  return `${short(p.from)} – ${short(last)}`;
}

/** Whole days left including today, or null if the period isn't the current one. */
export function daysLeft(p: Period, now = new Date()) {
  if (now < p.from || now >= p.to) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((p.to.getTime() - today.getTime()) / 86_400_000);
}

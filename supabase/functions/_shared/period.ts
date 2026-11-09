// Spending periods on the server: the same rules as web/src/lib/period.ts, in Singapore time.
// A billing cycle is named after the month its statement is issued in; null = calendar months.

export const DAY = 86_400_000;
// Singapore has no daylight saving, so a fixed offset gives local wall-clock time.
export const SGT = 8 * 3_600_000;

export type Period = { key: string; from: number; to: number };

/** Singapore wall-clock parts of a timestamp. */
export const sgt = (t: number) => {
  const d = new Date(t + SGT);
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), weekday: d.getUTCDay() };
};
/** Singapore midnight of that day; overflowing months and days roll over like Date.UTC. */
export const midnight = (year: number, month0: number, day: number) => Date.UTC(year, month0, day) - SGT;
/** "YYYY-MM-DD" in Singapore time. */
export const sgtDate = (t: number) => new Date(t + SGT).toISOString().slice(0, 10);

const daysIn = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
const keyOf = (year: number, month0: number) => {
  const d = new Date(Date.UTC(year, month0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function afterStatement(year: number, month0: number, statementDay: number) {
  const d = new Date(Date.UTC(year, month0, 1));
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  return midnight(y, m, Math.min(statementDay, daysIn(y, m)) + 1);
}

export function periodFor(year: number, month0: number, statementDay: number | null): Period {
  const key = keyOf(year, month0);
  if (!statementDay) return { key, from: midnight(year, month0, 1), to: midnight(year, month0 + 1, 1) };
  return { key, from: afterStatement(year, month0 - 1, statementDay), to: afterStatement(year, month0, statementDay) };
}

/** The period containing `now`, and the one before it. */
export function currentAndPrevious(statementDay: number | null, now: number) {
  const { year, month0 } = sgt(now);
  let offset = 0;
  const here = periodFor(year, month0, statementDay);
  if (now < here.from) offset = -1;
  else if (now >= here.to) offset = 1;
  return { current: periodFor(year, month0 + offset, statementDay), previous: periodFor(year, month0 + offset - 1, statementDay) };
}

// "GRAB*A-6XYZ" and "Grab" should count as the same place.
export const placeOf = (r: { item: string; merchant: string | null }) =>
  (r.merchant?.split("*")[0] || r.item).toLowerCase().replace(/[^a-z]+/g, " ").trim();

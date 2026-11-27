import type { Cadence } from "../lib/recurringExpenses";

/** A clean loop-of-arrows "repeat" icon that takes the text colour. */
export function RepeatIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden
    >
      <path d="M17 2.5 20.5 6 17 9.5" />
      <path d="M3.5 11.5V10a4 4 0 0 1 4-4h13" />
      <path d="M7 21.5 3.5 18 7 14.5" />
      <path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13" />
    </svg>
  );
}

const LABEL: Record<Cadence, string> = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

/** Small accent pill under an expense name: "↻ Monthly". */
export function RecurringTag({ cadence }: { cadence?: Cadence }) {
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent">
      <RepeatIcon className="size-3" />
      {cadence ? LABEL[cadence] : "Recurring"}
    </span>
  );
}

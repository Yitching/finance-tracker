import { dayLabel, money } from "../lib/money";
import type { Answer } from "../lib/question";
import { CATEGORY_EMOJI } from "../lib/types";

const short = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00`).toLocaleDateString("en-SG", opts);

function groupLabel(name: string, view: string) {
  if (view === "by_day") return short(name, { weekday: "short", day: "numeric", month: "short" });
  if (view === "by_month") return short(`${name}-01`, { month: "short", year: "numeric" });
  if (view === "by_category") return `${CATEGORY_EMOJI[name] ?? "📦"} ${name}`;
  return name;
}

/** The answer to a question typed into the text box, e.g. "how much on grab this month?". */
export function AnswerCard({
  question,
  answer,
  onClose,
  onLogInstead,
}: {
  question: string;
  answer: Answer;
  onClose: () => void;
  onLogInstead: () => void;
}) {
  const logInstead = (
    <button onClick={onLogInstead} className="shrink-0 font-medium text-accent">
      Log it instead
    </button>
  );

  return (
    <section className="max-h-[50dvh] overflow-y-auto rounded-3xl bg-card p-4 shadow-lg ring-1 ring-line">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-ink-faint">“{question}”</p>
        <button onClick={onClose} aria-label="Close answer" className="-mt-1 -mr-1 grid size-7 place-items-center rounded-full text-ink-soft active:bg-bg">
          ✕
        </button>
      </div>

      {!answer.answerable ? (
        <>
          <p className="mt-1 text-sm">{answer.reply}</p>
          <div className="mt-3 text-right text-xs">{logInstead}</div>
        </>
      ) : (
        <>
          <div className="mt-1 text-sm font-medium text-ink-soft">{answer.title}</div>
          <div className="text-3xl font-bold tabular-nums">{money(answer.total)}</div>
          <div className="text-sm text-ink-soft">
            {answer.count === 0
              ? "Nothing matching in that range"
              : `${answer.count} ${answer.count === 1 ? "expense" : "expenses"} · ${money(answer.perDay)}/day`}
          </div>

          {answer.compare && (
            <CompareLine total={answer.total} compare={answer.compare} />
          )}

          {answer.groups.length > 0 && (
            <ul className="mt-3 space-y-2">
              {answer.groups.map((g) => (
                <li key={g.name}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="truncate">{groupLabel(g.name, answer.view)}</span>
                    <span className="shrink-0 tabular-nums text-ink-soft">{money(g.total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-bg">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(g.total / Math.max(...answer.groups.map((x) => x.total), 1)) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {answer.rows.length > 0 && (
            <ul className="mt-3 divide-y divide-line text-sm">
              {answer.rows.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-1.5">
                  <span>{CATEGORY_EMOJI[r.category] ?? "📦"}</span>
                  <span className="min-w-0 flex-1 truncate">{r.item}</span>
                  <span className="text-xs text-ink-faint">{dayLabel(r.spent_at)}</span>
                  <span className="w-16 text-right tabular-nums">{money(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* What was searched, so a misread question is easy to spot. */}
          <div className="mt-3 flex items-center gap-3 text-xs text-ink-faint">
            <span className="min-w-0 flex-1 truncate">
              {[...answer.search, ...answer.categories].join(", ") || "Everything"} ·{" "}
              {short(answer.from, { day: "numeric", month: "short" })} – {short(answer.to, { day: "numeric", month: "short", year: "numeric" })}
            </span>
            {logInstead}
          </div>
        </>
      )}
    </section>
  );
}

function CompareLine({ total, compare }: { total: number; compare: { label: string; total: number } }) {
  const diff = Math.round((total - compare.total) * 100) / 100;
  return (
    <div className="mt-2 rounded-2xl bg-bg px-3 py-2 text-sm">
      <span className="text-ink-soft">
        {money(compare.total)} {compare.label}
      </span>{" "}
      {diff !== 0 && (
        <span className={diff > 0 ? "text-danger" : "text-accent"}>
          {diff > 0 ? "▲" : "▼"} {money(Math.abs(diff))}
        </span>
      )}
    </div>
  );
}

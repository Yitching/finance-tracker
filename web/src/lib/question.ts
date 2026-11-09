/**
 * Is this a question about your spending rather than something to log?
 * Deliberately narrow: "spent 12 at grab" or "total 45 dinner" still get logged,
 * and the answer card has "Log it instead" for anything misread.
 */
export function looksLikeQuestion(text: string) {
  const t = text.trim().toLowerCase();
  return (
    t.endsWith("?") ||
    /^(how much|how many|how often|what|what's|whats|when|where|which|did i|do i|have i|am i|show|list|biggest|largest|compare|average|my top|top \d)\b/.test(t)
  );
}

/** What ask-ledger answers with. */
export type Answer =
  | { answerable: false; reply: string }
  | {
      answerable: true;
      title: string;
      /** Both "YYYY-MM-DD", inclusive. */
      from: string;
      to: string;
      search: string[];
      categories: string[];
      view: "total" | "biggest" | "recent" | "by_category" | "by_place" | "by_day" | "by_month";
      total: number;
      count: number;
      perDay: number;
      groups: { name: string; total: number; count: number }[];
      rows: { id: string; item: string; amount: number; category: string; spent_at: string }[];
      compare: { label: string; total: number; count: number } | null;
    };

/**
 * Playful Pop category colours: a soft pastel chip behind each category's emoji,
 * and a matching bar colour for the Spending breakdown and Insights charts.
 * Every class is a literal string so Tailwind picks it up.
 */
export const CATEGORY_CHIP: Record<string, string> = {
  Food: "bg-amber-100 dark:bg-amber-900/50",
  Transport: "bg-sky-100 dark:bg-sky-900/50",
  Groceries: "bg-lime-100 dark:bg-lime-900/50",
  Shopping: "bg-pink-100 dark:bg-pink-900/50",
  Bills: "bg-violet-100 dark:bg-violet-900/50",
  Entertainment: "bg-orange-100 dark:bg-orange-900/50",
  Health: "bg-emerald-100 dark:bg-emerald-900/50",
  Others: "bg-stone-200 dark:bg-stone-700/60",
};

export const CATEGORY_BAR: Record<string, string> = {
  Food: "bg-amber-400",
  Transport: "bg-sky-400",
  Groceries: "bg-lime-400",
  Shopping: "bg-pink-400",
  Bills: "bg-violet-400",
  Entertainment: "bg-orange-400",
  Health: "bg-emerald-400",
  Others: "bg-stone-400",
};

export function categoryChip(category: string): string {
  return CATEGORY_CHIP[category] ?? CATEGORY_CHIP.Others;
}

export function categoryBar(category: string): string {
  return CATEGORY_BAR[category] ?? CATEGORY_BAR.Others;
}

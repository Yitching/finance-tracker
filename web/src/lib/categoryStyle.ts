/**
 * Playful Pop category colours: a soft pastel chip behind each category's emoji,
 * and a matching bar colour for the Spending breakdown and Insights charts.
 * Every class is a literal string so Tailwind picks it up. Dark mode keeps the pastels
 * solid (a faded tint over a dark card turns muddy); `on-pastel` keeps text on them dark.
 */
export const CATEGORY_CHIP: Record<string, string> = {
  Food: "bg-amber-100 dark:bg-amber-300 on-pastel",
  Transport: "bg-sky-100 dark:bg-sky-300 on-pastel",
  Groceries: "bg-lime-100 dark:bg-lime-300 on-pastel",
  Shopping: "bg-pink-100 dark:bg-pink-300 on-pastel",
  Bills: "bg-violet-100 dark:bg-violet-300 on-pastel",
  Entertainment: "bg-orange-100 dark:bg-orange-300 on-pastel",
  Health: "bg-emerald-100 dark:bg-emerald-300 on-pastel",
  Others: "bg-stone-200 dark:bg-stone-300 on-pastel",
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

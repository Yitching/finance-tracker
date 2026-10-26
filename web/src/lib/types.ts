export const CATEGORIES = [
  "Food",
  "Transport",
  "Groceries",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Others",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_EMOJI: Record<string, string> = {
  Food: "🍜",
  Transport: "🚕",
  Groceries: "🛒",
  Shopping: "🛍️",
  Bills: "🧾",
  Entertainment: "🎬",
  Health: "💊",
  Others: "📦",
};

export type Expense = {
  id: string;
  item: string;
  amount: number;
  category: string;
  spent_at: string;
  source: string;
  status: "confirmed" | "pending";
  raw_input: string | null;
  created_at: string;
};

export type Remembered = {
  item_key: string;
  display_name: string;
  last_amount: number;
  category: string;
  use_count: number;
  hour_counts: number[];
  last_used_at: string;
};

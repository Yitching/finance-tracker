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
  /** Raw merchant text from a bank alert, e.g. "GRAB*A-6XYZ". Only on captured charges. */
  merchant: string | null;
  created_at: string;
};

/**
 * A captured charge waiting in the Inbox. Some alerts (often PayNow) don't say
 * how much, so amount stays null until you fill it in.
 */
export type PendingExpense = Omit<Expense, "amount"> & { amount: number | null };

/** What you can change on an expense by editing it. */
export type ExpensePatch = Partial<Pick<Expense, "item" | "amount" | "category" | "spent_at">>;

export type MerchantRule = {
  merchant_key: string;
  example: string | null;
  display_name: string;
  category: string;
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

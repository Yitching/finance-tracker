-- Card rewards optimiser.
-- user_settings.card_rewards: { "cards": [Card…], "mileValue": cents per mile }.
-- Each card: { id, name, last4, unit ("cashback" | "miles"), baseRate, bonusRate,
--              bonusCategories: [category…], bonusCap (monthly spend that earns the bonus, or null),
--              minSpend (monthly spend needed to unlock the bonus, or null) }.
alter table public.user_settings
  add column card_rewards jsonb not null default '{}'::jsonb;

-- Which of your cards paid for an expense: the card's id from card_rewards, or null.
-- Captured charges are matched by the card's last four digits in the app; this column
-- holds the card you pick by hand (and wins over the match).
alter table public.expenses
  add column card text check (card is null or char_length(card) <= 64);

const fmt = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" });

export const money = (n: number) => fmt.format(n);

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Monday-start week, the way most of Singapore thinks about it. */
export const startOfWeek = (d = new Date()) => {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - dow);
  return x;
};

export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

export const dayLabel = (iso: string) => {
  const d = startOfDay(new Date(iso));
  const today = startOfDay();
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
};

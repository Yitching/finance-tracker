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

/** "2026-10-22", the value an <input type="date"> uses, in local time. */
export const dateValue = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A picked "YYYY-MM-DD" as a local Date, at `time`'s time of day (default midday). */
export const onDay = (value: string, time?: Date) => {
  const [y, m, d] = value.split("-").map(Number);
  return time
    ? new Date(y, m - 1, d, time.getHours(), time.getMinutes(), time.getSeconds())
    : new Date(y, m - 1, d, 12);
};

export const timeLabel =(iso: string) =>
  new Date(iso).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });

export const dayLabel =(iso: string) => {
  const d = startOfDay(new Date(iso));
  const today = startOfDay();
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
};

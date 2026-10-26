import type { ReactNode } from "react";
import { dateValue } from "../lib/money";

/** How far back you can log: the app loads the last 62 days. */
const OLDEST_DAYS = 60;

/**
 * Wraps `children` in a tap target that opens the phone's date picker.
 * Values are "YYYY-MM-DD"; future days can't be picked.
 */
export function DayPicker({
  value,
  onChange,
  className = "",
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`relative cursor-pointer ${className}`}>
      {children}
      <input
        type="date"
        value={value}
        min={dateValue(new Date(Date.now() - OLDEST_DAYS * 86_400_000))}
        max={dateValue()}
        required
        aria-label="Date"
        onClick={(e) => {
          try {
            e.currentTarget.showPicker(); // desktop browsers only open it from the icon otherwise
          } catch {
            // Already open, or not supported: the native tap behaviour still works.
          }
        }}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

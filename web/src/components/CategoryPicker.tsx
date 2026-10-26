import { CATEGORIES, CATEGORY_EMOJI } from "../lib/types";

/** Horizontally scrolling category pills. `bleed` matches the parent's horizontal padding. */
export function CategoryPicker({
  value,
  onChange,
  bleed = "-mx-4 px-4",
}: {
  value: string;
  onChange: (c: string) => void;
  bleed?: string;
}) {
  return (
    <div className={`no-scrollbar flex gap-1.5 overflow-x-auto ${bleed}`}>
      {CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`shrink-0 rounded-full px-3 py-1 text-sm ${
            c === value ? "bg-accent text-white" : "bg-card ring-1 ring-line"
          }`}
        >
          {CATEGORY_EMOJI[c]} {c}
        </button>
      ))}
    </div>
  );
}

import type { ReactNode } from "react";

/** Header for screens opened from Home: back arrow, title, optional action on the right. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
      <button
        onClick={onBack}
        aria-label="Back"
        className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-3xl leading-none active:bg-card"
      >
        ‹
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export type Theme = "system" | "light" | "dark";

// Also read by the inline script in index.html, so the right colours show before React loads.
const KEY = "lazy-ledger.theme";

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const BAR = { light: "#fff3e6", dark: "#000000" };
const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

/** Phone status bar colour: peach in light mode, black in dark, each matching the background. */
export function syncStatusBar() {
  const set = document.documentElement.dataset.theme;
  const dark = set === "dark" || (set !== "light" && prefersDark());
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? BAR.dark : BAR.light);
}

// "System" follows the phone, so keep the bar in step when the phone switches.
if (typeof window !== "undefined") {
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", syncStatusBar);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  syncStatusBar();
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Private mode etc.: the choice still applies until the app closes.
  }
}

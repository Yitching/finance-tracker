export const CAPTURE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture`;

/** What MacroDroid should send: app name, title and text, one per line (MacroDroid magic text). */
export const MACRODROID_BODY = "[not_app_name]\n[not_title]\n[notification]";

// The server only keeps a hash, so the plain token lives on the device that made it.
const TOKEN_KEY = "lazy-ledger.capture-token";

export function savedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode etc.: the token is still shown for this visit.
  }
}

/** A realistic UOB card alert. The time makes each test unique, so it isn't dropped as a repeat. */
export function sampleNotification() {
  const now = new Date().toLocaleString("en-SG", { dateStyle: "short", timeStyle: "medium" });
  return `UOB TMRW\nCard Transaction Alert\nA transaction of SGD 5.50 was made with your UOB Card ending 1234 on ${now} at GRAB*A-6XYZ. If unauthorised, call 24/7 Fraud Hotline now.`;
}

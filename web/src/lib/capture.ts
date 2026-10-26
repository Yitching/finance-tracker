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

export type Simulation = {
  id: string;
  label: string;
  /** What the capture endpoint should do with it. */
  expect: "pending" | "pending-no-amount" | "ignored";
  text: (now: string) => string;
};

/** Realistic notifications for Settings' test buttons. */
export const SIMULATIONS: Simulation[] = [
  {
    id: "card",
    label: "💳 Card charge · $5.50 at GRAB*A-6XYZ",
    expect: "pending",
    text: (now) =>
      `UOB TMRW\nCard Transaction Alert\nA transaction of SGD 5.50 was made with your UOB Card ending 1234 on ${now} at GRAB*A-6XYZ. If unauthorised, call 24/7 Fraud Hotline now.`,
  },
  {
    id: "paynow-out",
    label: "📤 UOB PayNow sent · no amount, masked name",
    expect: "pending-no-amount",
    text: (now) =>
      `UOB Personal Internet Banking\nNotifications Alerts\nUOB - Your PayNow transfer to SEEXXX on ${now} is successful.`,
  },
  {
    id: "paynow-in",
    label: "📥 PayNow received · should be ignored",
    expect: "ignored",
    text: (now) =>
      `UOB TMRW\nPayNow received\nYou have received SGD 20.00 from JOHN TAN via PayNow on ${now}.`,
  },
];

/** The time makes each test unique, so it isn't dropped as a repeat. */
export function simulationText(sim: Simulation) {
  return sim.text(new Date().toLocaleString("en-SG", { dateStyle: "short", timeStyle: "medium" }));
}

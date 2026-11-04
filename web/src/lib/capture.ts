export const CAPTURE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture`;

/** What MacroDroid should send: app name, title and text, one per line (MacroDroid magic text). */
export const MACRODROID_BODY = "{not_app_name}\n{not_title}\n{notification}";

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
  /** Sent the way the Gmail forwarder sends emails, instead of as a phone notification. */
  email?: { from: string; subject: string };
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
    id: "grab-email",
    label: "✉️ Grab e-receipt email · $14.30",
    expect: "pending",
    email: { from: "Grab <no-reply@grab.com>", subject: "Your Grab E-Receipt" },
    text: (now) =>
      `Hope you enjoyed your ride!\nBooking ID: A-7KX92LQ\nPicked up on ${now}\nGrabCar Standard\nFrom: Choa Chu Kang MRT\nTo: Jurong East\nFare S$16.80\nPromo -S$2.50\nTotal Paid S$14.30\nPaid by Mastercard ending 1234`,
  },
  {
    id: "shopee-shipped",
    label: "✉️ Shopee “parcel shipped” email · should be ignored",
    expect: "ignored",
    email: { from: "Shopee <info@mail.shopee.sg>", subject: "Your parcel is on the way" },
    text: () =>
      "Your order 2611049XK3 has been shipped by the seller and is on its way. Track your parcel in the Shopee app.",
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

/** The request body and content type for a simulation, matching the real sender. */
export function simulationRequest(sim: Simulation): { body: string; contentType: string } {
  if (!sim.email) return { body: simulationText(sim), contentType: "text/plain" };
  return {
    contentType: "application/json",
    body: JSON.stringify({
      source: "email",
      app: `Email · ${sim.email.from}`,
      title: sim.email.subject,
      text: simulationText(sim),
      sent_at: new Date().toISOString(),
      external_id: `test-${sim.id}-${Date.now()}`,
    }),
  };
}

import { CAPTURE_URL } from "./capture";

/** Gmail search for the emails worth sending. Users can edit it in the script. */
export const DEFAULT_GMAIL_SEARCH =
  "from:(grab.com OR shopee.sg OR shopee.com OR uobgroup.com OR uob.com.sg)";

/**
 * A Google Apps Script that runs in the user's own Gmail every 10 minutes and posts
 * new matching emails to the capture endpoint, which puts spending in the Inbox.
 * The server de-duplicates by Gmail message id, so overlapping runs are harmless.
 */
export function gmailScript(token: string) {
  return `// Lazy Ledger: Gmail forwarder
// Every 10 minutes, sends new Grab / Shopee / UOB emails to your Lazy Ledger Inbox.
// Promos, delivery updates and OTPs are ignored by the app; nothing is logged until you keep it.
//
// Setup: paste this whole file, save, pick "setup" in the toolbar and press Run.

const CAPTURE_URL = ${JSON.stringify(CAPTURE_URL)};
const TOKEN = ${JSON.stringify(token)};

// Which emails to send. Add senders here, e.g. foodpanda.sg OR lazada.sg
const SEARCH = ${JSON.stringify(DEFAULT_GMAIL_SEARCH)};

// How far back the very first run looks.
const FIRST_RUN_DAYS = 2;

function setup() {
  for (const t of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger("forwardEmails").timeBased().everyMinutes(10).create();
  forwardEmails();
  console.log("All set. New emails are checked every 10 minutes.");
}

function forwardEmails() {
  const props = PropertiesService.getScriptProperties();
  const now = Math.floor(Date.now() / 1000);
  const since = Number(props.getProperty("since")) || now - FIRST_RUN_DAYS * 86400;
  // Look back 10 extra minutes in case Gmail indexed something late; the app drops repeats.
  const from = since - 600;

  let ok = true;
  let sent = 0;
  for (const thread of GmailApp.search(SEARCH + " after:" + from, 0, 100)) {
    for (const m of thread.getMessages()) {
      if (m.getDate().getTime() / 1000 < from) continue;
      const res = UrlFetchApp.fetch(CAPTURE_URL, {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + TOKEN },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          source: "email",
          app: "Email · " + m.getFrom(),
          title: m.getSubject(),
          text: m.getPlainBody().slice(0, 8000),
          sent_at: m.getDate().toISOString(),
          external_id: m.getId(),
        }),
      });
      const code = res.getResponseCode();
      if (code === 401) throw new Error("Lazy Ledger refused the token. Copy a fresh script from Settings.");
      if (code >= 500) ok = false; // try this email again next run
      sent++;
    }
  }
  // Only move forward when everything got through, so nothing is skipped.
  if (ok) props.setProperty("since", String(now));
  console.log("Sent " + sent + " email(s)" + (ok ? "" : ", some failed and will be retried"));
}
`;
}

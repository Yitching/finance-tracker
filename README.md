# Lazy Ledger 🪙

Expense tracking for people who hate expense tracking.
Type `kopi, chicken rice 5.5, grab 12` → AI splits it, prices what it remembers, files it.

**Phase 1 includes**
- One text box (keyboard opens on launch) + 🎙️ voice input
- Claude Haiku parsing for Singlish/shorthand, "yesterday", multiple items per message
- Price memory: say "kopi" once with a price, after that just "kopi"
- Time-aware quick chips: one tap logs what you usually buy at this hour
- "How much was X?" prompt when an item has no price yet
- Today / week / month totals with category breakdown and "vs last period"
- Tap any row to edit or delete; every add/delete has Undo
- Installable PWA (Android home screen, long-press shortcut), light + dark mode
- Row-level security: every row is locked to your account

**Phase 2 adds**
- 📥 Inbox banner on the home screen, e.g. "3 to confirm · $57.50", whenever captured charges are waiting
- Swipe cards: right to keep, left to toss, or use the buttons. "Keep all" skips likely duplicates so you don't double-count
- Duplicate check: if you typed "chicken rice 5.5" and UOB's alert for $5.50 arrives within 30 minutes, the alert is flagged
- Merchant memory: edit "GRAB*A-6XYZ" to "Grab" / Transport once, and future Grab charges arrive already sorted
- ⚙️ Settings: create a phone token, follow the built-in MacroDroid guide, and send a test with one tap. Sign out moved here too
- Inbox zero gets a small 🎉 burst

**Phase 2.5**
- 🧾 Receipt photo: tap 📷, and a vision model lists the items into your Inbox to check
- Price memory while you type: "kopi" shows $1.80 ready to go, still editable; Enter logs it without an AI call
- Quick-tap chips moved to the top ("Usual around now"), away from the text box, so they're hard to hit by accident
- Opens straight into the text box; the full dashboard is one tap away ("Today · This week ›")
- Light / Dark / System switch in ⚙️ Settings
- PayNow alerts with no amount ("You've sent money to JOHN TAN") still reach the Inbox, which asks "How much?" before you keep them
- Settings simulations: a card charge, a PayNow sent with no amount, and a PayNow received (should be ignored)

```
lazy-ledger/
├── supabase/
│   ├── config.toml
│   ├── migrations/20261026000000_init.sql   # tables, RLS, remember_item()
│   ├── migrations/20261026010000_inbox.sql  # phone tokens, merchant memory
│   └── functions/
│       ├── _shared/                         # AI provider + HTTP helpers
│       ├── parse-expense/index.ts           # free text → expenses
│       ├── parse-receipt/index.ts           # receipt photo → Inbox
│       ├── parse-statement/index.ts         # PDF statement → Inbox
│       └── capture/index.ts                 # phone notification → Inbox
└── web/                                     # Vite + React + TS + Tailwind PWA
```

---

## Setup (about 20 minutes)

You need: Node 20+, a Supabase account, and a Groq API key (console.groq.com).

### 1. Create the Supabase project
1. supabase.com → **New project**. Pick region **Southeast Asia (Singapore)**.
2. Save the database password somewhere; the CLI asks for it once.
3. Note your **project ref**: it's the `xxxx` in `https://xxxx.supabase.co`.

### 2. Push the database and deploy the AI function
From the `lazy-ledger/` folder (the CLI runs through `npx`, nothing to install globally):

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF

# creates the tables, security policies and remember_item()
npx supabase db push

# AI keys live only on the server, never in the app
npx supabase secrets set GROQ_API_KEY=gsk_...
# optional model override for statement/text parsing:
# npx supabase secrets set GROQ_MODEL=openai/gpt-oss-120b

npx supabase functions deploy parse-expense
npx supabase functions deploy parse-receipt
npx supabase functions deploy parse-statement
# the phone posts here with its own token, not a Supabase login
npx supabase functions deploy capture --no-verify-jwt
```

### 3. Configure sign-in
Dashboard → **Authentication → URL Configuration**
- **Site URL**: `http://localhost:5173` for now (change to your deployed URL in step 5)
- **Redirect URLs**: add `http://localhost:5173` and, later, your deployed URL

Email magic links are on by default. You sign in once per device and stay signed in.

### 4. Run it locally
```bash
cd web
cp .env.example .env.local
# fill in from Dashboard → Project Settings → API:
#   VITE_SUPABASE_URL       = https://YOUR_PROJECT_REF.supabase.co
#   VITE_SUPABASE_ANON_KEY  = the anon / publishable key (NOT the service_role / secret key)
npm install
npm run dev
```
Open http://localhost:5173, sign in with your email, and type your first expense.

### 5. Put it on your phone
A PWA needs HTTPS to install, so deploy it. Vercel, Netlify and Cloudflare Pages are all free for this.

**Vercel example:** import the repo → set **Root Directory** to `web` → framework **Vite** →
add the two `VITE_SUPABASE_*` env vars → Deploy.

Then:
1. Add the deployed URL (e.g. `https://lazy-ledger.vercel.app`) to Supabase **Site URL** and **Redirect URLs**.
2. On your Android phone, open the URL in **Chrome** → ⋮ menu → **Install app** (or **Add to home screen**).
3. Sign in from the installed app. Open the magic-link email on the phone.
4. Drag the icon to your home screen dock. Long-press it for **Quick add**.

### 6. Auto-capture from bank notifications (Android)
Already on Phase 1? Pull, then run `npx supabase db push` and redeploy **both** functions
(the commands in step 2): parse-expense now shares code with capture.

In the app: ⚙️ → **Create phone token**, then follow the MacroDroid steps shown there.
Your phone POSTs each notification to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/capture` with
`Authorization: Bearer ll_…` and a plain-text body. If a tool can't set headers, `?token=ll_…` on the URL works too.
Only a hash of the token is stored; the plain token is shown on the device that created it.

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Couldn't reach the AI" | `npx supabase functions logs parse-expense`. Usually the `ANTHROPIC_API_KEY` secret is missing, or the model name is wrong. |
| Magic link opens the wrong site | The URL isn't in **Redirect URLs**, or Site URL still points to localhost. |
| Magic link email never arrives | Supabase's built-in mailer is rate-limited (a few per hour). Wait, or add custom SMTP under Auth settings. |
| Blank screen locally | `.env.local` is missing or the values have quotes/spaces. |
| Test notification: "Couldn't reach the capture endpoint" | Deploy it: `npx supabase functions deploy capture --no-verify-jwt`. |
| Test works, real payments never arrive | MacroDroid needs notification access and **Unrestricted** battery use. Check its log for HTTP errors. |
| "Sensitive notification hidden" | Android or the banking app redacted the alert before MacroDroid received it. Allow sensitive notification content/previews in Android and the bank app, then verify MacroDroid notification access. If the bank always redacts alerts, use Quick Add or enter the transaction manually; the server cannot unmask it. |
| Receipt: "Couldn't read that receipt" | On Groq, set a vision model: `npx supabase secrets set GROQ_VISION_MODEL=...` (default `meta-llama/llama-4-scout-17b-16e-instruct`). Check `npx supabase functions logs parse-receipt`. |
| Statement: "no selectable text" | The PDF is a scanned/image-only statement. Export a text-based PDF from your bank; scanned PDFs are rejected rather than guessed. |
| Statement import | Set `GROQ_API_KEY`, run `npx supabase db push`, deploy `parse-statement`, and keep the PDF under 10 MB. Rows are pending for Inbox review and repeat rows are skipped by a user-scoped fingerprint. |
| Captured charge ignored | `npx supabase functions logs capture`. The AI drops OTPs, promos, incoming money and top-ups on purpose. |

## What's next
- **Phase 3:** UOB alert-email parser, Web Share Target for receipts
- **Phase 4:** recurring expenses, more chip smarts
- **Phase 5:** weekly AI recap, "safe to spend today", monthly Wrapped
- **Phase 5:** analytics charts and an AI Insights tab are available; forecasts remain estimates based on confirmed history.

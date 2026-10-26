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

```
lazy-ledger/
├── supabase/
│   ├── config.toml
│   ├── migrations/20261026000000_init.sql   # tables, RLS, remember_item()
│   └── functions/parse-expense/index.ts     # Haiku parsing edge function
└── web/                                     # Vite + React + TS + Tailwind PWA
```

---

## Setup (about 20 minutes)

You need: Node 20+, a Supabase account, an Anthropic API key (console.anthropic.com).

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

# your Anthropic key lives only on the server, never in the app
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional, to try a different model:
# npx supabase secrets set ANTHROPIC_MODEL=claude-haiku-5-5

npx supabase functions deploy parse-expense
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

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Couldn't reach the AI" | `npx supabase functions logs parse-expense`. Usually the `ANTHROPIC_API_KEY` secret is missing, or the model name is wrong. |
| Magic link opens the wrong site | The URL isn't in **Redirect URLs**, or Site URL still points to localhost. |
| Magic link email never arrives | Supabase's built-in mailer is rate-limited (a few per hour). Wait, or add custom SMTP under Auth settings. |
| Blank screen locally | `.env.local` is missing or the values have quotes/spaces. |

## What's next
- **Phase 2:** pending Inbox (swipe to confirm), `/api/capture` endpoint, duplicate detection
- **Phase 3:** UOB alert-email parser, MacroDroid notification relay, Web Share Target for receipts
- **Phase 4:** recurring expenses, more chip smarts
- **Phase 5:** weekly AI recap, "safe to spend today", monthly Wrapped

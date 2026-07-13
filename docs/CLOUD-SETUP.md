# ⚓ Anchor — Cloud setup (accounts + online sync)

This turns Anchor into a hosted web app: users sign in with a **username and
password**, and everything (subjects, cards, chains, study history, settings)
is **saved online automatically** — sign in on any device and it's all there.

Two free services do all the work:

| Piece | Service | Cost |
|---|---|---|
| The website itself (static files) | **GitHub Pages** | Free |
| Accounts + database | **Supabase** | Free tier (plenty for this) |

The whole setup is ~15 minutes. No server to run, no build step.

---

## Step 1 — Create the Supabase project (the online database)

1. Go to **[supabase.com](https://supabase.com)** → sign up (free) → **New project**.
2. Name it `anchor`, set a strong **database password** (this is *your* admin
   password — not related to app users), pick the region closest to you
   (e.g. Sydney for Australia), and create it. Wait ~1 minute for it to spin up.

## Step 2 — Create the table (paste one SQL file)

1. In the Supabase dashboard, open **SQL Editor** → **New query**.
2. Open [`supabase-setup.sql`](../supabase-setup.sql) from this repo, paste the
   whole thing in, and hit **Run**.

That creates one table (`anchor_data` — each user's whole state as one JSON
document) and locks it down with **row-level security**: every account can only
ever read/write its own row, even though the site's API key is public.

## Step 3 — Allow username-only accounts

Anchor signs users up with a username, no email. Supabase's email-confirmation
step must be off for that to work:

1. Dashboard → **Authentication** → **Sign In / Providers** (older dashboards:
   **Providers**) → **Email**.
2. Turn **OFF** “Confirm email”. Save.

## Step 4 — Connect the app to your project

1. Dashboard → **Project Settings** → **API** (or **Data API**). Copy:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon / publishable key** — the long public key (`eyJ…` or `sb_publishable_…`)
2. Paste both into [`js/config.js`](../js/config.js), replacing the
   `PASTE_YOUR_…` placeholders.

> ✅ These two values are **safe to commit to a public repo**. The anon key is
> designed to be public — row-level security (Step 2) is what protects data.
> Do **not** ever put the `service_role` key in the app.

## Step 5 — Deploy to GitHub Pages

1. Commit and push everything (including your filled-in `js/config.js`).
2. On GitHub: repo → **Settings** → **Pages** → Source: **Deploy from a branch**
   → branch `main`, folder `/ (root)` → Save.
3. After a minute your app is live at `https://<your-username>.github.io/anchor/`.

(Already had Pages on? Just push — it redeploys automatically.)

Optional polish: in Supabase → **Authentication** → **URL Configuration**, set
the **Site URL** to your Pages URL.

## Step 6 — Try it

1. Open the live URL → you'll see the sign-in screen.
2. **Create account** → pick a username + password → you're in.
3. Add a card, then open the site on your phone and sign in — it's there.
4. The **⚓ Synced** chip in the top bar shows sync status at all times.

---

## How it behaves (worth knowing)

- **Every change auto-saves online** (about a second after you do anything).
  The chip shows `↻ Syncing…` → `⚓ Synced`.
- **Offline still works.** The app is a PWA: study with no connection, changes
  are kept on-device (`⚡ Offline` chip) and pushed the moment you're back
  online. If two devices edit while offline, the **last one to reconnect wins** —
  for a single student this is almost never an issue.
- **Existing local data is kept.** The first time you sign up from a device
  that already has Anchor data, that data becomes your account's cloud copy.
- **Sign out clears the device** (data stays safe in the cloud) — good for
  shared/school computers.
- **No password reset.** Accounts have no email behind them, so a forgotten
  password can't be recovered — pick one you'll remember. (The export button
  still works as a belt-and-braces backup.)
- **Free-tier note:** Supabase pauses projects after ~1 week with zero
  activity. Daily studying keeps it alive; if it ever pauses, restore it with
  one click in the dashboard.

## Troubleshooting

| Symptom | Fix |
|---|---|
| “Account created, but sign-in is blocked…” | Step 3 wasn't done — turn off *Confirm email*. |
| Sign-in screen never appears | `js/config.js` still has placeholders, or URL/key were pasted with typos. |
| `⚠ Sync error` chip | Supabase project is paused (dashboard → Restore) or the table wasn't created (Step 2). |
| Works locally, not on Pages | Hard-refresh (Ctrl+Shift+R) — the service worker may be serving an old version. |

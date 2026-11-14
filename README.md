# ⚓ Anchor — Memory that holds

The self-directed memorisation app for high-stakes students. A live map of your memory where **green is earned by recall, fades with real forgetting**, and every satisfying pixel is scientifically honest.

Built on the two study techniques rated "high utility" across all of educational psychology — **practice testing** and **spaced practice** — scheduled by **FSRS-6** (the open algorithm trained on 500M+ real reviews, the one behind modern Anki). No AI inside.

Runs in two modes:

- **Local-only** (default, zero setup): everything lives on-device in `localStorage`.
- **Cloud mode**: sign in with your email + password and everything saves online automatically — same account on any device, with email confirmation and password reset. Setup is ~15 minutes with a free Supabase project: **[docs/CLOUD-SETUP.md](docs/CLOUD-SETUP.md)**.

## Run it

It's a static app — no build step. Any of these work:

- **Local:** `node dev-server.js` → http://localhost:4173
- **Deploy:** drop the folder on GitHub Pages / Netlify / Vercel / Cloudflare Pages. Done — it's a full PWA (installable, offline) when served over HTTPS. To turn on accounts + online sync, follow [docs/CLOUD-SETUP.md](docs/CLOUD-SETUP.md).

## What's inside

| Path | What |
|---|---|
| `index.html` `anchor.css` | App shell + design system (dark-first, light theme included) |
| `js/fsrs.js` | FSRS-6 scheduler — retrievability, stability, exam-date compression |
| `js/store.js` | Data layer — content/state separation, export/import/share, streaks |
| `js/config.js` `js/cloud.js` | Cloud layer — accounts, revision-checked sync, the view-as "lens", admin API client |
| `js/merge.js` | Three-way merge of two edited copies of an account — nothing is ever silently overwritten |
| `js/classroom.js` | Managed decks (install/update), homework progress, the student's Homework + Notes strip |
| `js/teach.js` | Tutor dashboard — students, homework, library, groups, lesson brief, quiz mode |
| `js/admin.js` | Admin console — every account, roles, view/edit as user, backups, raw JSON, audit log |
| `supabase-setup.sql` | One-time database setup script for a new project (everything) |
| `supabase/migrations/` | The exact migrations applied to the live project |
| `supabase/functions/admin-users/` | Edge function for account actions that need the service key (create, password, email, delete) |
| `js/seed.js` | Full HSC Business Studies syllabus (255 items / 443 facets) + demo chain |
| `js/ui-main.js` | Router (URL hash — back button works), sidebar library, Harbour, subject boards (Mode A), session player, editors |
| `js/ui-extra.js` | Icons, menus, drag-to-reorder, folders, Chains → essays → paragraphs (Mode B), stats, settings, FX engine |
| `manifest.webmanifest` `sw.js` `icons/` | PWA layer |
| `docs/RESEARCH.md` | The science foundation — every feature cited to the literature |
| `docs/PLAN.md` | Product plan, UX flows, data architecture, roadmap |

## Tutoring (v7)

Anchor doubles as a tutoring platform. Roles live in `public.profiles`: **user** (plain Anchor), **student**, **tutor**, **admin**. Everything below is enforced by the database (row-level security + the `admin-users` edge function), not just hidden in the UI.

- **Teaching** (`#/teach`, tutors + admin)
  - **Students** — roster with streaks, reviews this week, overdue homework and who's gone quiet. **Drag a deck onto a student or a group** to set homework (or click it — works on phones too).
  - **New student** — creates a real account with a password you choose (no confirmation email), optionally preloaded with decks, and gives you a ready-to-send login message.
  - **Library** — publish any subject / essay / chain from *your own* Anchor as a deck. Edit it normally, hit **Publish update**, and every student who has it gets the new version — keeping their progress (same card ids). Students can add their own cards to your decks but can't change yours (they can make a personal copy).
  - **Homework** — goal = anchor every card / 80% / 50%, or do N reviews; optional tabs only; due date and note. Progress is computed from their real study state, never self-reported.
  - **Student page** — a *lesson brief*: most-missed cards (14 days), what's fading, and **typed answers to check** against the real answer (mark "actually wrong" and it comes back to them). Plus homework, their subjects, notes to them (shown on their Harbour), private notes only you see.
  - **Open their Anchor** — the whole app, as them (read-only until you unlock). **Quiz them** — run a session on their cards in a lesson; your grades count in their Anchor, marked tutor-graded.
- **Admin** (`#/admin`, admin only) — every account in a sortable/searchable table with live study metrics; bulk make-students / set homework / export; per account: profile + role, view as user, **edit as user** (behind a typed-email confirmation), backups (preview / download / restore), raw JSON editor, set password, reset email, change email, reset progress, delete; full audit log.
- **The admin role can only be granted from the Supabase SQL console** — no API call can create or remove an admin, not even an admin's.

### Data safety
- Every save names the revision it was built on (`save_anchor`). If someone else saved meanwhile (another device, or the tutor), the app merges both versions (`js/merge.js`) and saves again — so a tutor can add cards while a student is mid-session and nothing is lost.
- Automatic backups (`anchor_backups`): daily per account, before the first edit by anyone other than the owner (per 10-minute session), before any save that shrinks an account a lot, and before every restore. Anyone can restore their own from **Settings → Backups**.
- Every edit made to someone else's account is written to `admin_audit` by a database trigger.

## Organising

- **Folders** — group subjects on the Harbour, and essays/chains on the Chains page (e.g. “English”, “SOR essays”). Deleting a folder never deletes what's inside.
- **Drag to reorder** — subjects, folders, tabs, cards, essays, paragraphs and chain links. Mouse drags from anywhere on a card; on touch, drag the ⋮⋮ grip. Drop onto a folder (or a folder in the sidebar) to file it; drop a card under another heading to regroup it; drop a standalone chain onto an essay to make it a paragraph.
- **Move to…** — every ⋯ menu has a tap-friendly alternative to dragging.
- **Essays have their own page** — leaving a paragraph takes you back to its essay, and the stepper hops between paragraphs.
- Link an essay to a subject and it also appears on that subject's board under **Essays & chains**.

## The two modes

- **Mode A · Syllabus boards** — a subject has **tabs** (one per syllabus area, e.g. "Finance — Role"), tabs hold **cards**. Plain front/back by default; an opt-in *dual* style gives each term definition + key-facts sides. Reveal → produce → self-grade. **Three successful recalls anchor a card green**, and green fades as predicted retrievability decays.
- **Mode B · Chains** — for essays and sequences: paste a paragraph, type **your own** keyword per sentence, master the order (arrange + recall-the-chain-from-cold games), then each keyword becomes a recall card, then recite the whole thing from memory. **Essays group several paragraph chains** with shared progress.

No AI inside the app — but Settings ships a copyable prompt that makes any AI emit a perfectly-formatted subject file from your notes, which Anchor imports in one tap. Subjects also export/import as files for sharing between mates.

## Principles (short version)

1. Retrieval is the unit of progress — browsing earns nothing.
2. The scheduler never locks anything; study ahead whenever — FSRS keeps honest books.
3. Every celebration is triggered by a real recall event.
4. Numbers can go down. That's a feature.

In local-only mode, data lives in `localStorage` — export a backup from **Data & settings** (one tap) regularly. In cloud mode every change syncs to your account automatically (the ⚓ chip in the top bar shows sync status); exports remain a good belt-and-braces backup.

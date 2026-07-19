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
| `js/config.js` `js/cloud.js` | Cloud layer — email/password accounts + automatic online sync (Supabase) |
| `supabase-setup.sql` | One-time database setup script for cloud mode |
| `js/seed.js` | Full HSC Business Studies syllabus (255 items / 443 facets) + demo chain |
| `js/ui-main.js` | Harbour, subject boards (Mode A), session player, editors |
| `js/ui-extra.js` | Chains (Mode B), stats dashboards, settings, FX engine |
| `manifest.webmanifest` `sw.js` `icons/` | PWA layer |
| `docs/RESEARCH.md` | The science foundation — every feature cited to the literature |
| `docs/PLAN.md` | Product plan, UX flows, data architecture, roadmap |

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

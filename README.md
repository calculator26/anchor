# ⚓ Anchor — Memory that holds

The self-directed memorisation app for high-stakes students. A live map of your memory where **green is earned by recall, fades with real forgetting**, and every satisfying pixel is scientifically honest.

Built on the two study techniques rated "high utility" across all of educational psychology — **practice testing** and **spaced practice** — scheduled by **FSRS-6** (the open algorithm trained on 500M+ real reviews, the one behind modern Anki), running entirely on-device. No accounts, no server, no AI.

## Run it

It's a static app. Any of these work:

- **Local:** `node dev-server.js` → http://localhost:4173
- **Deploy:** drop the folder on Netlify / Vercel / GitHub Pages / Cloudflare Pages. Done — it's a full PWA (installable, offline) when served over HTTPS.

## What's inside

| Path | What |
|---|---|
| `index.html` `anchor.css` | App shell + design system (dark-first, light theme included) |
| `js/fsrs.js` | FSRS-6 scheduler — retrievability, stability, exam-date compression |
| `js/store.js` | Data layer — content/state separation, export/import/share, streaks |
| `js/seed.js` | Full HSC Business Studies syllabus (255 items / 443 facets) + demo chain |
| `js/ui-main.js` | Harbour, subject boards (Mode A), session player, editors |
| `js/ui-extra.js` | Chains (Mode B), stats dashboards, settings, FX engine |
| `manifest.webmanifest` `sw.js` `icons/` | PWA layer |
| `docs/RESEARCH.md` | The science foundation — every feature cited to the literature |
| `docs/PLAN.md` | Product plan, UX flows, data architecture, roadmap |

## The two modes

- **Mode A · Syllabus boards** — the syllabus mapped subject → topic → section → item, each with definition + key-facts facets. Reveal → produce → self-grade. Verified green ("anchored") requires an actual successful recall, and fades as predicted retrievability decays.
- **Mode B · Chains** — for essays and sequences: paste a paragraph, choose **your own** keyword per sentence, master the order (arrange / next-link games), then each keyword becomes a recall card, then recite the whole thing from memory.

## Principles (short version)

1. Retrieval is the unit of progress — browsing earns nothing.
2. The scheduler never locks anything; study ahead whenever — FSRS keeps honest books.
3. Every celebration is triggered by a real recall event.
4. Numbers can go down. That's a feature.

Data lives in `localStorage` — export a backup from **Data & settings** (one tap) regularly.

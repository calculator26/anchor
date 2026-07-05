# Anchor — Product Plan & Architecture

**One line:** the self-directed memorisation app for high-stakes students — a live map of your memory where green is earned by recall, fades with real forgetting, and every pixel of satisfaction is scientifically honest.

**Tagline:** *Memory that holds.*

---

## 1. Positioning

| | Anki | Quizlet | **Anchor** |
|---|---|---|---|
| Structure | Flat decks | Flat sets | **The syllabus itself** — subject → topic → section → item, exactly how the HSC is examined |
| Control | Locked queue, spoon-fed | Aimless | **Fully self-directed** — browse, study ahead, clear sections; the scheduler keeps honest books either way |
| Progress feel | A number | Vanity % | **A board that goes green** — and fades when your memory does |
| Essays / sequences | Nothing | Nothing | **Chains** — the keyword-per-sentence method, built in |
| Science | Good scheduler, dated UX | Weak | FSRS-6 scheduler **plus** generation, successive relearning, calibration training, honest gamification |
| AI | — | AI-generated card dumps | **None. Deliberately.** Making your own material is the first study pass (generation effect). |

## 2. What we took from the co-founder brief, and what we left

**Kept (in full):** FSRS running locally as cheap transparent maths · produce-before-reveal as the default study act · retention-honest streaks · honest dashboards (memory-strength map, fade forecasts, confidence-vs-accuracy calibration) · refusal to build learning-styles, recognition-default study, vanity metrics, dark patterns.

**Kept (reinterpreted without AI):** "concept-level not card-level" → items have two facets (definition + key facts) plus essay chains have links + order + recital layers; mastery is per-*thing*, verified across formats. "AI grades your free answer" → **you** grade your answer against the revealed one — which the metacognition literature supports when the comparison target is visible, and which our calibration dashboard actively trains.

**Left out (for now, by explicit decision):** all AI (ingest, grading, Socratic follow-ups, transfer probes) · server/auth/Postgres stack — v1 is local-first and static-deployable; the data layer is designed so a sync backend can be added later without schema surgery.

## 3. Brand system

- **Name:** Anchor. An anchor *holds* — the app's whole job is making memory hold. Chains, links, drift, harbour: one coherent metaphor family, used sparingly.
- **Logo:** geometric anchor in a rounded-square tile, teal on deep navy. Drawn as inline SVG (crisp at any size, themable).
- **Palette (dark-first):** deep navy `#0B0F17` background · surface `#151B26` · teal accent `#2DD4BF` (interactive) · **anchored green `#34D399`** · fading amber `#F0B45B` · adrift coral `#F0766B` · text `#E9EEF7 / #9AA7BD / #5E6B84`. Light theme mirrors it.
- **Type:** Inter / Segoe UI system stack. Numbers use tabular figures for odometer effects.
- **Voice:** calm, precise, quietly confident. Celebrations are crisp, never childish. ("Section anchored." not "WOO HOO!!! 🎉🎉")

## 4. The Green System (the psychological core)

Every studyable *facet* (a definition, a set of key facts, a chain link) has:

1. **Confidence tag** (user-set anytime — the instant-gratification triage from the original tool): `Know it / Getting there / Not yet`. Sets card colour immediately. Autonomy preserved.
2. **Memory state** (earned only by recall events): FSRS `{Difficulty, Stability, last review}` → live **Retrievability** R.
3. **Anchored** (the real green): tagged *Know it* **and** verified by at least one successful recall. Unverified greens render with a hollow dot + "untested" — a gentle, ever-present nudge to prove it.

**The fade:** an anchored card's green dot/border saturation is a function of live R. At R < target (default 0.90) it enters the **due queue** and shows *Review due*. Neglect the app for a week and the board visibly drains toward amber — loss aversion pointed at the truth (§9 of RESEARCH.md).

**Grades** (after reveal): `✗ Missed · ~ Shaky · ✓ Got it · ⚡ Instant` → FSRS Again/Hard/Good/Easy. Got-it/Instant auto-tag green (verified); Shaky → amber; Missed → red. The colours converge to honesty just by studying.

**Celebration ladder** (all recall-triggered, ~250ms, skippable):
- Facet goes verified-green → dot pop + green sweep across the card + occasional (12%) particle variant (variable reward).
- Section 100% verified → full-width shimmer + "Section anchored ⚓" banner; section header badge.
- Topic 100% → topic pill fills solid + toast. Subject 100% → the big one (one-time full-screen moment).
- Session milestones: combo ×5/×10/×20; daily goal ring closing; streak milestones 3/7/14/30/50/100.

## 5. Mode A — Syllabus (categorical mastery)

**Layout (evolves the Business Studies tool):** sticky nav: subject switcher · topic pills (Finance/Marketing/Operations) · unit tabs (Role/Influences/Processes/Strategies) · facet toggle (Definitions/Key Facts) · Review queue button with due badge · Stats. Item cards in three columns: term | content (hidden → reveal) | confidence + schedule + history dots.

**Flows:**
- *Browse & rate* (their original loop, kept): reveal → self-grade → next. Works in place, no session required.
- *Focus session:* from the review queue (or "study this section") → full-screen one-card-at-a-time player: term shown → **type your answer** (default-on, skippable) → reveal → compare → grade (keys 1–4) → next. Progress bar, combo counter, live "greens gained". Ends with a summary card: cards cleared, accuracy, memory-days banked, best combo.
- *Study ahead:* any card studiable anytime; FSRS credits early reviews honestly. No locks anywhere.

**Queue building:** due facets sorted by lowest R, round-robin interleaved across sections/topics (spacing between similar items), capped by session size setting.

## 6. Mode B — Chains (sequential mastery for essays)

The proven manual method, productised: *one keyword per sentence → master the sequence → expand each keyword back into its sentence → recite the lot.*

**Builder:** paste paragraph/essay → auto sentence-split (editable: merge/split/edit) → for each sentence pick **your own** keyword by tapping a word in it (or typing one) — self-generated cues, enforced-unique. → Chain created; links render as an actual chain of link-icons.

**Study stages (unlock by readiness, not by lock — the next stage is always *offered*):**
1. **Order** — see the numbered keyword skeleton; then *Arrange* (shuffled keyword chips → tap into order; errors shown) and *Next-link* (given a keyword, recall what follows; first-letter hints). Clean runs grade the chain's own FSRS state.
2. **Links** — each keyword ↔ sentence is a card in the normal recall loop (front: "¶3 · link 4 — *sustainability*", back: the sentence). Scheduled by FSRS like everything else.
3. **Recital** — blank page, keyword skeleton optionally visible, write the paragraph from memory → self-check sentence-by-sentence against the original → per-sentence grades feed each link. Chain shows **Forged** when order + all links are anchored.

## 7. Scheduler specification

- **FSRS-6**, default parameters `[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]`, implemented in ~150 lines of dependency-free JS (`js/fsrs.js`).
- Forgetting curve `R(t,S) = (1 + F·t/S)^(−w₂₀)` with `F = 0.9^(−1/w₂₀) − 1`; interval for target retention r: `t = (S/F)·(r^(−1/w₂₀) − 1)`.
- Same-day re-reviews use the FSRS-6 short-term formula; lapses use the post-lapse stability (capped at prior S).
- **Exam clamp:** per-subject exam date; next-due is never scheduled past the exam; within 21 days of the exam, intervals are additionally compressed (`min(interval, max(1, ⌈daysLeft/3⌉))`) so everything cycles before the day.
- Target retention default 0.90 (settable 0.80–0.95).

## 8. Data architecture (`localStorage`, versioned, exportable)

```jsonc
{
  "v": 1,
  "settings": { "theme": "dark", "dailyGoal": 20, "retention": 0.9, "typeFirst": true },
  "subjects": [{
    "id": "biz-hsc", "name": "Business Studies", "tagline": "HSC", "examDate": "2026-10-19",
    "topics": [{ "id": "finance", "name": "Finance",
      "sections": [{ "id": "fin-role-strategic", "name": "Strategic Role & Objectives", "unit": "Role",
        "items": [{ "id": "b001", "term": "Profitability", "def": "…", "key": "…" }] }] }]
  }],
  "chains": [{ "id": "ch1", "subjectId": "biz-hsc", "title": "Operations essay ¶2",
    "sentences": [{ "id": "s1", "text": "…", "kw": "sustainability" }], "created": "2026-07-05" }],
  "state": {
    "f:b001:def": { "conf": "g", "srs": { "S": 12.4, "D": 4.1, "last": "2026-07-01T…", "reps": 5, "lapses": 1 },
                     "hist": [{ "t": "…", "g": 3, "r": 0.87 }], "got": 4, "miss": 1 }
    // keys: f:{itemId}:{def|key} · c:{chainId}:{sentenceId} · o:{chainId} (chain order state)
  },
  "act": { "2026-07-05": { "n": 34, "got": 30, "miss": 4, "greens": 6, "goalHit": true } },
  "meta": { "created": "2026-07-05", "milestones": ["streak3"] }
}
```

- Content and study-state are **separate namespaces** → a subject can be exported *content-only* and shared with a mate, or exported *with progress* as a personal backup. Import offers merge/replace.
- Facet keys are stable and global-unique → the same schema powers items, chain links and chain order.
- PWA: `manifest.webmanifest` + service worker (cache-first app shell) → installable on a phone home screen, fully offline. No accounts, no server, zero running cost. A future sync backend only needs to replicate this one JSON blob.

## 9. Stats engine (every number defined)

| Stat | Definition |
|---|---|
| **Anchored %** | verified-green facets ÷ total facets (per section/topic/subject/global) |
| **Recall right now** | mean live R across all facets with memory state — the honest headline; falls when you slack |
| **Due / pipeline** | count with R < target; histogram of next 14 days' due dates |
| **Memory-days banked** | Σ stability across facets (and Δ per session — "+38 days of memory") |
| **Accuracy** | got ÷ (got+missed), overall and last-7-days |
| **Calibration** | for reviews where the card was tagged green/amber/red *before* the attempt: success rate per tag, charted vs the ideal |
| **Streak** | consecutive days with ≥ daily-goal real grades (goal editable; misses shown honestly, no fake freezes in v1) |
| **Activity** | 12-week heatmap of daily review counts |
| **Per-item micro-history** | dot timeline of every attempt with date + R at attempt, on the card |

## 10. Screens

1. **Harbour (home):** greeting, streak flame + goal ring, "due across subjects" callout, subject cards (anchored % ring, due badge, exam countdown), + New subject / Load sample / Import.
2. **Subject board:** the Mode A dashboard above.
3. **Session player:** full-screen focus loop (works for queue, section drills, chain links).
4. **Chains:** chain list → builder wizard → chain board (stages, link states) → order games / recital.
5. **Stats:** global and per-subject, all §9 visuals.
6. **Data & settings:** export/import/share, theme, goals, retention target, exam dates, reset, **Science page** (the RESEARCH.md story, in-app, so users know *why* it works — trust is a feature).

## 11. Build plan

- **v1.0 (this build):** everything above, seeded with the full Business Studies syllabus (255 items / 443 facets) + a sample chain. Vanilla JS, zero dependencies, static files, PWA. Verified in-browser.
- **v1.1:** spaced *section* drills («weakest section first» suggestions), richer chain analytics, print/export summary sheets, optional sound design.
- **v2:** account sync (the JSON blob → server), shared subject library between mates, per-user FSRS parameter optimisation from review history (the data is already being logged for it).
- **Non-goals:** AI anything (for now), social feeds, leaderboards (comparison ≠ learning), ads.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Self-grading drift (students grade kindly) | Calibration dashboard makes the drift visible; produce-first typing makes comparison concrete; copy nudges honesty ("grade what you *wrote*, not what you meant"). |
| localStorage loss (cleared site data) | Loud, easy export; auto-reminder to back up every 7 active days; import merge. |
| Fade anxiety (board draining feels bad) | Fades are gradual, recovery is one review away, and messaging frames due cards as "ready to strengthen" (desirable difficulty), never as failure. |
| Content-entry friction without AI | Bulk paste format (`Term | definition | key facts`), instant seed subject, share/import between friends. |

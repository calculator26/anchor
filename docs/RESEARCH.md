# Anchor — The Science Foundation

*Every feature in Anchor traces back to a finding in this document. If a feature can't cite a line here, it doesn't ship.*

---

## 1. How memory actually works (and why students study wrong)

Memory has three phases — encoding, storage, retrieval — and the failure point for exam students is almost always **retrieval**: the material went in, but can't be pulled out under pressure.

Two findings frame everything:

- **The forgetting curve is real and brutal.** Ebbinghaus's 1885 curve was directly replicated in 2015 by [Murre & Dros](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0120644) to within a few percentage points: without review, most new material is inaccessible within days. Forgetting follows a decelerating (roughly power-law) decay — it plunges early, then flattens.
- **Storage strength ≠ retrieval strength (Bjork's "new theory of disuse").** You can have something firmly stored yet momentarily unretrievable — and crucially, *the harder a successful retrieval is, the more it strengthens the memory*. Difficulty during practice is not a bug; it's the mechanism. These are Bjork's **desirable difficulties**.

**The core student failure mode:** re-reading notes feels fluent, and fluency feels like knowing. It isn't. The *feeling of knowing* is driven by recognition, which is far easier than production. This is why students study for hours, feel productive, and blank in the exam hall.

> **Design principle #1 — Anchor never lets fluency masquerade as knowledge.** The unit of progress is a successful *retrieval*, not a page view.

---

## 2. The two heavyweight techniques

The definitive review is [Dunlosky et al. (2013), *Improving Students' Learning With Effective Learning Techniques*](https://journals.sagepub.com/doi/abs/10.1177/1529100612453266), which graded ten study techniques on evidence. Only **two** earned "high utility":

### 2a. Practice testing (retrieval practice)

Actively pulling an answer from memory beats re-exposure — one of the most replicated effects in psychology.

- [Rowland (2014)](https://pdf.retrievalpractice.org/MetaAnalysisGuide.pdf) meta-analysis: **g = 0.50** across 159 effect sizes vs. restudy.
- [Adesope, Trevisan & Sundararajan (2017)](https://journals.sagepub.com/doi/abs/10.3102/0034654316689306) meta-analysis: **g = 0.61**, and — directly relevant to us — **secondary students benefited more than any other age group**, and classroom results matched the lab.
- Moderators that matter (Rowland; Adesope):
  - **More effortful retrieval → bigger effect** (free recall > cued recall > recognition/multiple-choice).
  - **Feedback amplifies the effect** (seeing the answer after attempting).
  - **A mixture of formats** produced the strongest effects.

### 2b. Distributed practice (spacing)

- [Cepeda et al. (2006)](http://www.lscp.net/persons/ramus/docs/EPR20.pdf) — meta-analysis of 254 studies: spaced study reliably beats massed study, and **the optimal gap scales with how long you need to remember** (longer horizon → longer gaps). Follow-up work confirmed gaps should **expand** after each successful recall.
- Cramming "works" for tomorrow and evaporates by next month — exactly the failure mode of trial-prep-then-HSC.

> **Design principle #2 — Anchor's default loop is *spaced retrieval with feedback*, in mixed formats, with gaps that expand on success.** That single sentence is most of the product.

---

## 3. Successive relearning — the exact protocol Anchor operationalizes

The strongest classroom-proven packaging of the two heavyweights is **successive relearning** ([Rawson & Dunlosky 2022 overview](https://journals.sagepub.com/doi/full/10.1177/09637214221100484)): retrieve each item to a **criterion** (e.g. one correct recall) in a session, then relearn it to criterion again in **multiple spaced sessions**.

Results in real courses are startling:

- Course-exam performance improved by **more than a full letter grade** vs. business-as-usual studying ([Rawson, Dunlosky & Sciartelli 2013](https://www.researchgate.net/publication/258845409_The_Power_of_Successive_Relearning_Improving_Performance_on_Course_Exams_and_Long-Term_Retention)).
- After three spaced relearning sessions, students retained **~80% a week later**; a fourth session held **77% three weeks out**.
- Replicated on a high-stakes exam in a difficult biopsychology course ([Janes et al. 2020](https://onlinelibrary.wiley.com/doi/abs/10.1002/acp.3699)).

> **Design principle #3 — "Anchored" (green) is a criterion state, not a mood.** An item is only truly anchored when it has been *successfully recalled*, and it must be re-earned across spaced sessions. One tap of "I know it" without a recall is triage, not mastery — Anchor tracks the difference honestly.

---

## 4. Scheduling: the DSR model and FSRS-6

Modern spaced repetition models each memory with three numbers (the **DSR model**, from Wozniak's SuperMemo research):

- **Difficulty (D)** — how inherently hard this item is for *you* (1–10).
- **Stability (S)** — how many days until recall probability decays to 90%.
- **Retrievability (R)** — the probability you could recall it *right now*; decays along the forgetting curve.

The open-source **FSRS** scheduler ([spec](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler), [algorithm wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)) implements DSR with parameters trained on **hundreds of millions of real reviews**. In benchmarks it predicts memory better than SM-2 (old Anki) and needs **~20–30% fewer reviews for the same retention**; Anki made it the default scheduler in 2023.

Key properties Anchor uses:

- Forgetting curve: `R(t, S) = (1 + FACTOR · t/S)^(−w₂₀)` — a power law, matching human forgetting better than an exponential.
- Reviewing *just before you'd forget* grows stability the most; reviewing very early grows it only slightly. **This is what makes self-directed studying safe**: FSRS doesn't break when you study ahead — it just credits it honestly via R.
- Failure (a lapse) shrinks stability but doesn't zero it — relearning is faster than initial learning, as the data shows.

> **Design principle #4 — the scheduler is local, transparent maths (no server, no AI), it never locks content, and it treats early/late reviews honestly.** Students browse and study anything anytime; FSRS simply keeps the books.

**Exam-awareness (our HSC extension):** Cepeda's gap-scaling result implies gaps should be tuned to the retention horizon — for an HSC student the horizon is *the exam date*. Anchor therefore never schedules a review beyond the exam, and compresses intervals as the exam approaches. That is a principled reading of the spacing literature, not a hack.

---

## 5. Generation: produce before you peek

- **Generation effect**: information you *produce* is remembered better than information you read — meta-analysis of 86 studies shows a medium-to-large effect ([Bertsch et al. 2007](https://link.springer.com/article/10.3758/BF03193441)).
- **Pretesting effect**: even *failed* attempts before seeing the answer improve later memory, provided feedback follows ([Journal of Cognition, 2025](https://journalofcognition.org/articles/10.5334/joc.455); [Memory & Cognition, 2025](https://link.springer.com/article/10.3758/s13421-025-01813-x)). Errors + feedback are not harmful — students only *believe* they are (a documented metacognitive illusion).

> **Design principle #5 — produce-before-reveal is the default.** The reveal button is an *answer check*, not the study act. Anchor encourages typing/saying the answer first (configurable, never forced — see autonomy, §9).

---

## 6. Metacognition: students can't be trusted to self-assess — unless you scaffold it

- Students systematically **overestimate** their knowledge; low performers are the most overconfident ([persistent miscalibration even with feedback](https://pmc.ncbi.nlm.nih.gov/articles/PMC8442020/)).
- **Delayed** judgments of learning (rating yourself after a gap, at retrieval time) are far more accurate than immediate ones.
- Calibration **is trainable**: judgment training with feedback measurably improves monitoring accuracy and performance ([Enhanced monitoring accuracy study](https://www.sciencedirect.com/science/article/abs/pii/S0959475218308788)).

Anchor self-grades without AI. That's defensible *because*:
1. Grading happens **after a full reveal** — comparing your produced answer against the real one is a recognition-level task students do reliably.
2. Grades are **delayed JOLs by construction** (they happen at spaced retrieval, not at encoding).
3. Anchor shows a **calibration dashboard** — "when you tagged something green, how often did you actually recall it later?" — turning self-assessment itself into a trained skill.

> **Design principle #6 — make the student a better judge of their own memory.** Confidence tags are compared against recall outcomes and the gap is shown, kindly and unmissably.

---

## 7. What Anchor deliberately does NOT build

| Popular thing | Verdict from the literature | Anchor's stance |
|---|---|---|
| Re-reading, highlighting | Low utility (Dunlosky 2013) | Not a study mode. Browsing exists for orientation only and earns zero progress. |
| Learning styles (visual/auditory matching) | Debunked myth | Never. |
| Recognition-only flipping ("yeah I knew that") | Inflates false confidence | Reveal without an attempt is allowed (autonomy) but the produce-first path is the default and the celebrated one. |
| Locked, spoon-fed queues (Anki-style) | Kills autonomy → kills motivation (SDT, §9) | Everything browsable and studiable at all times. |
| Streaks that reward app-opening | Metric gaming; "engagement" ≠ learning | Streaks count **real recalls only** (§9). |
| AI-generated card dumps | Skips the encoding pass entirely | No AI in the app. Making your own cards *is* studying (generation effect, self-generated cues §8). |

---

## 8. The science behind Mode B (Essay Chains)

HSC students must reproduce **structured, sequential** prose — band-6 essay paragraphs, legal citations in order, PDHPE processes. Flashcards are the wrong shape for this. The right shape, per the literature:

- **Serial order is its own memory problem.** Recalling *what comes next* is distinct from recalling *content*. Order must be practised as order ([Roediger 1980, The Effectiveness of Four Mnemonics in Ordering Recall](http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Roediger-1980_JEPHLM.pdf)).
- **Reduced cues work.** First-letter cueing and acronym mnemonics reliably aid ordered recall — each letter/keyword acts as a retrieval cue for the full unit ([Putnam 2015, Mnemonics in Education](https://www.adamlputnam.com/uploads/8/3/5/6/83563830/putnam_2015.pdf)).
- **Self-generated cues beat provided cues.** Cues you choose yourself are more distinctive and better associated with the target ([Tullis & Finley 2018](https://journals.sagepub.com/doi/10.1177/2372732218788092)). *This is why Anchor makes the student pick their own keyword per sentence rather than generating one for them* — the choosing is itself an encoding event.
- **Chunking + chaining**: one keyword per sentence collapses a 200-word paragraph into a 6–8 item chain — within working-memory span — and each recalled sentence cues the next ([narrative review of self-generated cues](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5664228/)).

So Mode B trains **three layers, in order**:
1. **The chain** — the keyword sequence itself (order memory, first-letter style cues).
2. **The links** — keyword → full sentence (cued recall, FSRS-scheduled like any card).
3. **The recital** — full free-recall reconstruction, self-checked sentence-by-sentence (the highest-effort, highest-value retrieval; Rowland's effort moderator).

---

## 9. Motivation: making green addictive *without lying*

### The evidence on gamification (it's real, but conditional)

- [Sailer & Homner (2020) meta-analysis](https://link.springer.com/article/10.1007/s10648-019-09498-w): gamification has significant effects on **cognitive (g = 0.49)**, motivational (g = 0.36) and behavioral (g = 0.25) outcomes — but motivational effects are the least stable. Translation: gamify, carefully, and tie rewards to learning events.
- Self-Determination Theory (the backbone of the motivation literature): motivation thrives on **competence** (visible progress), **autonomy** (self-direction), **relatedness**. Anki fails autonomy; Quizlet fails competence-honesty. Anchor's self-directed dashboard is an autonomy machine — and a [2023 meta-analysis](https://link.springer.com/article/10.1007/s11423-023-10337-7) confirms gamification's strongest effects run through intrinsic motivation, autonomy and relatedness.

### The specific levers Anchor pulls

| Lever | Evidence | Anchor implementation |
|---|---|---|
| **Goal-gradient effect** — effort accelerates near a goal | [Kivetz, Urminsky & Zheng 2006](https://journals.sagepub.com/doi/abs/10.1509/jmkr.43.1.39) | Section progress bars that visibly *near completion*; "3 left in this section" nudges; session progress bar. |
| **Endowed progress** — pre-loaded progress increases completion (34% vs 19% in the car-wash field experiment) | [Nunes & Drèze 2006](https://learningloop.io/plays/psychology/endowed-progress-effect) | New sections show "already rated" and partial states immediately; sessions start with the bar visibly non-zero after card 1; imports pre-populate the map so the board never feels cold. |
| **Loss aversion** — losses hurt ~2× | Duolingo's streak programme ([600+ experiments](https://blog.duolingo.com/how-duolingo-streak-builds-habit/); streak establishment predicts long-term retention better than any other metric) | The **streak** (real reviews only) and — more honestly — **fading greens**: anchored items visibly lose saturation as predicted retrievability decays. What you see slipping is *your actual memory*, so the loss-aversion pull is aligned with truth. |
| **Variable reward / curiosity** | Octalysis core drive 7 | Occasional bonus celebration variants on going green; "surprise" milestone cards. Cosmetic only — never gates content. |
| **Competence feedback loops** | SDT; Octalysis CD2 (Development & Accomplishment) | Instant colour state change, odometer mastery %, combo counter in sessions, section-anchored banners, per-item history dots. |

### The white-hat rule

[Octalysis](https://yukaichou.com/gamification-examples/octalysis-gamification-framework/) distinguishes **white-hat** drives (meaning, accomplishment, autonomy — sustainable, feel good) from **black-hat** drives (loss, urgency, unpredictability — powerful, corrosive if dominant). Anchor's contract:

> **Design principle #7 — white-hat drives carry the app; black-hat drives are seasoning, and every black-hat signal must be *true*.** The streak reflects real study. The fading green reflects a real forgetting curve. We never invent fake urgency, fake scarcity, or fake loss — the forgetting curve provides all the genuine urgency a student needs.

### Retention-honest metrics (from the co-founder brief, kept in full)

- A streak day = hitting your real review goal, not opening the app.
- Mastery % counts only recall-verified greens; self-tagged-but-unverified greens are shown as a separate, gently-nagging number.
- The headline stat is **"what you could recall right now"** (mean live retrievability), which *goes down when you slack off*. An honest number that can fall is worth ten vanity numbers that only rise.

---

## 10. Interleaving (used with care)

Interleaving related-but-confusable material improves discrimination and delayed test performance, but it has a boundary condition: the [similarity-matters meta-analysis](https://www.researchgate.net/publication/335004545_Similarity_matters_A_meta-analysis_of_interleaved_learning_and_its_moderators) found **blocking beats interleaving for word-list-style material**, while interleaving wins for confusable categories and problem types.

> **Design principle #8 — Anchor interleaves at the *session* level (mixing sections/topics in a review queue, which also maximises spacing between similar items) but never forces it; browsing by section remains blocked, which is correct for definition-style material.**

---

## 11. Summary: finding → feature map

| # | Finding | Anchor feature |
|---|---|---|
| 1 | Retrieval practice g ≈ 0.5–0.6; strongest for secondary students | Reveal→grade loop; produce-before-reveal; sessions |
| 2 | Feedback amplifies testing | Answer always shown after attempt; compare-then-grade |
| 3 | Effortful retrieval > recognition | Type-first mode; free-recital stage in Chains |
| 4 | Spacing, expanding gaps, horizon-scaled | FSRS-6 local scheduler; exam-date compression |
| 5 | Successive relearning: criterion + spaced sessions | "Anchored" = recalled-to-criterion, re-earned over sessions |
| 6 | Forgetting curve (power-law decay) | Live retrievability %, fading greens, due queue |
| 7 | Generation effect; self-made materials | Built-in editor; no AI card dumps; you write, you choose |
| 8 | Self-generated cues > provided | You pick your own keyword per sentence in Chains |
| 9 | Serial-order memory needs order practice | Chain stage 1: arrange/next-link games |
| 10 | Overconfidence; delayed JOLs; trainable calibration | Self-grade at retrieval; calibration dashboard |
| 11 | Gamification works when tied to learning events | Green system, combos, milestones — all recall-triggered |
| 12 | Goal-gradient + endowed progress | Section bars, "N left", non-zero starts |
| 13 | Loss aversion, honestly applied | Real-review streaks; greens that fade with true R |
| 14 | Autonomy drives motivation (SDT) | Never locked, fully self-directed, study-ahead safe |
| 15 | Interleaving with similarity boundary | Mixed-topic queues; blocked browsing preserved |

---

### Sources

- [Murre & Dros 2015 — Replication of Ebbinghaus' forgetting curve (PLOS One)](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0120644)
- [Dunlosky et al. 2013 — Improving Students' Learning With Effective Learning Techniques](https://journals.sagepub.com/doi/abs/10.1177/1529100612453266)
- [Adesope et al. 2017 — Rethinking the Use of Tests: A Meta-Analysis of Practice Testing](https://journals.sagepub.com/doi/abs/10.3102/0034654316689306)
- [Rowland 2014 — meta-analysis of the testing effect (summary)](https://pdf.retrievalpractice.org/MetaAnalysisGuide.pdf)
- [Cepeda et al. 2006 — Distributed practice meta-analysis](http://www.lscp.net/persons/ramus/docs/EPR20.pdf)
- [Rawson & Dunlosky 2022 — Successive Relearning (Current Directions)](https://journals.sagepub.com/doi/full/10.1177/09637214221100484)
- [Rawson, Dunlosky & Sciartelli 2013 — The Power of Successive Relearning](https://www.researchgate.net/publication/258845409_The_Power_of_Successive_Relearning_Improving_Performance_on_Course_Exams_and_Long-Term_Retention)
- [Janes et al. 2020 — Successive relearning on a high-stakes exam](https://onlinelibrary.wiley.com/doi/abs/10.1002/acp.3699)
- [FSRS — free-spaced-repetition-scheduler (GitHub)](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler) · [Algorithm wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) · [Implementing FSRS in 100 lines](https://borretti.me/article/implementing-fsrs-in-100-lines) · [FSRS vs SM-2](https://domenic.me/fsrs/)
- [Bertsch et al. 2007 — The generation effect: a meta-analytic review](https://link.springer.com/article/10.3758/BF03193441)
- [Pretesting effect — Journal of Cognition 2025](https://journalofcognition.org/articles/10.5334/joc.455) · [Memory & Cognition 2025](https://link.springer.com/article/10.3758/s13421-025-01813-x)
- [Persistent miscalibration despite feedback (CBE-LSE)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8442020/) · [Judgment training improves monitoring accuracy](https://www.sciencedirect.com/science/article/abs/pii/S0959475218308788)
- [Roediger 1980 — The Effectiveness of Four Mnemonics in Ordering Recall](http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Roediger-1980_JEPHLM.pdf)
- [Putnam 2015 — Mnemonics in Education](https://www.adamlputnam.com/uploads/8/3/5/6/83563830/putnam_2015.pdf)
- [Tullis & Finley 2018 — Self-Generated Memory Cues](https://journals.sagepub.com/doi/10.1177/2372732218788092) · [Narrative review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5664228/)
- [Sailer & Homner 2020 — The Gamification of Learning: a Meta-analysis](https://link.springer.com/article/10.1007/s10648-019-09498-w) · [2023 SDT-lens meta-analysis](https://link.springer.com/article/10.1007/s11423-023-10337-7)
- [Kivetz, Urminsky & Zheng 2006 — Goal-Gradient Hypothesis Resurrected](https://journals.sagepub.com/doi/abs/10.1509/jmkr.43.1.39) · [Nunes & Drèze 2006 — Endowed progress](https://learningloop.io/plays/psychology/endowed-progress-effect)
- [Duolingo — streak & habit research](https://blog.duolingo.com/how-duolingo-streak-builds-habit/)
- [Octalysis — Yu-kai Chou](https://yukaichou.com/gamification-examples/octalysis-gamification-framework/)
- [Similarity Matters — interleaving meta-analysis](https://www.researchgate.net/publication/335004545_Similarity_matters_A_meta-analysis_of_interleaved_learning_and_its_moderators)

/* ============================================================================
   Anchor · fsrs.js — local scheduling engine
   Implements FSRS-6 (Free Spaced Repetition Scheduler), the open-source
   DSR-model algorithm benchmarked on 500M+ real reviews and adopted as
   Anki's default. Runs entirely on-device: cheap, transparent maths.
   Memory state per facet: { S: stability (days until R=90%),
                             D: difficulty (1..10),
                             last: ISO timestamp of last review,
                             reps, lapses }
   Grades: 1=Missed(Again) 2=Shaky(Hard) 3=Got it(Good) 4=Instant(Easy)
   ========================================================================== */
(function () {
  'use strict';

  // FSRS-6 default parameters w0..w20 (trained on the open review dataset)
  var W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
           1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
           1.8729, 0.5425, 0.0912, 0.0658, 0.1542];

  var DECAY = -W[20];                              // negative exponent of the power-law curve
  var FACTOR = Math.pow(0.9, 1 / DECAY) - 1;       // ensures R(S, S) = 0.9

  var MIN_S = 0.05, MAX_S = 36500;
  var clamp = function (x, lo, hi) { return Math.min(hi, Math.max(lo, x)); };

  // --- The forgetting curve -------------------------------------------------
  // Probability of recall after `days` elapsed with stability S.
  function retrievability(days, S) {
    if (!S || S <= 0) return 0;
    if (days <= 0) return 1;
    return Math.pow(1 + FACTOR * days / S, DECAY);
  }

  // Days until R decays from 1 to `r` given stability S.
  function intervalFor(S, r) {
    return Math.max(0.5, (S / FACTOR) * (Math.pow(r, 1 / DECAY) - 1));
  }

  // --- Initial state ---------------------------------------------------------
  function initStability(g) { return clamp(W[g - 1], MIN_S, MAX_S); }

  function initDifficulty(g) {
    return clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
  }

  // --- Updates ---------------------------------------------------------------
  function nextDifficulty(D, g) {
    var deltaD = -W[6] * (g - 3);
    var dPrime = D + deltaD * ((10 - D) / 9);            // linear damping
    var target = initDifficulty(4);
    return clamp(W[7] * target + (1 - W[7]) * dPrime, 1, 10); // mean reversion
  }

  // Stability after a successful recall (g >= 2), given R at review time.
  function recallStability(D, S, R, g) {
    var hardPenalty = (g === 2) ? W[15] : 1;
    var easyBonus = (g === 4) ? W[16] : 1;
    var inc = Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) *
              Math.expm1(W[10] * (1 - R)) * hardPenalty * easyBonus + 1;
    return clamp(S * inc, MIN_S, MAX_S);
  }

  // Stability after a lapse (g = 1). Never exceeds prior S: relearning is
  // faster than first learning, but forgetting does cost you.
  function forgetStability(D, S, R) {
    var sF = W[11] * Math.pow(D, -W[12]) *
             (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R));
    return clamp(Math.min(sF, S), MIN_S, MAX_S);
  }

  // Same-day (short-term) review — FSRS-6 formula.
  function shortTermStability(S, g) {
    var sInc = Math.exp(W[17] * (g - 3 + W[18])) * Math.pow(S, -W[19]);
    if (g >= 3) sInc = Math.max(sInc, 1);                // a pass never weakens
    return clamp(S * sInc, MIN_S, MAX_S);
  }

  // --- Public API -------------------------------------------------------------

  // Apply a grade to a (possibly null) memory state. Returns the new state.
  function grade(srs, g, now) {
    now = now || Date.now();
    g = clamp(Math.round(g), 1, 4);
    if (!srs || !srs.S) {
      return {
        S: initStability(g),
        D: initDifficulty(g),
        last: new Date(now).toISOString(),
        reps: 1,
        lapses: g === 1 ? 1 : 0
      };
    }
    var elapsedDays = (now - Date.parse(srs.last)) / 864e5;
    var S, D;
    if (elapsedDays < 1) {                                // same-day re-review
      S = shortTermStability(srs.S, g);
      D = nextDifficulty(srs.D, g);
    } else {
      var R = retrievability(elapsedDays, srs.S);
      if (g === 1) S = forgetStability(srs.D, srs.S, R);
      else S = recallStability(srs.D, srs.S, R, g);
      D = nextDifficulty(srs.D, g);
    }
    return {
      S: S, D: D,
      last: new Date(now).toISOString(),
      reps: (srs.reps || 0) + 1,
      lapses: (srs.lapses || 0) + (g === 1 ? 1 : 0)
    };
  }

  // Live retrievability of a state right now (0..1), or null if never studied.
  function rNow(srs, now) {
    if (!srs || !srs.S) return null;
    now = now || Date.now();
    return retrievability((now - Date.parse(srs.last)) / 864e5, srs.S);
  }

  // Scheduled interval in days for a state at the given retention target,
  // compressed as a subject exam approaches and never scheduled past it.
  function scheduledDays(srs, retention, examISO, now) {
    if (!srs || !srs.S) return 0;
    now = now || Date.now();
    var days = intervalFor(srs.S, retention || 0.9);
    if (examISO) {
      var toExam = (Date.parse(examISO + 'T23:59:59') - now) / 864e5;
      if (toExam > 0) {
        if (toExam <= 21) days = Math.min(days, Math.max(1, Math.ceil(toExam / 3)));
        days = Math.min(days, Math.max(0.5, toExam - 0.5));
      }
    }
    return days;
  }

  // Epoch ms when the facet next falls due.
  function dueAt(srs, retention, examISO) {
    if (!srs || !srs.S) return null;
    return Date.parse(srs.last) + scheduledDays(srs, retention, examISO, Date.parse(srs.last)) * 864e5;
  }

  // Is the facet due (R at or below the retention target)?
  function isDue(srs, retention, now) {
    var r = rNow(srs, now);
    return r !== null && r <= (retention || 0.9);
  }

  window.FSRS = {
    grade: grade,
    rNow: rNow,
    retrievability: retrievability,
    intervalFor: intervalFor,
    scheduledDays: scheduledDays,
    dueAt: dueAt,
    isDue: isDue,
    PARAMS: W
  };
})();

/* ============================================================================
   Anchor · store.js — data layer (schema v2)
   The whole content model is two ideas: a subject has TABS, tabs hold CARDS.
   A card may carry an optional `group` label (small heading inside a tab).
   Card styles per subject:  dual:false → front/back   (term + back)
                             dual:true  → term + definition + key facts
   Anchored = tagged green AND >= GREEN_CRITERION successful recalls
   (successive relearning: recall it to criterion, re-earn it over sessions).
   Facet keys:  f:{cardId}:card            simple card
                f:{cardId}:def|key         dual-style facets
                c:{chainId}:{sentId}       chain links (keyword -> sentence)
                o:{chainId}                chain order (the sequence itself)
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'anchor_v1'; // storage key kept stable across schema versions
  var GREEN_CRITERION = 3;

  var S = blank();

  function blank() {
    return {
      v: 2,
      settings: { theme: 'dark', dailyGoal: 20, retention: 0.9, typeFirst: true },
      subjects: [],
      essays: [],   // {id, title, subjectId} — an essay groups several chains (one per paragraph)
      chains: [],   // {id, subjectId, essayId, title, sentences:[{id,text,kw}], created}
      state: {},    // facetKey -> {conf, srs, hist:[{t,g,r,c}], got, miss}
      act: {},      // 'YYYY-MM-DD' -> {n, got, miss, greens, goalHit}
      meta: { created: null, milestones: [] }
    };
  }

  /* --- persistence ----------------------------------------------------------- */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { console.error('Anchor: save failed', e); }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.v === 2) { S = withDefaults(parsed); return; }
        if (parsed && parsed.v === 1) { S = withDefaults(migrateV1(parsed)); save(); return; }
      }
    } catch (e) { console.error('Anchor: load failed', e); }
    S = blank();
    S.meta.created = todayISO();
  }

  function withDefaults(d) {
    d.settings = Object.assign({ theme: 'dark', dailyGoal: 20, retention: 0.9, typeFirst: true }, d.settings);
    d.subjects = d.subjects || [];
    d.essays = d.essays || [];
    d.chains = d.chains || [];
    d.state = d.state || {};
    d.act = d.act || {};
    d.meta = d.meta || { created: todayISO(), milestones: [] };
    return d;
  }

  // v1 had subjects → topics → sections(unit) → items. Flatten to tabs + cards.
  // Card ids are preserved, so all study state carries over untouched.
  function migrateV1(old) {
    var next = blank();
    next.settings = old.settings || next.settings;
    next.state = old.state || {};
    next.act = old.act || {};
    next.meta = old.meta || next.meta;
    next.chains = (old.chains || []).map(function (c) { c.essayId = c.essayId || null; return c; });
    next.subjects = (old.subjects || []).map(function (subj) {
      var hasDef = false, hasKey = false, tabs = [];
      (subj.topics || []).forEach(function (t) {
        var units = [];
        (t.sections || []).forEach(function (sec) {
          if (sec.unit && units.indexOf(sec.unit) < 0) units.push(sec.unit);
        });
        var buckets = units.length ? units : [null];
        buckets.forEach(function (u) {
          var cards = [];
          (t.sections || []).forEach(function (sec) {
            if ((sec.unit || null) !== u) return;
            (sec.items || []).forEach(function (it) {
              var card = { id: it.id, term: it.term };
              if (it.def) { card.def = it.def; hasDef = true; }
              if (it.key) { card.key = it.key; hasKey = true; }
              if (it.note) card.note = it.note;
              if (sec.name) card.group = sec.name;
              cards.push(card);
            });
          });
          if (cards.length) tabs.push({ id: uid('tab'), name: u ? t.name + ' — ' + u : t.name, cards: cards });
        });
      });
      return { id: subj.id, name: subj.name, tagline: subj.tagline || '', examDate: subj.examDate || null,
               dual: hasDef && hasKey, tabs: tabs };
    });
    return next;
  }

  /* --- small helpers ------------------------------------------------------------ */
  function todayISO(d) {
    var dt = d ? new Date(d) : new Date();
    return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
  }
  function uid(prefix) {
    return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function facetState(k, create) {
    if (!S.state[k] && create) S.state[k] = { conf: null, srs: null, hist: [], got: 0, miss: 0 };
    return S.state[k];
  }

  /* --- content lookups ------------------------------------------------------------ */
  function subjectById(id) { return S.subjects.find(function (s) { return s.id === id; }) || null; }
  function chainById(id) { return S.chains.find(function (c) { return c.id === id; }) || null; }
  function essayById(id) { return S.essays.find(function (e) { return e.id === id; }) || null; }

  // The text a facet studies. Tolerant of style switches: something sensible
  // always renders even if a card was written under the other style.
  function facetText(card, mode) {
    if (mode === 'def') return card.def || card.back || '';
    if (mode === 'key') return card.key || '';
    return card.back || card.def || card.key || '';
  }

  function cardModes(subj) { return subj.dual ? ['def', 'key'] : ['card']; }

  // Every studyable facet of a subject: [{key, card, mode, tab}]
  function subjectFacets(subj) {
    var out = [];
    subj.tabs.forEach(function (tab) {
      tab.cards.forEach(function (card) {
        cardModes(subj).forEach(function (mode) {
          if (facetText(card, mode)) out.push({ key: 'f:' + card.id + ':' + mode, card: card, mode: mode, tab: tab });
        });
      });
    });
    return out;
  }

  function chainFacets(ch) {
    return ch.sentences.map(function (sn, i) {
      return { key: 'c:' + ch.id + ':' + sn.id, sent: sn, idx: i, chain: ch };
    });
  }

  function resolveFacet(key) {
    var p = key.split(':');
    if (p[0] === 'f') {
      for (var si = 0; si < S.subjects.length; si++) {
        var subj = S.subjects[si];
        for (var ti = 0; ti < subj.tabs.length; ti++) {
          var tab = subj.tabs[ti];
          for (var ci = 0; ci < tab.cards.length; ci++) {
            if (tab.cards[ci].id === p[1]) {
              return { kind: 'item', subject: subj, tab: tab, card: tab.cards[ci], mode: p[2] };
            }
          }
        }
      }
      return null;
    }
    if (p[0] === 'c') {
      var ch = chainById(p[1]);
      if (!ch) return null;
      var idx = ch.sentences.findIndex(function (s2) { return s2.id === p[2]; });
      if (idx < 0) return null;
      return { kind: 'link', chain: ch, sent: ch.sentences[idx], idx: idx,
               subject: ch.subjectId ? subjectById(ch.subjectId) : null };
    }
    if (p[0] === 'o') {
      var ch2 = chainById(p[1]);
      return ch2 ? { kind: 'order', chain: ch2, subject: ch2.subjectId ? subjectById(ch2.subjectId) : null } : null;
    }
    return null;
  }

  /* --- the study transaction --------------------------------------------------------- */
  // Anchored (verified green) demands the successive-relearning criterion:
  // GREEN_CRITERION successful recalls, and a green tag.
  function isVerified(key) {
    var st = S.state[key];
    return !!(st && st.conf === 'g' && st.got >= GREEN_CRITERION);
  }

  function recallsToGo(key) {
    var st = S.state[key];
    return Math.max(0, GREEN_CRITERION - (st ? st.got : 0));
  }

  function applyGrade(key, g) {
    var st = facetState(key, true);
    var now = Date.now();
    var preR = FSRS.rNow(st.srs, now);
    var confBefore = st.conf;
    var wasVerified = isVerified(key);

    st.srs = FSRS.grade(st.srs, g, now);
    st.hist.push({ t: new Date(now).toISOString(), g: g, r: preR === null ? null : Math.round(preR * 100) / 100, c: confBefore });
    if (st.hist.length > 100) st.hist.shift();
    if (g >= 3) st.got++; else if (g === 1) st.miss++;

    // Colours converge to honesty: green only once the criterion is met.
    if (g === 1) st.conf = 'r';
    else if (g === 2) st.conf = 'a';
    else st.conf = st.got >= GREEN_CRITERION ? 'g' : 'a';

    var day = todayISO();
    var a = S.act[day] || (S.act[day] = { n: 0, got: 0, miss: 0, greens: 0, goalHit: false });
    a.n++;
    if (g >= 3) a.got++; else if (g === 1) a.miss++;

    var nowVerified = isVerified(key);
    var wentGreen = !wasVerified && nowVerified;
    if (wentGreen) a.greens++;
    if (!a.goalHit && a.n >= S.settings.dailyGoal) a.goalHit = true;

    save();
    return {
      wentGreen: wentGreen,
      verified: nowVerified,
      srs: st.srs,
      got: st.got,
      toGo: Math.max(0, GREEN_CRITERION - st.got),
      goalJustHit: a.goalHit && a.n === S.settings.dailyGoal
    };
  }

  // Manual confidence tag — self-directed triage. Green from a tap still needs
  // the recall criterion before it counts as anchored.
  function setConf(key, c) {
    var st = facetState(key, true);
    st.conf = (st.conf === c) ? null : c;
    save();
    return st.conf;
  }

  /* --- due queue ----------------------------------------------------------------------- */
  function dueFacets(subjectId) {
    var out = [], ret = S.settings.retention, now = Date.now();
    Object.keys(S.state).forEach(function (k) {
      var st = S.state[k];
      if (!st || !st.srs) return;
      if (k.charAt(0) === 'o') return;                    // order states surface on chain cards
      var ctx = resolveFacet(k);
      if (!ctx) return;
      // The review queue exists to keep your anchors green. Only anchored
      // cards cycle back — amber/red cards are studied from the board.
      if (!isVerified(k)) return;
      // Subject review = that subject's own board cards; chain links are
      // reviewed from the Chains page (or the global queue).
      if (subjectId) {
        if (ctx.kind !== 'item' || ctx.subject.id !== subjectId) return;
      }
      var exam = ctx.subject ? ctx.subject.examDate : null;
      var r = FSRS.rNow(st.srs, now);
      if (r !== null && r <= ret) out.push({ key: k, r: r, ctx: ctx, exam: exam });
    });
    out.sort(function (a, b) { return a.r - b.r; });      // weakest first
    // round-robin across tabs/chains so similar cards spread out
    var groups = {};
    out.forEach(function (d) {
      var gk = d.ctx.kind === 'item' ? 'tab-' + d.ctx.tab.id : 'chain-' + d.ctx.chain.id;
      (groups[gk] = groups[gk] || []).push(d);
    });
    var keys = Object.keys(groups), mixed = [], added = true;
    while (added) {
      added = false;
      for (var i = 0; i < keys.length; i++) {
        var g2 = groups[keys[i]];
        if (g2.length) { mixed.push(g2.shift()); added = true; }
      }
    }
    return mixed;
  }

  /* --- streak / activity ----------------------------------------------------------------- */
  function streak() {
    var need = Math.max(1, Math.min(10, S.settings.dailyGoal));
    var n = 0, d = new Date();
    var today = S.act[todayISO(d)];
    if (!today || today.n < need) d.setDate(d.getDate() - 1);
    while (true) {
      var a = S.act[todayISO(d)];
      if (a && a.n >= need) { n++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  }

  function todayActivity() {
    return S.act[todayISO()] || { n: 0, got: 0, miss: 0, greens: 0, goalHit: false };
  }

  /* --- content mutations -------------------------------------------------------------------- */
  function addSubject(name, tagline, examDate, dual) {
    var subj = { id: uid('s'), name: name, tagline: tagline || '', examDate: examDate || null,
                 dual: !!dual, tabs: [] };
    S.subjects.push(subj); save(); return subj;
  }
  function addTab(subj, name) {
    var tab = { id: uid('tab'), name: name, cards: [] };
    subj.tabs.push(tab); save(); return tab;
  }
  function addCard(tab, fields) {
    var card = { id: uid('c'), term: fields.term };
    ['back', 'def', 'key', 'group', 'note'].forEach(function (f) { if (fields[f]) card[f] = fields[f]; });
    tab.cards.push(card); save(); return card;
  }
  function deleteCard(subj, cardId) {
    subj.tabs.forEach(function (tab) {
      var i = tab.cards.findIndex(function (c) { return c.id === cardId; });
      if (i >= 0) tab.cards.splice(i, 1);
    });
    ['card', 'def', 'key'].forEach(function (m) { delete S.state['f:' + cardId + ':' + m]; });
    save();
  }
  function deleteTab(subj, tabId) {
    var i = subj.tabs.findIndex(function (t) { return t.id === tabId; });
    if (i < 0) return;
    subj.tabs[i].cards.forEach(function (c) {
      ['card', 'def', 'key'].forEach(function (m) { delete S.state['f:' + c.id + ':' + m]; });
    });
    subj.tabs.splice(i, 1);
    save();
  }
  function deleteSubject(id) {
    var subj = subjectById(id);
    if (!subj) return;
    subjectFacets(subj).forEach(function (f) { delete S.state[f.key]; });
    S.chains.filter(function (c) { return c.subjectId === id; }).forEach(function (c) { deleteChainState(c); });
    S.chains = S.chains.filter(function (c) { return c.subjectId !== id; });
    S.essays = S.essays.filter(function (e) { return e.subjectId !== id; });
    S.subjects = S.subjects.filter(function (s2) { return s2.id !== id; });
    save();
  }
  function addEssay(title, subjectId) {
    var e = { id: uid('e'), title: title, subjectId: subjectId || null };
    S.essays.push(e); save(); return e;
  }
  function deleteEssay(id) {
    S.chains.forEach(function (c) { if (c.essayId === id) c.essayId = null; });
    S.essays = S.essays.filter(function (e) { return e.id !== id; });
    save();
  }
  function addChain(subjectId, essayId, title, sentences) {
    var ch = { id: uid('ch'), subjectId: subjectId || null, essayId: essayId || null,
               title: title, created: todayISO(), sentences: sentences };
    S.chains.push(ch); save(); return ch;
  }
  function deleteChainState(ch) {
    ch.sentences.forEach(function (sn) { delete S.state['c:' + ch.id + ':' + sn.id]; });
    delete S.state['o:' + ch.id];
  }
  function deleteChain(id) {
    var ch = chainById(id);
    if (!ch) return;
    deleteChainState(ch);
    S.chains = S.chains.filter(function (c) { return c.id !== id; });
    save();
  }

  /* --- seed ----------------------------------------------------------------------------------- */
  function loadSeed() {
    if (!window.ANCHOR_SEED) return null;
    var seed = JSON.parse(JSON.stringify(window.ANCHOR_SEED));
    if (!subjectById(seed.subject.id)) S.subjects.push(seed.subject);
    if (seed.essay && !essayById(seed.essay.id)) S.essays.push(seed.essay);
    if (seed.chain && !chainById(seed.chain.id)) {
      seed.chain.created = todayISO();
      S.chains.push(seed.chain);
    }
    save();
    return seed.subject;
  }

  /* --- export / import ---------------------------------------------------------------------------
     Share format (anchorShare: 2) is deliberately forgiving: ids are optional
     (AI-generated files won't have them), unknown fields are ignored.        */
  function exportAll() { return JSON.stringify(S, null, 1); }

  function exportSubject(id, withProgress) {
    var subj = subjectById(id);
    if (!subj) return null;
    var chains = S.chains.filter(function (c) { return c.subjectId === id; });
    var pack = {
      anchorShare: 2,
      subject: subj,
      essays: S.essays.filter(function (e) { return e.subjectId === id; }),
      chains: chains
    };
    if (withProgress) {
      pack.state = {};
      subjectFacets(subj).forEach(function (f) { if (S.state[f.key]) pack.state[f.key] = S.state[f.key]; });
      chains.forEach(function (c) {
        chainFacets(c).forEach(function (f) { if (S.state[f.key]) pack.state[f.key] = S.state[f.key]; });
        if (S.state['o:' + c.id]) pack.state['o:' + c.id] = S.state['o:' + c.id];
      });
    }
    return JSON.stringify(pack, null, 1);
  }

  function sanitizeSubject(raw) {
    if (!raw || typeof raw !== 'object' || !raw.name) throw new Error('bad subject');
    var subj = {
      id: (typeof raw.id === 'string' && raw.id) ? raw.id : uid('s'),
      name: String(raw.name).trim().slice(0, 80),
      tagline: raw.tagline ? String(raw.tagline).trim().slice(0, 120) : '',
      examDate: (typeof raw.examDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.examDate)) ? raw.examDate : null,
      dual: !!raw.dual,
      tabs: []
    };
    var tabs = Array.isArray(raw.tabs) ? raw.tabs : [];
    tabs.forEach(function (rt) {
      if (!rt || !rt.name) return;
      var tab = { id: (typeof rt.id === 'string' && rt.id) ? rt.id : uid('tab'),
                  name: String(rt.name).trim().slice(0, 80), cards: [] };
      (Array.isArray(rt.cards) ? rt.cards : []).forEach(function (rc) {
        if (!rc || !rc.term) return;
        var card = { id: (typeof rc.id === 'string' && rc.id) ? rc.id : uid('c'),
                     term: String(rc.term).trim().slice(0, 300) };
        ['back', 'def', 'key', 'group', 'note'].forEach(function (f) {
          if (rc[f]) card[f] = String(rc[f]).trim().slice(0, 4000);
        });
        if (facetText(card, 'card')) tab.cards.push(card);
      });
      if (tab.cards.length) subj.tabs.push(tab);
    });
    if (!subj.tabs.length) throw new Error('no cards');
    return subj;
  }

  function importData(text) {
    var data = JSON.parse(text);
    if (data && (data.v === 1 || data.v === 2) && data.subjects && data.state !== undefined) {
      S = withDefaults(data.v === 1 ? migrateV1(data) : data);       // full backup: replace
      save();
      return { kind: 'full' };
    }
    var shared = null;
    if (data && data.anchorShare === 2 && data.subject) shared = data;
    if (data && data.anchorShare === 1 && data.subject) {            // legacy share → run through migration
      var m = migrateV1({ subjects: [data.subject], chains: data.chains || [] });
      shared = { anchorShare: 2, subject: m.subjects[0], chains: m.chains, essays: [], state: data.state };
    }
    if (shared) {
      var subj = sanitizeSubject(shared.subject);
      var existing = subjectById(subj.id);
      if (existing) S.subjects[S.subjects.indexOf(existing)] = subj;
      else S.subjects.push(subj);
      (Array.isArray(shared.essays) ? shared.essays : []).forEach(function (e) {
        if (e && e.id && e.title && !essayById(e.id)) S.essays.push({ id: e.id, title: String(e.title).slice(0, 120), subjectId: subj.id });
      });
      (Array.isArray(shared.chains) ? shared.chains : []).forEach(function (c) {
        if (c && c.id && c.title && Array.isArray(c.sentences) && !chainById(c.id)) S.chains.push(c);
      });
      if (shared.state && typeof shared.state === 'object') {
        Object.keys(shared.state).forEach(function (k) { S.state[k] = shared.state[k]; });
      }
      var n = 0;
      subj.tabs.forEach(function (t) { n += t.cards.length; });
      save();
      return { kind: 'subject', name: subj.name, cards: n };
    }
    throw new Error('Not an Anchor file');
  }

  function resetProgress() {
    S.state = {}; S.act = {}; S.meta.milestones = [];
    save();
  }

  window.Store = {
    GREEN_CRITERION: GREEN_CRITERION,
    data: function () { return S; },
    save: save, load: load, uid: uid, todayISO: todayISO,
    subjectById: subjectById, chainById: chainById, essayById: essayById,
    cardModes: cardModes, facetText: facetText,
    subjectFacets: subjectFacets, chainFacets: chainFacets, resolveFacet: resolveFacet,
    facetState: facetState, applyGrade: applyGrade, setConf: setConf,
    isVerified: isVerified, recallsToGo: recallsToGo,
    dueFacets: dueFacets, streak: streak, todayActivity: todayActivity,
    addSubject: addSubject, addTab: addTab, addCard: addCard,
    deleteCard: deleteCard, deleteTab: deleteTab, deleteSubject: deleteSubject,
    addEssay: addEssay, deleteEssay: deleteEssay,
    addChain: addChain, deleteChain: deleteChain,
    loadSeed: loadSeed,
    exportAll: exportAll, exportSubject: exportSubject, importData: importData, resetProgress: resetProgress
  };
})();

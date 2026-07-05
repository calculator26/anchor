/* ============================================================================
   Anchor · store.js — data layer
   Content (subjects/chains) and study-state live in separate namespaces so
   content can be shared with a mate while progress stays personal.
   Facet keys:  f:{itemId}:{def|key}   item facets
                c:{chainId}:{sentId}   chain links (keyword -> sentence)
                o:{chainId}            chain order (the sequence itself)
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'anchor_v1';

  var S = {
    v: 1,
    settings: { theme: 'dark', dailyGoal: 20, retention: 0.9, typeFirst: true },
    subjects: [],
    chains: [],
    state: {},   // facetKey -> {conf, srs, hist:[{t,g,r,c}], got, miss}
    act: {},     // 'YYYY-MM-DD' -> {n, got, miss, greens, goalHit}
    meta: { created: null, milestones: [] }
  };

  // --- persistence -----------------------------------------------------------
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { console.error('Anchor: save failed', e); }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.v === 1) {
          S = parsed;
          S.settings = Object.assign({ theme: 'dark', dailyGoal: 20, retention: 0.9, typeFirst: true }, S.settings);
          S.meta = S.meta || { created: todayISO(), milestones: [] };
          return;
        }
      }
    } catch (e) { console.error('Anchor: load failed', e); }
    S.meta.created = todayISO();
  }

  // --- small helpers -----------------------------------------------------------
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

  // --- content lookups ---------------------------------------------------------
  function subjectById(id) { return S.subjects.find(function (s) { return s.id === id; }) || null; }
  function chainById(id) { return S.chains.find(function (c) { return c.id === id; }) || null; }

  // Enumerate all studyable facets of a subject: [{key, item, mode, section, topic}]
  function subjectFacets(subj) {
    var out = [];
    subj.topics.forEach(function (t) {
      t.sections.forEach(function (sec) {
        sec.items.forEach(function (it) {
          if (it.def) out.push({ key: 'f:' + it.id + ':def', item: it, mode: 'def', section: sec, topic: t });
          if (it.key) out.push({ key: 'f:' + it.id + ':key', item: it, mode: 'key', section: sec, topic: t });
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

  // Locate an item facet's context from its key. Returns null for chain facets.
  function resolveFacet(key) {
    var p = key.split(':');
    if (p[0] === 'f') {
      for (var si = 0; si < S.subjects.length; si++) {
        var subj = S.subjects[si];
        for (var ti = 0; ti < subj.topics.length; ti++) {
          var t = subj.topics[ti];
          for (var ci = 0; ci < t.sections.length; ci++) {
            var sec = t.sections[ci];
            for (var ii = 0; ii < sec.items.length; ii++) {
              if (sec.items[ii].id === p[1]) {
                return { kind: 'item', subject: subj, topic: t, section: sec, item: sec.items[ii], mode: p[2] };
              }
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

  // --- the study transaction -----------------------------------------------------
  // Apply a grade (1..4) to a facet. Records history with pre-review R and the
  // confidence tag held *before* the attempt (for the calibration dashboard).
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

    // colours converge to honesty through study
    st.conf = (g >= 3) ? 'g' : (g === 2 ? 'a' : 'r');

    // daily activity
    var day = todayISO();
    var a = S.act[day] || (S.act[day] = { n: 0, got: 0, miss: 0, greens: 0, goalHit: false });
    a.n++;
    if (g >= 3) a.got++; else if (g === 1) a.miss++;

    var nowVerified = isVerified(key);
    var wentGreen = !wasVerified && nowVerified;
    if (wentGreen) a.greens++;
    if (!a.goalHit && a.n >= S.settings.dailyGoal) a.goalHit = true;

    save();
    return { wentGreen: wentGreen, verified: nowVerified, srs: st.srs, goalJustHit: a.goalHit && a.n === S.settings.dailyGoal };
  }

  // Manual confidence tag (triage — does not create memory state).
  function setConf(key, c) {
    var st = facetState(key, true);
    st.conf = (st.conf === c) ? null : c;
    save();
    return st.conf;
  }

  // Verified green = tagged green AND at least one successful recall on record.
  function isVerified(key) {
    var st = S.state[key];
    return !!(st && st.conf === 'g' && st.srs && st.got > 0);
  }

  // --- due queue -------------------------------------------------------------------
  // Every studied facet whose live R has decayed to/below the retention target.
  function dueFacets(subjectId) {
    var out = [], ret = S.settings.retention, now = Date.now();
    Object.keys(S.state).forEach(function (k) {
      var st = S.state[k];
      if (!st || !st.srs) return;
      if (k.charAt(0) === 'o') return;                    // order states surface on chain cards
      var ctx = resolveFacet(k);
      if (!ctx) return;                                    // orphaned state
      if (subjectId) {
        var sid = ctx.subject ? ctx.subject.id : (ctx.chain ? ctx.chain.subjectId : null);
        if (sid !== subjectId) return;
      }
      var exam = ctx.subject ? ctx.subject.examDate : null;
      var r = FSRS.rNow(st.srs, now);
      if (r !== null && r <= ret) out.push({ key: k, r: r, ctx: ctx, exam: exam });
    });
    out.sort(function (a, b) { return a.r - b.r; });      // weakest first
    // round-robin interleave across sections/chains so similar items spread out
    var groups = {};
    out.forEach(function (d) {
      var gk = d.ctx.kind === 'item' ? d.ctx.section.id : ('chain-' + d.ctx.chain.id);
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

  // --- streak / activity -----------------------------------------------------------
  function streak() {
    var need = Math.max(1, Math.min(10, S.settings.dailyGoal));
    var n = 0, d = new Date();
    var today = S.act[todayISO(d)];
    if (!today || today.n < need) d.setDate(d.getDate() - 1);   // today may be in progress
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

  // --- content mutations --------------------------------------------------------------
  function addSubject(name, tagline, examDate) {
    var subj = { id: uid('s'), name: name, tagline: tagline || '', examDate: examDate || null, topics: [] };
    S.subjects.push(subj); save(); return subj;
  }
  function addTopic(subj, name) {
    var t = { id: uid('t'), name: name, sections: [] };
    subj.topics.push(t); save(); return t;
  }
  function addSection(topic, name, unit) {
    var sec = { id: uid('sec'), name: name, items: [] };
    if (unit) sec.unit = unit;
    topic.sections.push(sec); save(); return sec;
  }
  function addItem(section, term, def, key, note) {
    var it = { id: uid('i'), term: term };
    if (def) it.def = def;
    if (key) it.key = key;
    if (note) it.note = note;
    section.items.push(it); save(); return it;
  }
  function deleteItem(section, itemId) {
    var i = section.items.findIndex(function (x) { return x.id === itemId; });
    if (i >= 0) {
      section.items.splice(i, 1);
      delete S.state['f:' + itemId + ':def'];
      delete S.state['f:' + itemId + ':key'];
      save();
    }
  }
  function deleteSubject(id) {
    var subj = subjectById(id);
    if (!subj) return;
    subjectFacets(subj).forEach(function (f) { delete S.state[f.key]; });
    S.chains.filter(function (c) { return c.subjectId === id; }).forEach(function (c) { deleteChainState(c); });
    S.chains = S.chains.filter(function (c) { return c.subjectId !== id; });
    S.subjects = S.subjects.filter(function (s2) { return s2.id !== id; });
    save();
  }
  function addChain(subjectId, title, sentences) {
    var ch = { id: uid('ch'), subjectId: subjectId || null, title: title,
               created: todayISO(), sentences: sentences };
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

  // --- seed -----------------------------------------------------------------------------
  function loadSeed() {
    if (!window.ANCHOR_SEED) return null;
    var seed = JSON.parse(JSON.stringify(window.ANCHOR_SEED));
    if (!subjectById(seed.subject.id)) S.subjects.push(seed.subject);
    if (seed.chain && !chainById(seed.chain.id)) {
      seed.chain.created = todayISO();
      S.chains.push(seed.chain);
    }
    save();
    return seed.subject;
  }

  // --- export / import --------------------------------------------------------------------
  function exportAll() {
    return JSON.stringify(S, null, 1);
  }
  function exportSubject(id, withProgress) {
    var subj = subjectById(id);
    if (!subj) return null;
    var pack = { anchorShare: 1, subject: subj,
                 chains: S.chains.filter(function (c) { return c.subjectId === id; }) };
    if (withProgress) {
      pack.state = {};
      subjectFacets(subj).forEach(function (f) { if (S.state[f.key]) pack.state[f.key] = S.state[f.key]; });
      pack.chains.forEach(function (c) {
        chainFacets(c).forEach(function (f) { if (S.state[f.key]) pack.state[f.key] = S.state[f.key]; });
        if (S.state['o:' + c.id]) pack.state['o:' + c.id] = S.state['o:' + c.id];
      });
    }
    return JSON.stringify(pack, null, 1);
  }
  function importData(text) {
    var data = JSON.parse(text);
    if (data && data.v === 1 && data.subjects) {          // full backup: replace
      S = data;
      save();
      return { kind: 'full' };
    }
    if (data && data.anchorShare === 1 && data.subject) { // shared subject: merge
      var existing = subjectById(data.subject.id);
      if (existing) S.subjects[S.subjects.indexOf(existing)] = data.subject;
      else S.subjects.push(data.subject);
      (data.chains || []).forEach(function (c) {
        if (!chainById(c.id)) S.chains.push(c);
      });
      if (data.state) Object.keys(data.state).forEach(function (k) { S.state[k] = data.state[k]; });
      save();
      return { kind: 'subject', name: data.subject.name };
    }
    throw new Error('Not an Anchor file');
  }
  function resetProgress() {
    S.state = {}; S.act = {}; S.meta.milestones = [];
    save();
  }

  window.Store = {
    data: function () { return S; },
    save: save, load: load, uid: uid, todayISO: todayISO,
    subjectById: subjectById, chainById: chainById,
    subjectFacets: subjectFacets, chainFacets: chainFacets, resolveFacet: resolveFacet,
    facetState: facetState, applyGrade: applyGrade, setConf: setConf, isVerified: isVerified,
    dueFacets: dueFacets, streak: streak, todayActivity: todayActivity,
    addSubject: addSubject, addTopic: addTopic, addSection: addSection, addItem: addItem,
    deleteItem: deleteItem, deleteSubject: deleteSubject,
    addChain: addChain, deleteChain: deleteChain,
    loadSeed: loadSeed,
    exportAll: exportAll, exportSubject: exportSubject, importData: importData, resetProgress: resetProgress
  };
})();

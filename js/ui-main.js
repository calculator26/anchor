/* ============================================================================
   Anchor · ui-main.js — router, app shell (sidebar + library), Harbour home,
   subject boards, session player, editors, boot. Loads last.
   Content model the user sees: folders hold subjects; a subject has TABS,
   tabs hold CARDS. Essays hold paragraph CHAINS (see ui-extra.js).
   Routes live in the URL hash, so the browser / phone back gesture works.
   ========================================================================== */
(function () {
  'use strict';

  var REV = {};     // revealed cards in browse mode (not persisted)
  var TYPED = {};   // in-progress typed/dictated answers for text mode (not persisted)
  var SCROLL = {};  // scroll position per route, restored on back/forward

  /* ─── Router · route object ⇄ URL hash ───────────────────────────────── */
  function toHash(r) {
    var e = encodeURIComponent;
    switch (r && r.v) {
      case 'subject': return '#/subject/' + e(r.id) + (r.tab ? '/' + e(r.tab) : '');
      case 'chains': return '#/chains';
      case 'essay': return '#/essay/' + e(r.id);
      case 'chain': return '#/chain/' + e(r.id);
      case 'arrange': return '#/chain/' + e(r.id) + '/arrange';
      case 'nextlink': return '#/chain/' + e(r.id) + '/recall';
      case 'recital': return '#/chain/' + e(r.id) + '/recital';
      case 'chainBuild': return '#/new-chain';
      case 'session': return '#/session';
      case 'stats': return '#/stats' + (r.s ? '/' + e(r.s) : '');
      case 'data': return '#/settings';
    }
    return '#/';
  }
  function parseHash(h) {
    var p;
    try { p = (h || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent); }
    catch (e) { p = []; }
    var a = p[0] || '';
    if (a === 'subject' && p[1]) return { v: 'subject', id: p[1], tab: p[2] };
    if (a === 'chains') return { v: 'chains' };
    if (a === 'essay' && p[1]) return { v: 'essay', id: p[1] };
    if (a === 'chain' && p[1]) {
      var sub = { arrange: 'arrange', recall: 'nextlink', recital: 'recital' }[p[2]];
      return { v: sub || 'chain', id: p[1] };
    }
    if (a === 'new-chain') return { v: 'chainBuild' };
    if (a === 'session') return { v: 'session' };
    if (a === 'stats') return { v: 'stats', s: p[1] };
    if (a === 'settings' || a === 'data') return { v: 'data' };
    return { v: 'home' };
  }

  var App = window.App = {
    route: { v: 'home' },
    sess: null,
    toHash: toHash,

    go: function (route, opts) {
      opts = opts || {};
      var cur = location.hash || '#/';
      SCROLL[cur] = window.scrollY;
      App.route = route;
      REV = {};
      TYPED = {};
      var h = toHash(route);
      if (h !== cur) {
        try { history[opts.replace ? 'replaceState' : 'pushState'](null, '', h); }
        catch (e) { location.hash = h; }
      }
      Menu.close();
      App.render();
      window.scrollTo(0, 0);
    },

    render: function () {
      if (window.Cloud && Cloud.gated()) { Cloud.renderGate(); return; }
      document.body.classList.remove('gated');
      Store.invalidate();
      var v = App.route.v, html = '';
      if (v === 'home') html = viewHome();
      else if (v === 'subject') html = viewSubject();
      else if (v === 'session') html = viewSession();
      else if (v === 'chains') html = V.chains();
      else if (v === 'essay') html = V.essay(App.route);
      else if (v === 'chainBuild') html = V.chainBuild();
      else if (v === 'chain') html = V.chain(App.route);
      else if (v === 'arrange') html = V.arrange(App.route);
      else if (v === 'nextlink') html = V.nextlink(App.route);
      else if (v === 'recital') html = V.recital(App.route);
      else if (v === 'stats') html = V.stats(App.route);
      else if (v === 'data') html = V.data();
      document.getElementById('view').innerHTML = html;
      document.body.classList.toggle('in-session', v === 'session');
      App.renderTop();
      afterRender();
    },

    renderTop: function () {
      var s = Store.data().settings;
      var act = Store.todayActivity();
      var goal = Math.max(1, s.dailyGoal);
      var frac = Math.min(1, act.n / goal);
      var ring = document.getElementById('goalRingFill');
      if (ring) ring.style.strokeDashoffset = String(94.2 * (1 - frac));
      var gt = document.getElementById('goalText');
      if (gt) gt.textContent = act.n + '/' + goal;
      document.getElementById('goalChip').classList.toggle('done', act.n >= goal);
      var st = Store.streak();
      document.getElementById('streakN').textContent = st;
      document.getElementById('streakChip').classList.toggle('hot', st > 0);
      var navMap = { home: 'home', subject: 'home', session: 'home', chains: 'chains', essay: 'chains', chainBuild: 'chains', chain: 'chains', arrange: 'chains', nextlink: 'chains', recital: 'chains', stats: 'stats', data: 'data' };
      var on = navMap[App.route.v];
      document.querySelectorAll('[data-nav]').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-nav') === on);
      });
      renderSidebar();
    },

    // let other modules (chain link cards) check browse-reveal state
    isRev: function (k) { return !!REV[k]; },
    getTyped: function (k) { return TYPED[k] || ''; },
    setTyped: function (k, v) { TYPED[k] = v; },

    startSession: function (keys, origin, label) {
      if (!keys.length) { FX.toast('Nothing to study there yet.', ''); return; }
      App.sess = {
        q: keys.slice(0, 200), i: 0, revealed: false, typed: '', skipped: 0,
        got: 0, miss: 0, greens: 0, banked: 0, combo: 0, maxCombo: 0,
        origin: origin || { v: 'home' }, label: label || 'Review', done: false,
        prevHash: location.hash || '#/'
      };
      App.go({ v: 'session' });
    },

    milestone: function (key) {
      var m = Store.data().meta;
      m.milestones = m.milestones || [];
      if (m.milestones.indexOf(key) >= 0) return false;
      m.milestones.push(key);
      Store.save();
      return true;
    },

    // Celebration checks after a grade lands.
    checkCompletions: function (key) {
      var ctx = Store.resolveFacet(key);
      if (!ctx) return;
      if (ctx.kind === 'item') {
        var grp = ctx.card.group || null;
        if (grp) {
          var grpDone = groupFacetKeys(ctx.subject, ctx.tab, grp).every(Store.isVerified);
          if (grpDone && App.milestone('done:grp:' + ctx.tab.id + ':' + grp)) {
            FX.banner('⚓', 'Section anchored', grp);
          }
        }
        var tabDone = tabFacetKeys(ctx.subject, ctx.tab).every(Store.isVerified);
        if (tabDone && App.milestone('done:tab:' + ctx.tab.id)) {
          FX.confetti();
          FX.banner('🏆', ctx.tab.name + ' — fully anchored', 'Every card verified by recall');
        }
        var subjDone = ctx.subject.tabs.every(function (t) {
          return tabFacetKeys(ctx.subject, t).every(Store.isVerified);
        });
        if (subjDone && App.milestone('done:subj:' + ctx.subject.id)) {
          FX.confetti(); setTimeout(FX.confetti, 400);
          FX.banner('👑', ctx.subject.name + ' — 100% anchored', 'The whole syllabus, verified. Extraordinary.');
        }
      } else if (ctx.kind === 'link' || ctx.kind === 'order') {
        App.checkChainForged(ctx.chain);
      }
    },

    checkChainForged: function (ch) {
      if (window.chainForged(ch) && App.milestone('done:chain:' + ch.id)) {
        FX.confetti();
        FX.banner('⛓️', 'Chain forged', ch.title);
      }
    },

    afterGradeCommon: function (res) {
      App.renderTop();
      if (res.goalJustHit) {
        FX.toast('Daily goal hit 🎯 — the streak holds.', 'green');
        var st = Store.streak();
        if ([3, 7, 14, 30, 50, 100].indexOf(st) >= 0 && App.milestone('streak:' + st)) {
          FX.banner('🔥', st + '-day streak', 'Real reviews, every day. That is how memory is built.');
        }
      }
    }
  };

  /* ─── Facet helpers ──────────────────────────────────────────────────── */
  /* ─── Facet helpers ──────────────────────────────────────────────────── */
  function cardFacetKeys(subj, card) {
    return Store.cardModes(subj).filter(function (m) { return Store.facetText(card, m); })
      .map(function (m) { return 'f:' + card.id + ':' + m; });
  }
  function tabFacetKeys(subj, tab) {
    var out = [];
    tab.cards.forEach(function (c) { out.push.apply(out, cardFacetKeys(subj, c)); });
    return out;
  }
  function groupFacetKeys(subj, tab, grp) {
    var out = [];
    tab.cards.forEach(function (c) {
      if ((c.group || null) !== grp) return;
      out.push.apply(out, cardFacetKeys(subj, c));
    });
    return out;
  }


  /* ─── Back / forward ─────────────────────────────────────────────────── */
  function onPop() {
    var h = location.hash || '#/';
    if (toHash(App.route) === h) return;                   // our own pushState, already rendered
    SCROLL[toHash(App.route)] = window.scrollY;
    var r = parseHash(h);
    if (r.v === 'session' && !App.sess) { App.go({ v: 'home' }, { replace: true }); return; }
    if (App.route.v === 'session' && r.v !== 'session') App.sess = null;
    App.route = r;
    REV = {}; TYPED = {};
    Modal.close(); Menu.close();
    App.render();
    window.scrollTo(0, SCROLL[h] || 0);
  }
  window.addEventListener('popstate', onPop);
  window.addEventListener('hashchange', onPop);

  /* ─── Subject roll-ups (shared by home, sidebar and boards) ───────────── */
  function subjTally(subj) {
    var t = { n: 0, v: 0, a: 0, r: 0 };
    Store.subjectFacets(subj).forEach(function (f) {
      var st = Store.data().state[f.key];
      t.n++;
      if (Store.isVerified(f.key)) t.v++;
      else if (st && (st.conf === 'a' || st.conf === 'g')) t.a++;
      else if (st && st.conf === 'r') t.r++;
    });
    t.pct = U.pct(t.v, t.n);
    return t;
  }
  function dueCounts() {
    var out = { total: 0, chains: 0, subj: {} };
    Store.dueFacets().forEach(function (d) {
      out.total++;
      if (d.ctx.kind === 'item') out.subj[d.ctx.subject.id] = (out.subj[d.ctx.subject.id] || 0) + 1;
      else out.chains++;
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     SHELL · sidebar library (desktop)
     ════════════════════════════════════════════════════════════════════ */
  function renderSidebar() {
    var lib = document.getElementById('sbLib');
    if (!lib) return;
    var D = Store.data(), r = App.route;
    var due = dueCounts();
    var hb = document.getElementById('navDueHome'), cb = document.getElementById('navDueChains');
    var subjDue = due.total - due.chains;
    if (hb) { hb.textContent = subjDue || ''; hb.hidden = !subjDue; }
    if (cb) { cb.textContent = due.chains || ''; cb.hidden = !due.chains; }

    var curSubj = r.v === 'subject' ? r.id : null;
    var curEssay = r.v === 'essay' ? r.id : null;
    if (!curEssay && (r.v === 'chain' || r.v === 'arrange' || r.v === 'nextlink' || r.v === 'recital')) {
      var ch = Store.chainById(r.id);
      if (ch) curEssay = ch.essayId;
    }

    function subjLink(s) {
      return '<a class="sb-item' + (s.id === curSubj ? ' on' : '') + '" href="#/subject/' + encodeURIComponent(s.id) + '">'
        + U.icon('book') + '<span class="sb-t">' + U.esc(s.name) + '</span>'
        + (due.subj[s.id] ? '<span class="sb-due">' + due.subj[s.id] + '</span>' : '') + '</a>';
    }
    function essayLink(e) {
      return '<a class="sb-item' + (e.id === curEssay ? ' on' : '') + '" href="#/essay/' + encodeURIComponent(e.id) + '">'
        + U.icon('doc') + '<span class="sb-t">' + U.esc(e.title) + '</span></a>';
    }
    function tree(space, items, linkFn, kind) {
      var html = '';
      foldersIn(space).forEach(function (f) {
        var kids = items.filter(function (x) { return x.folderId === f.id; });
        var closed = Prefs.collapsed('sb:' + f.id);
        html += '<div class="sb-folder' + (closed ? ' closed' : '') + '" data-drop="' + kind + '" data-folder="' + f.id + '">'
          + '<button class="sb-item sb-fold" data-a="sb-toggle" data-id="' + f.id + '">' + U.icon('chevD', 'chev') + U.icon('folder')
          + '<span class="sb-t">' + U.esc(f.name) + '</span><span class="sb-n">' + kids.length + '</span></button>'
          + '<div class="sb-kids">' + kids.map(linkFn).join('') + '</div></div>';
      });
      items.filter(function (x) { return !validFolder(x.folderId, space); }).forEach(function (x) { html += linkFn(x); });
      return html;
    }

    lib.innerHTML = '<div class="sb-h"><span>Subjects</span><button class="sb-add" data-a="subject-new" title="New subject">' + U.icon('plus') + '</button></div>'
      + (D.subjects.length ? tree('subjects', D.subjects, subjLink, 'subject') : '<div class="sb-none">No subjects yet</div>')
      + '<div class="sb-h"><span>Essays</span><button class="sb-add" data-a="essay-new" title="New essay">' + U.icon('plus') + '</button></div>'
      + (D.essays.length ? tree('chains', D.essays, essayLink, 'essay') : '<div class="sb-none">No essays yet</div>');
  }
  ACTIONS['sb-toggle'] = function (el) { Prefs.toggle('sb:' + el.getAttribute('data-id')); renderSidebar(); };

  /* ══════════════════════════════════════════════════════════════════════
     HOME / HARBOUR — today, then your library of folders + subjects
     ════════════════════════════════════════════════════════════════════ */
  function viewHome() {
    var D = Store.data();
    if (!D.subjects.length && !D.chains.length && !D.essays.length && !D.folders.length) return viewWelcome();

    var due = dueCounts();
    var tallies = {}, total = 0, verified = 0;
    D.subjects.forEach(function (s) {
      var t = tallies[s.id] = subjTally(s);
      total += t.n; verified += t.v;
    });
    var set = D.settings, act = Store.todayActivity(), goal = Math.max(1, set.dailyGoal);
    var streak = Store.streak();
    var hr = new Date().getHours();
    var hello = hr < 5 ? 'Late one' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';

    var html = '<div class="page-head"><div>'
      + '<div class="eyebrow">' + new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) + '</div>'
      + '<h1>' + hello + '</h1>'
      + '<div class="ph-sub"><b>' + verified + '</b> of ' + total + ' cards anchored across ' + U.plural(D.subjects.length, 'subject') + '.</div></div>'
      + '<div class="ph-actions">'
      + '<button class="btn" data-a="import">' + U.icon('upload') + '<span class="hide-sm">Import</span></button>'
      + '<button class="btn" data-a="folder-new" data-space="subjects">' + U.icon('folderPlus') + 'Folder</button>'
      + '<button class="btn primary" data-a="subject-new">' + U.icon('plus') + 'Subject</button></div></div>';

    // Today strip
    var gFrac = Math.min(1, act.n / goal);
    var exams = D.subjects.filter(function (s) { var d = U.daysUntil(s.examDate); return d !== null && d >= 0; })
      .sort(function (a, b) { return a.examDate < b.examDate ? -1 : 1; });
    html += '<div class="today">'
      + '<div class="tile hero' + (due.total ? ' hot' : '') + '"><div class="t-lbl">' + U.icon('bell', 'sm') + 'Ready to strengthen</div>'
      + '<div class="t-big">' + due.total + '</div>'
      + '<div class="t-sub">' + (due.total ? 'anchored ' + (due.total === 1 ? 'memory has' : 'memories have') + ' drifted to your ' + Math.round(set.retention * 100) + '% line'
        : 'Harbour’s calm — every anchor is holding.') + '</div>'
      + (due.total ? '<button class="btn primary" data-a="review-all">' + U.icon('play') + 'Review all</button>' : '') + '</div>'
      + '<div class="tile"><div class="t-lbl">' + U.icon('target', 'sm') + 'Today</div>'
      + '<div class="t-row"><svg viewBox="0 0 36 36" class="t-ring"><circle cx="18" cy="18" r="15" class="gr-track"/>'
      + '<circle cx="18" cy="18" r="15" class="gr-fill" style="stroke-dashoffset:' + (94.2 * (1 - gFrac)).toFixed(1) + (act.n >= goal ? ';stroke:var(--green)' : '') + '"/></svg>'
      + '<div><div class="t-mid">' + act.n + '<span>/' + goal + '</span></div><div class="t-sub">reviews today</div></div></div></div>'
      + '<div class="tile"><div class="t-lbl">🔥 Streak</div><div class="t-mid">' + streak + '<span> ' + (streak === 1 ? 'day' : 'days') + '</span></div>'
      + '<div class="t-sub">' + (streak ? 'hit ' + Math.min(10, goal) + '+ reviews again today to keep it' : 'do ' + Math.min(10, goal) + ' reviews to start one') + '</div></div>'
      + '<div class="tile"><div class="t-lbl">' + U.icon('book', 'sm') + 'Next exam</div>'
      + (exams.length
        ? '<div class="t-mid">' + U.daysUntil(exams[0].examDate) + '<span> days</span></div><div class="t-sub">' + U.esc(exams[0].name) + ' · ' + U.fmtDate(exams[0].examDate) + '</div>'
        : '<div class="t-sub" style="margin-top:8px">No upcoming exam dates. <a href="#/settings">Set them</a> to compress the schedule as the day nears.</div>')
      + '</div></div>';

    // Library — folders of subjects
    var folders = foldersIn('subjects');
    function subjGrid(fid) {
      var list = D.subjects.filter(function (s) { return (validFolder(s.folderId, 'subjects') ? s.folderId : '') === fid; });
      return { n: list.length, html: '<div class="sgrid" data-sort-list="subject" data-folder="' + fid + '" data-axis="grid">'
        + list.map(function (s) { return subjCard(s, tallies[s.id], due.subj[s.id] || 0); }).join('') + '</div>' };
    }
    html += '<div class="sec-title"><span>Subjects</span><span class="muted hide-sm">— drag to reorder or into folders</span></div>';
    if (folders.length) {
      html += '<div class="fsecs" data-sort-list="sfolder" data-axis="y">';
      folders.forEach(function (f) {
        var g = subjGrid(f.id);
        html += U.folderSec(f, 'sfolder', 'subject', g.html, g.n, 'Empty folder — drag subjects in here, or use ⋯ → Move to folder.');
      });
      html += '</div>';
    }
    var loose = subjGrid('');
    html += '<section class="fsec loose">'
      + (folders.length ? '<div class="fsec-head plain" data-drop="subject" data-folder=""><span class="fsec-name">Not in a folder</span><span class="fsec-count">' + loose.n + '</span></div>' : '')
      + '<div class="fsec-body">' + loose.html
      + '<button class="add-tile" data-a="subject-new">' + U.icon('plus') + 'New subject</button></div></section>';

    // Chains snapshot
    var ct = ChainUI.tally(D.chains);
    html += '<div class="sec-title"><span>Essays &amp; chains</span><a class="sec-link" href="#/chains">Open chains' + U.icon('chevR', 'sm') + '</a></div>';
    html += '<div class="chain-snap"><div class="cs-main"><div class="cs-ic">' + U.icon('chain') + '</div><div>'
      + '<div class="cs-t">' + U.plural(D.essays.length, 'essay') + ' · ' + U.plural(D.chains.length, 'chain') + '</div>'
      + '<div class="cs-s">' + ct.v + '/' + ct.n + ' links anchored' + (due.chains ? ' · <span class="due-t">' + due.chains + ' fading</span>' : '') + '</div></div>'
      + (due.chains ? '<button class="btn" data-a="chains-review">Review ' + due.chains + '</button>' : '') + '</div>';
    if (D.essays.length) {
      html += '<div class="cs-list">' + D.essays.slice(0, 8).map(function (e) {
        var t = ChainUI.tally(window.essayChains(e));
        return '<a class="cs-chip" href="#/essay/' + encodeURIComponent(e.id) + '">' + U.icon('doc', 'sm') + '<span>' + U.esc(e.title) + '</span>'
          + '<em>' + U.pct(t.v, t.n) + '%</em></a>';
      }).join('') + (D.essays.length > 8 ? '<a class="cs-chip more" href="#/chains">+' + (D.essays.length - 8) + ' more</a>' : '') + '</div>';
    }
    html += '</div>';
    return html;
  }

  function subjCard(s, t, dueN) {
    var exam = U.daysUntil(s.examDate);
    var linked = Store.data().essays.filter(function (e) { return e.subjectId === s.id; }).length;
    return '<div class="scard" data-sort="subject" data-id="' + s.id + '" data-a="subject" role="button" tabindex="0">'
      + U.grip()
      + U.ring(t.pct, 54)
      + '<div class="sc-body"><div class="sc-name">' + U.esc(s.name) + '</div>'
      + (s.tagline ? '<div class="sc-tag">' + U.esc(s.tagline) + '</div>' : '')
      + '<div class="sc-meta">'
      + (dueN ? '<span class="pill due">' + dueN + ' due</span>' : '')
      + '<span class="pill">' + U.plural(t.n, 'card') + '</span>'
      + (linked ? '<span class="pill">' + U.plural(linked, 'essay') + '</span>' : '')
      + (exam !== null && exam >= 0 ? '<span class="pill exam">' + (exam > 0 ? exam + 'd to exam' : 'exam day') + '</span>' : '')
      + '</div>'
      + U.segbar([[t.v, 'var(--green)'], [t.a, 'var(--amber)'], [t.r, 'var(--red)']], t.n)
      + '</div>'
      + '<button class="kebab" data-a="subject-menu" data-id="' + s.id + '" title="Subject options">' + U.icon('dots') + '</button>'
      + '</div>';
  }

  function viewWelcome() {
    return '<div class="welcome">'
      + '<svg class="brand-mark big" viewBox="0 0 48 48" aria-hidden="true"><use href="#anchor-mark"/></svg>'
      + '<div class="w-title">Memory that <em>holds</em>.</div>'
      + '<div class="w-sub">A self-directed memorisation system for high-stakes exams — built on the two study techniques with the strongest evidence in cognitive science, and honest enough to show you what you’d actually recall today.</div>'
      + '<div class="w-actions">'
      + '<button class="btn primary big" data-a="seed-load">Load Business Studies (HSC)</button>'
      + '<button class="btn big" data-a="subject-new">Start fresh</button></div>'
      + '<div class="w-alt"><button class="linklike" data-a="import">…or import a subject file from a mate</button></div>'
      + '<div class="w-points">'
      + '<div class="w-point"><b>🧠 Retrieval, not re-reading</b><span>Reveal-and-grade turns every glance into practice testing — the #1 rated technique.</span></div>'
      + '<div class="w-point"><b>📉 A real forgetting curve</b><span>FSRS-6 — the algorithm behind modern Anki — runs locally and knows when each fact will fade.</span></div>'
      + '<div class="w-point"><b>🟢 Green you can trust</b><span>A card is only anchored after three successful recalls — and it fades if you don’t come back.</span></div>'
      + '<div class="w-point"><b>⛓️ Essays as chains</b><span>One keyword per sentence. Master the order, then the links, then recite the lot.</span></div>'
      + '</div></div>';
  }

  ACTIONS['home'] = function () { App.go({ v: 'home' }); };
  ACTIONS['chains'] = function () { App.go({ v: 'chains' }); };
  ACTIONS['stats'] = function () { App.go({ v: 'stats' }); };
  ACTIONS['stats-subj'] = function (el) {
    var s = el.getAttribute('data-s');
    App.go(s ? { v: 'stats', s: s } : { v: 'stats' }, { replace: true });
  };
  ACTIONS['data'] = function () { App.go({ v: 'data' }); };
  ACTIONS['subject'] = function (el) { App.go({ v: 'subject', id: el.getAttribute('data-id') }); };
  ACTIONS['seed-load'] = function () {
    var subj = Store.loadSeed();
    if (subj) {
      FX.toast('Business Studies loaded — 12 tabs, 255 cards ⚓', 'green');
      App.go({ v: 'subject', id: subj.id });
    }
  };
  ACTIONS['review-all'] = function () {
    App.startSession(Store.dueFacets().map(function (d) { return d.key; }), { v: 'home' }, 'All subjects');
  };
  ACTIONS['theme'] = function () {
    var s = Store.data().settings;
    s.theme = s.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', s.theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', s.theme === 'dark' ? '#0b0f17' : '#f3f5f9');
    Store.save();
  };
  ACTIONS['subject-menu'] = function (el) {
    var id = el.getAttribute('data-id'), a = ' data-id="' + id + '"';
    Menu.open(el, Menu.item('subject', 'Open', 'book', a)
      + Menu.item('board-add', 'Add cards', 'plus', a)
      + Menu.item('subject-edit', 'Edit subject', 'edit', a)
      + Menu.item('move', 'Move to folder…', 'move', a + ' data-kind="subject"')
      + Menu.item('essay-new', 'New essay for this subject', 'doc', ' data-subj="' + id + '"')
      + Menu.item('share-subj', 'Share / export', 'share', a)
      + Menu.sep()
      + Menu.item('del-subj', 'Delete subject', 'trash', a, true));
  };

  /* ══════════════════════════════════════════════════════════════════════
     STUDY CARD — shared by subject boards and chain pages
     ════════════════════════════════════════════════════════════════════ */
  window.gradeRow = function (key) {
    return '<div class="after-row"><span class="grade-hint">Did you produce it?</span>'
      + '<button class="gbtn g1" data-a="grade" data-k="' + key + '" data-g="1">✗ Missed</button>'
      + '<button class="gbtn g2" data-a="grade" data-k="' + key + '" data-g="2">~ Shaky</button>'
      + '<button class="gbtn g3" data-a="grade" data-k="' + key + '" data-g="3">✓ Got it</button>'
      + '<button class="gbtn g4" data-a="grade" data-k="' + key + '" data-g="4">⚡ Instant</button>'
      + '<button class="hide-link" data-a="hide" data-k="' + key + '">Hide</button></div>';
  };

  // o: {key, st, num, sort, sortId, term (html), ctx, body (html), tools (html)}
  window.studyCard = function (o) {
    var key = o.key, st = o.st;
    var conf = st ? st.conf : null;
    var got = st ? st.got : 0;
    var hold = U.hold(key);
    var verified = Store.isVerified(key);
    var isDue = verified && hold && hold.due;
    var CRIT = Store.GREEN_CRITERION;

    var html = '<div class="item ' + U.stClass(key) + (isDue ? ' is-due' : '') + '" data-card="' + key + '" data-sort="' + o.sort + '" data-id="' + o.sortId + '" data-handle=".grip">';
    html += '<div class="cell cell-term"><div class="term-top">' + U.grip() + '<span class="num">' + o.num + '</span>'
      + (isDue ? '<span class="due-pill">' + U.icon('bell', 'xs') + 'Review due</span>' : '')
      + (verified ? '<span class="ok-pill">⚓ Anchored</span>' : (got > 0 ? '<span class="pill" title="Successful recalls — ' + CRIT + ' anchors it">' + Math.min(got, CRIT) + '/' + CRIT + ' recalls</span>' : ''))
      + '</div><div class="term">' + o.term + '</div>'
      + (o.ctx ? '<div class="ctx">' + U.esc(o.ctx) + '</div>' : '') + '</div>';

    html += '<div class="cell cell-content"><div class="tools">' + (o.tools || '') + '</div>' + o.body + '</div>';

    html += '<div class="cell cell-meta">'
      + '<div class="conf-btns" role="group" aria-label="Confidence">'
      + '<button class="cbtn g' + (conf === 'g' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="g"><span class="cdot"></span>Know it' + (conf === 'g' && !verified && got < CRIT ? '<span class="unv">' + got + '/' + CRIT + '</span>' : '') + '</button>'
      + '<button class="cbtn a' + (conf === 'a' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="a"><span class="cdot"></span>Getting there</button>'
      + '<button class="cbtn r' + (conf === 'r' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="r"><span class="cdot"></span>Not yet</button>'
      + '</div>';
    if (hold) {
      html += '<div class="hold"><div class="hold-line' + (isDue ? ' due' : '') + '">'
        + (isDue ? 'Due — recall now ~' + hold.pct + '%' : 'Memory ' + hold.pct + '% · ~' + (hold.S < 1 ? '&lt;1' : Math.round(hold.S)) + 'd stability')
        + '</div><div class="hold-bar"><div class="hold-fill" style="width:' + hold.pct + '%;background:' + U.holdColor(hold.r) + '"></div></div></div>';
    }
    var hist = st ? st.hist.slice(-8) : [];
    html += '<div class="meta-foot"><span class="last">' + (st && st.srs ? U.ago(st.srs.last) : 'never reviewed') + '</span>'
      + '<span class="hist-row">' + hist.map(function (h) { return '<span class="hdot ' + (h.g >= 3 ? 'g' : h.g === 2 ? 'a' : 'r') + '" title="' + U.fmtDate(h.t) + '"></span>'; }).join('') + '</span>'
      + (st && (st.got || st.miss) ? '<span class="hist-score"><span class="hs-g">✓' + st.got + '</span><span class="hs-r">✗' + st.miss + '</span></span>' : '')
      + '</div></div></div>';
    return html;
  };

  /* ══════════════════════════════════════════════════════════════════════
     SUBJECT BOARD (Mode A) — tabs across the top, cards below.
     ════════════════════════════════════════════════════════════════════ */
  function facetOf(subj) {
    return subj.dual ? (Prefs.get('facet:' + subj.id) === 'key' ? 'key' : 'def') : 'card';
  }
  function currentTab(subj) {
    return subj.tabs.filter(function (t) { return t.id === App.route.tab; })[0] || subj.tabs[0] || null;
  }
  function linkedTo(subj) {
    var D = Store.data();
    return {
      essays: D.essays.filter(function (e) { return e.subjectId === subj.id; }),
      chains: D.chains.filter(function (c) { return !c.essayId && c.subjectId === subj.id; })
    };
  }

  function viewSubject() {
    var subj = Store.subjectById(App.route.id);
    if (!subj) return '<div class="empty"><div class="empty-t">Subject not found</div><div class="empty-acts"><a class="btn" href="#/">Back to the Harbour</a></div></div>';
    var folder = validFolder(subj.folderId, 'subjects');
    var linked = linkedTo(subj);
    var nLinked = linked.essays.length + linked.chains.length;
    var showLinked = App.route.tab === '_chains' && nLinked;
    var tab = showLinked ? null : currentTab(subj);
    var facet = facetOf(subj);
    var t = subjTally(subj);
    var dueN = Store.dueFacets(subj.id).length;
    var exam = U.daysUntil(subj.examDate);

    var html = U.crumbs([['Harbour', '#/']].concat(folder ? [[folder.name, '#/']] : []).concat([[subj.name]]));
    html += '<div class="page-head"><div>'
      + '<div class="eyebrow">' + U.icon('book', 'sm') + 'Subject'
      + (exam !== null ? (exam > 0 ? ' · <b class="acc">' + exam + ' days to the exam</b>' : exam === 0 ? ' · <b class="warn-t">exam day — go get it</b>' : '') : ' · <button class="linklike" data-a="subject-edit" data-id="' + subj.id + '">set exam date</button>') + '</div>'
      + '<h1>' + U.esc(subj.name) + '</h1>'
      + (subj.tagline ? '<div class="ph-sub">' + U.esc(subj.tagline) + '</div>' : '') + '</div>'
      + '<div class="ph-actions">'
      + (dueN ? '<button class="btn due" data-a="review-subject" data-id="' + subj.id + '">' + U.icon('bell') + 'Review ' + dueN + '</button>' : '')
      + '<button class="btn" data-a="board-add" data-id="' + subj.id + '">' + U.icon('plus') + 'Add cards</button>'
      + '<button class="kebab lg" data-a="subject-menu" data-id="' + subj.id + '" title="Subject options">' + U.icon('dots') + '</button></div></div>';

    if (t.n) {
      html += '<div class="progress-strip">' + U.segbar([[t.v, 'var(--green)'], [t.a, 'var(--amber)'], [t.r, 'var(--red)']], t.n)
        + '<div class="ps-legend"><span><i style="background:var(--green)"></i><b>' + t.v + '</b> anchored</span>'
        + '<span><i style="background:var(--amber)"></i><b>' + t.a + '</b> getting there</span>'
        + '<span><i style="background:var(--red)"></i><b>' + t.r + '</b> not yet</span>'
        + '<span><i style="background:var(--line2)"></i><b>' + (t.n - t.v - t.a - t.r) + '</b> new</span>'
        + '<span class="ps-pct">' + t.pct + '% anchored</span></div></div>';
    }

    if (!subj.tabs.length && !nLinked) {
      return html + '<div class="empty"><div class="empty-ic">' + U.icon('book') + '</div><div class="empty-t">An empty board</div>'
        + 'Make a tab for each area of the syllabus (e.g. “Finance — Role”), then fill it with cards.'
        + '<div class="empty-acts"><button class="btn primary" data-a="board-add" data-id="' + subj.id + '">Add your first cards</button>'
        + '<button class="btn" data-a="essay-new" data-subj="' + subj.id + '">Start an essay</button></div></div>';
    }

    // Tab bar — drag tabs to reorder
    html += '<div class="tabbar"><div class="tabs" data-sort-list="tab" data-axis="grid">';
    subj.tabs.forEach(function (tb) {
      var keys = tabFacetKeys(subj, tb);
      var v = keys.filter(Store.isVerified).length;
      html += '<button class="tabp' + (tb === tab ? ' on' : '') + '" data-sort="tab" data-id="' + tb.id + '" data-a="board-tab" data-t="' + tb.id + '">'
        + '<span>' + U.esc(tb.name) + '</span><span class="tabp-fill" style="width:' + U.pct(v, keys.length) + '%"></span></button>';
    });
    html += '</div><div class="tabs-extra">'
      + (nLinked ? '<button class="tabp linked' + (showLinked ? ' on' : '') + '" data-a="board-tab" data-t="_chains">' + U.icon('chain', 'sm') + 'Essays &amp; chains <em>' + nLinked + '</em></button>' : '')
      + '<button class="tabp add" data-a="tab-new" title="New tab">' + U.icon('plus', 'sm') + 'Tab</button></div></div>';

    if (showLinked) {
      html += '<div class="board-bar"><div><h2>Essays &amp; chains</h2><div class="bb-sub">Linked to ' + U.esc(subj.name) + ' — manage them in Chains</div></div>'
        + '<div class="bb-acts"><button class="btn sm" data-a="essay-new" data-subj="' + subj.id + '">' + U.icon('plus') + 'Essay</button></div></div>';
      html += '<div class="cgrid">' + linked.essays.map(ChainUI.essayCard).join('') + linked.chains.map(ChainUI.chainCard).join('') + '</div>';
      return html;
    }
    if (!tab) {
      return html + '<div class="empty"><div class="empty-t">No tabs yet</div><div class="empty-acts"><button class="btn primary" data-a="tab-new">Create a tab</button></div></div>';
    }

    // Board bar — the current tab + how to study it
    var tKeys = tabFacetKeys(subj, tab);
    var tV = tKeys.filter(Store.isVerified).length;
    html += '<div class="board-bar"><div><h2>' + U.esc(tab.name) + '</h2>'
      + '<div class="bb-sub">' + tab.cards.length + ' cards · <b class="ok">' + tV + '/' + tKeys.length + '</b> anchored</div></div>'
      + '<div class="bb-acts">'
      + (subj.dual ? '<div class="seg" role="group" aria-label="Card side">'
        + '<button class="seg-o' + (facet === 'def' ? ' on' : '') + '" data-a="board-facet" data-f="def">Definitions</button>'
        + '<button class="seg-o' + (facet === 'key' ? ' on' : '') + '" data-a="board-facet" data-f="key">Key facts</button></div>' : '')
      + window.studyModeToggle()
      + '<button class="btn sm primary" data-a="study-tab">' + U.icon('play') + 'Study tab</button>'
      + '<button class="kebab" data-a="tab-menu" data-id="' + subj.id + '" data-t="' + tab.id + '" title="Tab options">' + U.icon('dots') + '</button>'
      + '</div></div>';

    // Cards, clustered under their (optional) group headings
    var runs = [], cur = null;
    tab.cards.forEach(function (card) {
      if (!Store.facetText(card, facet)) return;
      var g = card.group || '';
      if (!cur || cur.g !== g) { cur = { g: g, cards: [] }; runs.push(cur); }
      cur.cards.push(card);
    });
    var anyGroup = runs.some(function (r) { return r.g; });
    var num = 1;
    runs.forEach(function (run) {
      var gKeys = run.cards.map(function (c) { return 'f:' + c.id + ':' + facet; });
      var gDone = gKeys.every(Store.isVerified);
      html += '<div class="grp">';
      if (run.g || anyGroup) {
        html += '<div class="grp-head"><span class="grp-name">' + (run.g ? U.esc(run.g) : 'Ungrouped') + '</span>'
          + '<span class="shp">' + gKeys.map(function (k) {
            var st = Store.data().state[k];
            var cls = !st || !st.conf ? '' : st.conf === 'g' ? (Store.isVerified(k) ? 'g' : 'gu') : st.conf === 'a' ? 'a' : 'r';
            return '<i class="' + cls + '"></i>';
          }).join('') + '</span>'
          + (gDone ? '<span class="sec-badge">⚓ anchored</span>' : '')
          + '<button class="btn xs" title="Study just this group" data-a="drill-group" data-id="' + subj.id + '" data-t="' + tab.id + '" data-g="' + U.esc(run.g) + '">' + U.icon('play') + 'Drill</button>'
          + '</div>';
      }
      html += '<div class="cards" data-sort-list="card" data-group="' + U.esc(run.g) + '" data-axis="y">';
      run.cards.forEach(function (card) { html += itemCard(subj, tab, card, facet, num++); });
      html += '</div></div>';
    });
    if (num === 1) html += '<div class="empty"><div class="empty-t">No cards in this tab yet</div><div class="empty-acts"><button class="btn primary" data-a="board-add" data-id="' + subj.id + '">Add cards</button></div></div>';

    html += '<div class="board-foot"><button class="btn" data-a="board-add" data-id="' + subj.id + '">' + U.icon('plus') + 'Add cards to ' + U.esc(tab.name) + '</button>'
      + '<span class="muted">Drag ⋮⋮ to reorder cards — drop a card under another heading to regroup it.</span></div>';
    return html;
  }

  function itemCard(subj, tab, card, facet, num) {
    var key = 'f:' + card.id + ':' + facet;
    var st = Store.data().state[key];
    var body;
    if (!REV[key]) {
      if (window.textMode()) body = window.typeZoneHTML(key);
      else {
        var revLbl = facet === 'def' ? 'definition' : facet === 'key' ? 'key facts' : 'answer';
        body = '<button class="hidden-panel" data-a="reveal" data-k="' + key + '">' + U.icon('chevR', 'sm') + 'Reveal ' + revLbl + ' — say it or write it first</button>';
      }
    } else {
      body = (window.textMode() ? window.producedHTML(key) : '')
        + '<div class="c-text">' + U.esc(Store.facetText(card, facet)) + '</div>'
        + (card.note ? '<div class="note-box"><span class="note-lbl">Note</span><span>' + U.esc(card.note) + '</span></div>' : '')
        + window.gradeRow(key);
    }
    return window.studyCard({
      key: key, st: st, num: num, sort: 'card', sortId: card.id,
      term: U.esc(card.term), body: body,
      tools: '<button class="tool" title="Edit this card" data-a="card-edit" data-id="' + card.id + '" data-subj="' + subj.id + '">' + U.icon('edit') + '</button>'
    });
  }

  Sortable.on('tab', function (info) {
    var subj = Store.subjectById(App.route.id);
    if (subj && info.list) Store.reorderIn(subj.tabs, info.ids);
    App.render();
  });
  Sortable.on('card', function (info) {
    var subj = Store.subjectById(App.route.id);
    var tab = subj && currentTab(subj);
    if (!tab || !info.list) { App.render(); return; }
    var card = tab.cards.filter(function (c) { return c.id === info.id; })[0];
    if (card) {
      var g = info.list.getAttribute('data-group') || '';
      if (g) card.group = g; else delete card.group;
    }
    var ids = Array.prototype.map.call(document.querySelectorAll('#view [data-sort="card"]'), function (el) { return el.getAttribute('data-id'); });
    Store.reorderIn(tab.cards, ids);
    Store.save();
    App.render();
  });

  ACTIONS['board-tab'] = function (el) {
    App.go({ v: 'subject', id: App.route.id, tab: el.getAttribute('data-t') }, { replace: true });
  };
  ACTIONS['board-facet'] = function (el) {
    Prefs.set('facet:' + App.route.id, el.getAttribute('data-f'));
    REV = {};
    App.render();
  };
  ACTIONS['reveal'] = function (el) {
    var k = el.getAttribute('data-k');
    if (el.getAttribute('data-skip')) TYPED[k] = '';   // "just show me" — skip the comparison
    REV[k] = true;
    App.render();
  };
  ACTIONS['hide'] = function (el) { REV[el.getAttribute('data-k')] = false; App.render(); };

  ACTIONS['conf'] = function (el) {
    var k = el.getAttribute('data-k'), c = el.getAttribute('data-c');
    var res = Store.setConf(k, c);
    if (res === 'g' && !Store.isVerified(k)) {
      FX.toast('Tagged green — ' + Store.recallsToGo(k) + ' successful recall' + (Store.recallsToGo(k) > 1 ? 's' : '') + ' to anchor it ⚓', '', 3000);
    }
    App.render();
  };

  ACTIONS['grade'] = function (el) {
    var k = el.getAttribute('data-k'), g = +el.getAttribute('data-g');
    var res = Store.applyGrade(k, g);
    var card = document.querySelector('[data-card="' + k + '"]');
    if (res.wentGreen) FX.green(card);
    else if (g >= 3) {
      FX.burstOn(el, 7);
      if (res.toGo === 1) FX.toast('One more successful recall to anchor it ⚓', '', 2200);
    }
    REV[k] = false;
    TYPED[k] = '';
    App.afterGradeCommon(res);
    setTimeout(function () { App.render(); App.checkCompletions(k); }, res.wentGreen ? 420 : 60);
  };

  ACTIONS['review-subject'] = function (el) {
    var id = el.getAttribute('data-id');
    var subj = Store.subjectById(id);
    var due = Store.dueFacets(id).map(function (d) { return d.key; });
    if (!due.length) {
      FX.toast('Nothing due in ' + U.esc(subj.name) + ' — your anchored cards are all holding above ' + Math.round(Store.data().settings.retention * 100) + '%.', 'green');
      return;
    }
    App.startSession(due, { v: 'subject', id: id, tab: App.route.tab }, subj.name + ' · review');
  };

  // Study the whole tab: unanchored cards first (in board order), then the weakest anchored ones.
  ACTIONS['study-tab'] = function () {
    var subj = Store.subjectById(App.route.id);
    var tab = subj && currentTab(subj);
    if (!tab) return;
    var keys = tabFacetKeys(subj, tab).filter(function (k) { return k.split(':')[2] === facetOf(subj) || !subj.dual; });
    var todo = keys.filter(function (k) { return !Store.isVerified(k); });
    var held = keys.filter(Store.isVerified).sort(function (a, b) { return U.hold(a).r - U.hold(b).r; });
    App.startSession(todo.concat(held), { v: 'subject', id: subj.id, tab: tab.id }, tab.name);
  };

  ACTIONS['tab-menu'] = function (el) {
    var a = ' data-id="' + el.getAttribute('data-id') + '" data-t="' + el.getAttribute('data-t') + '"';
    Menu.open(el, Menu.item('tab-edit', 'Rename tab', 'edit', a)
      + Menu.item('board-add', 'Add cards', 'plus', ' data-id="' + el.getAttribute('data-id') + '"')
      + Menu.sep()
      + Menu.item('tab-del', 'Delete tab', 'trash', a, true));
  };
  ACTIONS['tab-new'] = function () {
    Modal.open('<div class="m-title">New tab</div>'
      + '<div class="m-sub">One tab per area of the syllabus — e.g. “Finance — Role”.</div>'
      + '<div class="m-row"><input class="m-input" id="mTabName" maxlength="80" placeholder="Tab name"></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="tab-new-ok">Create tab</button></div>',
      function (root) { enterSubmits(root, 'tab-new-ok'); });
  };
  ACTIONS['tab-new-ok'] = function () {
    var subj = Store.subjectById(App.route.id);
    var name = document.getElementById('mTabName').value.trim();
    if (!subj || !name) { FX.toast('Give the tab a name.', 'amber'); return; }
    var tab = Store.addTab(subj, name);
    Modal.close();
    App.go({ v: 'subject', id: subj.id, tab: tab.id }, { replace: true });
  };
  ACTIONS['tab-edit'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var tab = subj.tabs.filter(function (t) { return t.id === el.getAttribute('data-t'); })[0];
    if (!tab) return;
    Modal.open('<div class="m-title">Rename tab</div>'
      + '<div class="m-row"><label class="m-lbl">Tab name</label><input class="m-input" id="mTabName" value="' + U.esc(tab.name) + '"></div>'
      + '<div class="m-hint">Deleting a tab removes its ' + tab.cards.length + ' cards and their study history.</div>'
      + '<div class="m-actions"><button class="btn warn" data-a="tab-del" data-id="' + subj.id + '" data-t="' + tab.id + '" style="margin-right:auto">Delete tab</button>'
      + '<button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="tab-edit-ok" data-id="' + subj.id + '" data-t="' + tab.id + '">Save</button></div>',
      function (root) { enterSubmits(root, 'tab-edit-ok'); });
  };
  ACTIONS['tab-edit-ok'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var tab = subj.tabs.filter(function (t) { return t.id === el.getAttribute('data-t'); })[0];
    var name = document.getElementById('mTabName').value.trim();
    if (tab && name) { tab.name = name; Store.save(); }
    Modal.close();
    App.render();
  };
  ACTIONS['tab-del'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var tabId = el.getAttribute('data-t');
    var tab = subj.tabs.filter(function (t) { return t.id === tabId; })[0];
    if (!tab) return;
    Modal.confirm('Delete “' + tab.name + '”?', 'Its ' + tab.cards.length + ' cards and their study history will be permanently removed.', 'Delete tab', true, function () {
      Store.deleteTab(subj, tabId);
      App.go({ v: 'subject', id: subj.id }, { replace: true });
    });
  };

  ACTIONS['drill-group'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var tab = subj.tabs.filter(function (t) { return t.id === el.getAttribute('data-t'); })[0];
    if (!tab) return;
    var keys = groupFacetKeys(subj, tab, el.getAttribute('data-g') || null);
    keys.sort(function (a, b) {
      var ha = U.hold(a), hb = U.hold(b);
      return (ha ? ha.r : -1) - (hb ? hb.r : -1);
    });
    App.startSession(keys, { v: 'subject', id: subj.id, tab: tab.id }, el.getAttribute('data-g') || tab.name);
  };

  /* ══════════════════════════════════════════════════════════════════════
     SESSION PLAYER — the focus loop
     ════════════════════════════════════════════════════════════════════ */
  function sessFrontBack(key) {
    var ctx = Store.resolveFacet(key);
    if (!ctx) return null;
    if (ctx.kind === 'item') {
      return {
        ctx: ctx,
        crumbs: ctx.subject.name + ' · ' + ctx.tab.name + (ctx.card.group ? ' · ' + ctx.card.group : ''),
        tag: U.modeLabel(ctx.mode),
        front: ctx.card.term,
        back: Store.facetText(ctx.card, ctx.mode),
        note: ctx.card.note
      };
    }
    if (ctx.kind === 'link') {
      return {
        ctx: ctx,
        crumbs: 'Chain · ' + ctx.chain.title,
        tag: 'Link ' + (ctx.idx + 1) + '/' + ctx.chain.sentences.length,
        front: ctx.sent.kw,
        back: ctx.sent.text
      };
    }
    return null;
  }

  function viewSession() {
    var s = App.sess;
    if (!s) return '<div class="empty">No session running.</div>';
    var html = '<div class="session"><div class="sess-top">'
      + '<button class="sess-close" data-a="sess-exit" title="End session (Esc)">' + U.icon('x') + '</button>'
      + '<span class="sess-label">' + U.esc(s.label) + '</span>'
      + '<div class="pbar" style="flex:1"><div class="pbar-fill" style="width:' + U.pct(s.i, s.q.length) + '%"></div></div>'
      + '<span class="sess-count">' + Math.min(s.i + 1, s.q.length) + ' / ' + s.q.length + '</span>'
      + '<span class="combo' + (s.combo >= 3 ? ' hot' : '') + '" id="comboEl">' + (s.combo >= 2 ? '×' + s.combo + ' combo' : '') + '</span>'
      + '</div><div class="sess-body">';

    if (s.done) {
      html += sessSummary(s);
    } else {
      var fb = sessFrontBack(s.q[s.i]);
      if (!fb) { s.i++; setTimeout(App.render, 0); return '<div class="empty">…</div>'; }
      var typeFirst = Store.data().settings.typeFirst;
      html += '<div class="sess-card"><div class="sc-ctx">' + U.esc(fb.crumbs)
        + ' <span class="pill">' + U.esc(fb.tag) + '</span></div>'
        + '<div class="sc-term">' + U.esc(fb.front) + '</div>';

      if (!s.revealed) {
        html += '<div class="sess-mode">' + window.studyModeToggle() + '</div>';
        if (typeFirst) {
          html += '<textarea class="type-zone" id="sessTa" placeholder="Produce it from memory — type it, say it aloud, or scribble it on a whiteboard. Then reveal to check.">' + U.esc(s.typed) + '</textarea>'
            + '<div class="type-hint">Ctrl+Enter to reveal · typing, saying it aloud or working it on a mini-whiteboard all count — producing first is what makes it stick</div>'
            + '<div class="sess-actions"><button class="btn primary big" data-a="sess-reveal">Reveal &amp; check</button>'
            + '<button class="btn" data-a="sess-reveal" data-skip="1">Just show me</button>'
            + '<button class="btn" data-a="sess-skip" title="Move on without grading (S)">Skip →</button></div>';
        } else {
          html += '<div class="hidden-panel" data-a="sess-reveal" style="min-height:120px;font-size:16px">👁 Reveal — say it (or whiteboard it) from memory first</div>'
            + '<div style="margin-top:12px;text-align:right"><button class="hide-link" data-a="sess-skip">Skip this card (S) →</button></div>';
        }
      } else {
        html += '<div class="answer-block">';
        if (s.typed.trim()) html += '<div class="ab-lbl">What you produced</div><div class="your-answer">' + U.esc(s.typed) + '</div>';
        html += '<div class="ab-lbl acc">The answer</div><div class="real-answer">' + U.esc(fb.back) + '</div>'
          + (fb.note ? '<div class="note-box" style="margin-top:10px"><span class="note-lbl">Note</span><span>' + U.esc(fb.note) + '</span></div>' : '')
          + '<div class="grade-row">'
          + '<button class="gbtn g1" data-a="sess-grade" data-g="1">✗ Missed<kbd>1</kbd></button>'
          + '<button class="gbtn g2" data-a="sess-grade" data-g="2">~ Shaky<kbd>2</kbd></button>'
          + '<button class="gbtn g3" data-a="sess-grade" data-g="3">✓ Got it<kbd>3</kbd></button>'
          + '<button class="gbtn g4" data-a="sess-grade" data-g="4">⚡ Instant<kbd>4</kbd></button>'
          + '</div><div class="type-hint" style="margin-top:10px">Grade what you produced, not what you meant. <button class="hide-link" data-a="sess-skip" style="margin-left:6px">Skip without grading (S) →</button></div></div>';
      }
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  function sessSummary(s) {
    var attempts = s.got + s.miss;
    var acc = attempts ? U.pct(s.got, attempts) : 0;
    var icon = acc >= 90 ? '🏆' : acc >= 70 ? '⚓' : '💪';
    var title = acc >= 90 ? 'Outstanding.' : acc >= 70 ? 'Solid session.' : 'Honest work.';
    var sub = s.greens ? s.greens + ' new ' + (s.greens === 1 ? 'memory' : 'memories') + ' anchored — the board just got greener.'
      : 'Every rep counts double when it was hard. Come back when they fade.';
    return '<div class="sess-card"><div class="sess-summary">'
      + '<div class="ss-big">' + icon + '</div><div class="ss-title">' + title + '</div><div class="ss-sub">' + sub + '</div>'
      + '<div class="ss-grid">'
      + '<div class="ss-stat"><div class="n">' + attempts + '</div><div class="l">recalls</div></div>'
      + '<div class="ss-stat"><div class="n" style="color:' + (acc >= 70 ? 'var(--green)' : 'var(--amber)') + '">' + acc + '%</div><div class="l">accuracy</div></div>'
      + '<div class="ss-stat"><div class="n" style="color:var(--green)">+' + s.greens + '</div><div class="l">anchored</div></div>'
      + '<div class="ss-stat"><div class="n" style="color:var(--accent)">+' + Math.max(0, Math.round(s.banked)) + 'd</div><div class="l">memory banked</div></div>'
      + '<div class="ss-stat"><div class="n">×' + s.maxCombo + '</div><div class="l">best combo</div></div>'
      + ((s.skipped || 0) > 0 ? '<div class="ss-stat"><div class="n" style="color:var(--text3)">' + s.skipped + '</div><div class="l">skipped</div></div>' : '')
      + '</div>'
      + '<div class="m-actions" style="justify-content:center">'
      + '<button class="btn primary big" data-a="sess-exit">Done</button>'
      + '</div></div></div>';
  }

  ACTIONS['sess-reveal'] = function (el) {
    var s = App.sess;
    var ta = document.getElementById('sessTa');
    s.typed = el.getAttribute('data-skip') ? '' : (ta ? ta.value : '');
    s.revealed = true;
    App.render();
  };

  ACTIONS['sess-grade'] = function (el, ev) {
    var s = App.sess;
    var g = +el.getAttribute('data-g');
    var key = s.q[s.i];
    var stBefore = Store.data().state[key];
    var oldS = stBefore && stBefore.srs ? stBefore.srs.S : 0;
    var res = Store.applyGrade(key, g);
    s.banked += Math.max(0, res.srs.S - oldS);

    if (g >= 3) {
      s.got++;
      s.combo++;
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;
      if (el && el.getBoundingClientRect) FX.burstOn(el, res.wentGreen ? 16 : 7);
      if ([5, 10, 20, 40].indexOf(s.combo) >= 0) {
        FX.toast('Combo ×' + s.combo + ' 🔥', 'green', 1600);
        var c = document.getElementById('comboEl');
        if (c) { c.classList.add('pulse'); }
      }
    } else {
      s.miss++;
      s.combo = 0;
    }
    if (res.wentGreen) s.greens++;

    App.afterGradeCommon(res);
    App.checkCompletions(key);

    s.i++;
    s.revealed = false;
    s.typed = '';
    if (s.i >= s.q.length) {
      s.done = true;
      if (s.greens > 0 || (s.got + s.miss >= 5 && U.pct(s.got, s.got + s.miss) >= 80)) setTimeout(FX.confetti, 350);
    }
    App.render();
  };

  ACTIONS['sess-skip'] = function () {
    var s = App.sess;
    if (!s || s.done) return;
    s.skipped = (s.skipped || 0) + 1;
    s.i++;
    s.revealed = false;
    s.typed = '';
    if (s.i >= s.q.length) s.done = true;
    App.render();
  };

  ACTIONS['sess-exit'] = function () {
    var s = App.sess;
    var origin = s ? s.origin : { v: 'home' };
    App.sess = null;
    // Step back through history when the session was started from its origin,
    // so the back button doesn't bounce you into a finished session.
    if (s && s.prevHash === toHash(origin) && location.hash === '#/session') history.back();
    else App.go(origin, { replace: true });
  };

  /* ══════════════════════════════════════════════════════════════════════
     EDITORS — subjects, tabs, cards, bulk paste
     ════════════════════════════════════════════════════════════════════ */
  ACTIONS['subject-new'] = function (el) {
    var fid = (el && el.getAttribute && el.getAttribute('data-folder')) || '';
    Modal.open('<div class="m-title">New subject</div>'
      + '<div class="m-sub">A subject holds tabs (one per syllabus area), and tabs hold cards. That’s the whole structure.</div>'
      + '<div class="m-row"><label class="m-lbl">Name</label><input class="m-input" id="mName" placeholder="e.g. Legal Studies"></div>'
      + '<div class="m-row"><label class="m-lbl">Tagline (optional)</label><input class="m-input" id="mTag" placeholder="e.g. HSC · Crime · Human Rights"></div>'
      + '<div class="m-row"><label class="m-lbl">Card style</label><select class="m-select" id="mDual">'
      + '<option value="0">Simple flashcards — front / back (recommended)</option>'
      + '<option value="1">Dual — definition + key facts per term (Business-Studies style)</option>'
      + '</select></div>'
      + '<div class="m-row"><label class="m-lbl">Exam date (optional — powers the countdown &amp; schedule compression)</label><input class="m-input" type="date" id="mExam"></div>'
      + folderSelect('subjects', fid)
      + '<div class="m-actions"><button class="btn" data-a="import" style="margin-right:auto">' + U.icon('upload') + 'Import a file instead</button>'
      + '<button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="subject-new-ok">Create subject</button></div>');
  };
  ACTIONS['subject-new-ok'] = function () {
    var name = document.getElementById('mName').value.trim();
    if (!name) return;
    var subj = Store.addSubject(name, document.getElementById('mTag').value.trim(),
      document.getElementById('mExam').value || null, document.getElementById('mDual').value === '1');
    var fid = readFolderSelect();
    if (fid) { subj.folderId = fid; Store.save(); }
    Modal.close();
    FX.toast('Subject created ⚓', 'green');
    App.go({ v: 'subject', id: subj.id });
  };

  ACTIONS['subject-edit'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    Modal.open('<div class="m-title">Edit “' + U.esc(subj.name) + '”</div>'
      + '<div class="m-row"><label class="m-lbl">Name</label><input class="m-input" id="mName" value="' + U.esc(subj.name) + '"></div>'
      + '<div class="m-row"><label class="m-lbl">Tagline</label><input class="m-input" id="mTag" value="' + U.esc(subj.tagline || '') + '"></div>'
      + '<div class="m-row"><label class="m-lbl">Exam date</label><input class="m-input" type="date" id="mExam" value="' + (subj.examDate || '') + '"></div>'
      + '<div class="m-row"><label class="m-lbl">Card style</label><select class="m-select" id="mDual">'
      + '<option value="0"' + (subj.dual ? '' : ' selected') + '>Simple flashcards — front / back</option>'
      + '<option value="1"' + (subj.dual ? ' selected' : '') + '>Dual — definition + key facts</option>'
      + '</select><div class="m-hint">Switching style keeps your cards; scheduling continues per side that still exists.</div></div>'
      + folderSelect('subjects', subj.folderId)
      + '<div class="m-actions"><button class="btn warn" data-a="del-subj" data-id="' + subj.id + '" style="margin-right:auto">Delete</button>'
      + '<button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="subject-edit-ok" data-id="' + subj.id + '">Save</button></div>');
  };
  ACTIONS['subject-edit-ok'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var name = document.getElementById('mName').value.trim();
    if (name) subj.name = name;
    subj.tagline = document.getElementById('mTag').value.trim();
    subj.examDate = document.getElementById('mExam').value || null;
    subj.dual = document.getElementById('mDual').value === '1';
    var fid = readFolderSelect();
    if (fid !== undefined) subj.folderId = fid;
    Store.save();
    Modal.close();
    App.render();
  };

  // One simple Add flow: pick a tab (or make one), then add cards.
  // The modal stays open between single-card adds so you can rattle through
  // a whole section; ADDRUN tracks the streak.
  var ADDRUN = null;
  ACTIONS['board-add'] = function (el) {
    ADDRUN = { n: 0, tabId: null };
    var subj = Store.subjectById(el.getAttribute('data-id') || App.route.id);
    var tabOpts = subj.tabs.map(function (t) {
      var sel = (App.route.tab === t.id || (!App.route.tab && subj.tabs[0] === t)) ? ' selected' : '';
      return '<option value="' + t.id + '"' + sel + '>' + U.esc(t.name) + '</option>';
    }).join('') + '<option value="__new">＋ Create a new tab…</option>';
    var single = subj.dual
      ? '<div class="m-row"><label class="m-lbl">Term</label><input class="m-input" id="mTerm" placeholder="e.g. Outsourcing"></div>'
        + '<div class="m-row"><label class="m-lbl">Definition</label><textarea class="m-ta" id="mDef" style="min-height:64px"></textarea></div>'
        + '<div class="m-row"><label class="m-lbl">Key facts</label><textarea class="m-ta" id="mKey" style="min-height:64px"></textarea></div>'
      : '<div class="m-row"><label class="m-lbl">Front (the cue)</label><input class="m-input" id="mTerm" placeholder="e.g. What are the three levels of government?"></div>'
        + '<div class="m-row"><label class="m-lbl">Back (what you must recall)</label><textarea class="m-ta" id="mBack" style="min-height:80px"></textarea></div>';
    var bulkHint = subj.dual ? 'Term | definition | key facts' : 'Front | back';

    Modal.open('<div class="m-title">Add cards</div>'
      + '<div class="m-sub">Writing your own cards is the first study pass — the generation effect working for you.</div>'
      + '<div class="m-row"><label class="m-lbl">Into tab</label><select class="m-select" id="mTab">' + tabOpts + '</select>'
      + '<div class="m-row" id="mNewTabRow" style="display:none;margin-top:9px"><input class="m-input" id="mNewTab" placeholder="New tab name — e.g. Finance — Role"></div></div>'
      + '<div class="m-row"><label class="m-lbl">Group heading (optional — a small heading above these cards)</label><input class="m-input" id="mGroup" placeholder="e.g. Internal sources of finance"></div>'
      + '<div class="m-row"><label class="m-lbl">How many?</label><select class="m-select" id="mKind">'
      + '<option value="one">One card</option>'
      + '<option value="bulk">Bulk paste — one card per line</option>'
      + '</select></div>'
      + '<div id="mOne">' + single + '</div>'
      + '<div id="mBulk" style="display:none"><div class="m-row"><label class="m-lbl">One per line: <b>' + bulkHint + '</b></label>'
      + '<textarea class="m-ta" id="mLines" placeholder="' + bulkHint + '&#10;' + bulkHint + '"></textarea></div></div>'
      + '<div class="m-hint" style="margin-top:2px">⌨ Ctrl+Enter adds the card — the window stays open so you can rattle through a whole section.</div>'
      + '<div class="m-actions"><button class="btn" id="mDoneBtn" data-a="board-add-done">Cancel</button>'
      + '<button class="btn primary" data-a="board-add-ok" data-id="' + subj.id + '">Add card</button></div>',
      function (root) {
        var tabSel = root.querySelector('#mTab'), newRow = root.querySelector('#mNewTabRow');
        function paintTab() { newRow.style.display = tabSel.value === '__new' ? 'block' : 'none'; }
        tabSel.onchange = paintTab;
        paintTab();   // subjects with no tabs land on "Create a new tab…" — show the name field immediately
        root.querySelector('#mKind').onchange = function () {
          root.querySelector('#mOne').style.display = this.value === 'one' ? 'block' : 'none';
          root.querySelector('#mBulk').style.display = this.value === 'bulk' ? 'block' : 'none';
        };
        root.addEventListener('keydown', function (ev) {
          if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
            ev.preventDefault();
            var ok = root.querySelector('[data-a="board-add-ok"]');
            if (ok) ok.click();
          }
        });
      });
  };
  ACTIONS['board-add-ok'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var tabSelEl = document.getElementById('mTab');
    var tab;
    if (tabSelEl.value === '__new') {
      var tn = document.getElementById('mNewTab').value.trim();
      if (!tn) { FX.toast('Give the new tab a name first.', 'amber'); return; }
      tab = Store.addTab(subj, tn);
      // fold the fresh tab into the picker so the next add reuses it
      var opt = document.createElement('option');
      opt.value = tab.id;
      opt.textContent = tab.name;
      tabSelEl.insertBefore(opt, tabSelEl.querySelector('option[value="__new"]'));
      tabSelEl.value = tab.id;
      document.getElementById('mNewTab').value = '';
      document.getElementById('mNewTabRow').style.display = 'none';
    } else {
      tab = subj.tabs.filter(function (t) { return t.id === tabSelEl.value; })[0];
    }
    if (!tab) return;
    ADDRUN = ADDRUN || { n: 0, tabId: null };
    ADDRUN.tabId = tab.id;
    var group = document.getElementById('mGroup').value.trim() || null;
    var kind = document.getElementById('mKind').value;

    if (kind === 'one') {
      var termEl = document.getElementById('mTerm');
      var term = termEl.value.trim();
      if (!term) { FX.toast('The card needs a front.', 'amber'); return; }
      var fields = { term: term, group: group };
      if (subj.dual) {
        fields.def = document.getElementById('mDef').value.trim();
        fields.key = document.getElementById('mKey').value.trim();
        if (!fields.def && !fields.key) { FX.toast('Give it a definition or key facts.', 'amber'); return; }
      } else {
        fields.back = document.getElementById('mBack').value.trim();
        if (!fields.back) { FX.toast('The card needs a back.', 'amber'); return; }
      }
      Store.addCard(tab, fields);
      ADDRUN.n++;
      // stay open for the next card: keep tab + group, clear the card fields
      termEl.value = '';
      ['mDef', 'mKey', 'mBack'].forEach(function (id) {
        var f = document.getElementById(id);
        if (f) f.value = '';
      });
      termEl.focus();
      var done = document.getElementById('mDoneBtn');
      if (done) done.textContent = 'Done — ' + ADDRUN.n + ' added';
      FX.toast('Card ' + ADDRUN.n + ' added ⚓ — next one', 'green', 1300);
      App.render();   // the board behind the modal updates live
    } else {
      var added = 0;
      document.getElementById('mLines').value.split('\n').forEach(function (line) {
        var parts = line.split('|').map(function (p) { return p.trim(); });
        if (!parts[0]) return;
        var f = { term: parts[0], group: group };
        if (subj.dual) { f.def = parts[1] || ''; f.key = parts[2] || ''; if (!f.def && !f.key) return; }
        else { f.back = parts.slice(1).join(' | ').trim(); if (!f.back) return; }
        Store.addCard(tab, f);
        added++;
      });
      if (!added) { FX.toast('No valid lines found — check the format.', 'amber'); return; }
      ADDRUN = null;
      Modal.close();
      FX.toast(added + ' cards added — go earn the green ⚓', 'green');
      App.go({ v: 'subject', id: subj.id, tab: tab.id }, { replace: App.route.v === 'subject' && App.route.id === subj.id });
    }
  };

  ACTIONS['board-add-done'] = function () {
    var run = ADDRUN;
    ADDRUN = null;
    Modal.close();
    if (run && run.n > 0) {
      FX.toast(run.n + (run.n === 1 ? ' card' : ' cards') + ' added — go earn the green ⚓', 'green');
      if (App.route.v === 'subject') App.go({ v: 'subject', id: App.route.id, tab: run.tabId || App.route.tab }, { replace: true });
      else App.render();
    }
  };

  ACTIONS['card-edit'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-subj'));
    var cardId = el.getAttribute('data-id');
    var card, tab;
    subj.tabs.forEach(function (t) { t.cards.forEach(function (c) { if (c.id === cardId) { card = c; tab = t; } }); });
    if (!card) return;
    var fields = subj.dual
      ? '<div class="m-row"><label class="m-lbl">Definition</label><textarea class="m-ta" id="mDef">' + U.esc(card.def || '') + '</textarea></div>'
        + '<div class="m-row"><label class="m-lbl">Key facts</label><textarea class="m-ta" id="mKey">' + U.esc(card.key || '') + '</textarea></div>'
      : '<div class="m-row"><label class="m-lbl">Back</label><textarea class="m-ta" id="mBack">' + U.esc(card.back || card.def || card.key || '') + '</textarea></div>';
    Modal.open('<div class="m-title">Edit card</div>'
      + '<div class="m-row"><label class="m-lbl">' + (subj.dual ? 'Term' : 'Front') + '</label><input class="m-input" id="mTerm" value="' + U.esc(card.term) + '"></div>'
      + fields
      + '<div class="m-row"><label class="m-lbl">Group heading (optional)</label><input class="m-input" id="mGroup" value="' + U.esc(card.group || '') + '"></div>'
      + '<div class="m-row"><label class="m-lbl">Your note (shown after reveal)</label><textarea class="m-ta" id="mNote" style="min-height:56px">' + U.esc(card.note || '') + '</textarea></div>'
      + '<div class="m-actions"><button class="btn warn" data-a="card-del" data-id="' + card.id + '" data-subj="' + subj.id + '" style="margin-right:auto">Delete card</button>'
      + '<button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="card-edit-ok" data-id="' + card.id + '" data-subj="' + subj.id + '">Save</button></div>');
  };
  ACTIONS['card-edit-ok'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-subj'));
    var cardId = el.getAttribute('data-id');
    subj.tabs.forEach(function (t) { t.cards.forEach(function (card) {
      if (card.id !== cardId) return;
      card.term = document.getElementById('mTerm').value.trim() || card.term;
      function setField(f, v) { if (v) card[f] = v; else delete card[f]; }
      if (subj.dual) {
        setField('def', document.getElementById('mDef').value.trim());
        setField('key', document.getElementById('mKey').value.trim());
      } else {
        setField('back', document.getElementById('mBack').value.trim());
      }
      setField('group', document.getElementById('mGroup').value.trim());
      setField('note', document.getElementById('mNote').value.trim());
    }); });
    Store.save();
    Modal.close();
    App.render();
  };
  ACTIONS['card-del'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-subj'));
    var cardId = el.getAttribute('data-id');
    Modal.confirm('Delete this card?', 'Its study history goes with it.', 'Delete', true, function () {
      Store.deleteCard(subj, cardId);
      App.render();
    });
  };

  /* ─── Event delegation & keyboard ────────────────────────────────────── */
  document.addEventListener('click', function (ev) {
    var inMenu = Menu.el && Menu.el.contains(ev.target);
    var el = ev.target;
    while (el && el !== document.body) {
      var a = el.getAttribute && el.getAttribute('data-a');
      if (a && ACTIONS[a]) {
        if (el.disabled) return;
        if (!inMenu) Menu.close();
        ACTIONS[a](el, ev);
        if (inMenu) Menu.close();
        return;
      }
      el = el.parentNode;
    }
    if (!inMenu) Menu.close();
  });

  // Keyboard access for the clickable cards (role="button" divs)
  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if ((ev.key === 'Enter' || ev.key === ' ') && t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') {
      ev.preventDefault();
      t.click();
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (App.route.v !== 'session' || !App.sess || App.sess.done) return;
    var s = App.sess;
    var inTa = document.activeElement && document.activeElement.id === 'sessTa';
    if ((ev.key === 's' || ev.key === 'S') && !inTa) {
      ev.preventDefault();
      ACTIONS['sess-skip']();
      return;
    }
    if (!s.revealed) {
      if ((ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) || (!inTa && (ev.key === ' ' || ev.key === 'Enter'))) {
        ev.preventDefault();
        var ta = document.getElementById('sessTa');
        s.typed = ta ? ta.value : '';
        s.revealed = true;
        App.render();
      }
    } else {
      if (['1', '2', '3', '4'].indexOf(ev.key) >= 0) {
        ev.preventDefault();
        var btn = document.querySelector('.grade-row .g' + ev.key);
        ACTIONS['sess-grade'](btn || { getAttribute: function () { return ev.key; } }, ev);
      }
    }
    if (ev.key === 'Escape') ACTIONS['sess-exit']();
  });

  function afterRender() {
    // keep the active tab visible when the tab row scrolls sideways (phones)
    var onTab = document.querySelector('.tabbar .tabp.on');
    if (onTab && onTab.scrollIntoView && window.innerWidth <= 640) onTab.scrollIntoView({ block: 'nearest', inline: 'center' });
    var ta = document.getElementById('sessTa');
    if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
    var nl = document.getElementById('nlInput');
    if (nl) {
      nl.focus();
      nl.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); ACTIONS['nl-check'](); } };
    }
    // keep inline text-mode answers synced so a re-render never wipes them
    document.querySelectorAll('.type-zone.inline').forEach(function (t) {
      t.oninput = function () { TYPED[t.getAttribute('data-typed')] = t.value; };
    });
  }

  /* ─── Boot ───────────────────────────────────────────────────────────── */
  Store.load();
  document.documentElement.setAttribute('data-theme', Store.data().settings.theme || 'dark');
  App.route = parseHash(location.hash);
  if (App.route.v === 'session') { App.route = { v: 'home' }; try { history.replaceState(null, '', '#/'); } catch (e) {} }
  if (window.Cloud) Cloud.init();   // decides gate vs app, then renders
  else App.render();
})();

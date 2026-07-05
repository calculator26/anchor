/* ============================================================================
   Anchor · ui-main.js — router, harbour, subject board (Mode A),
   session player, editors, boot. Loads last.
   ========================================================================== */
(function () {
  'use strict';

  var REV = {};   // revealed cards in browse mode (not persisted)

  var App = window.App = {
    route: { v: 'home' },
    sess: null,

    go: function (route) {
      App.route = route;
      REV = {};
      window.scrollTo(0, 0);
      App.render();
    },

    render: function () {
      var v = App.route.v, html = '';
      if (v === 'home') html = viewHome();
      else if (v === 'subject') html = viewSubject();
      else if (v === 'session') html = viewSession();
      else if (v === 'chains') html = V.chains();
      else if (v === 'chainBuild') html = V.chainBuild();
      else if (v === 'chain') html = V.chain(App.route);
      else if (v === 'arrange') html = V.arrange(App.route);
      else if (v === 'nextlink') html = V.nextlink(App.route);
      else if (v === 'recital') html = V.recital(App.route);
      else if (v === 'stats') html = V.stats();
      else if (v === 'data') html = V.data();
      document.getElementById('view').innerHTML = html;
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
      var navMap = { home: 'home', subject: 'home', session: 'home', chains: 'chains', chainBuild: 'chains', chain: 'chains', arrange: 'chains', nextlink: 'chains', recital: 'chains', stats: 'stats', data: 'data' };
      document.querySelectorAll('.tn-btn').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-nav') === navMap[App.route.v]);
      });
    },

    startSession: function (keys, origin, label) {
      if (!keys.length) { FX.toast('Nothing to study there yet.', ''); return; }
      App.sess = {
        q: keys.slice(0, 200), i: 0, revealed: false, typed: '',
        got: 0, miss: 0, greens: 0, banked: 0, combo: 0, maxCombo: 0,
        origin: origin || { v: 'home' }, label: label || 'Review', done: false
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

    // Celebration checks after a grade lands on an item facet.
    checkCompletions: function (key) {
      var ctx = Store.resolveFacet(key);
      if (!ctx) return;
      if (ctx.kind === 'item') {
        var secDone = sectionFacetKeys(ctx.section).every(Store.isVerified);
        if (secDone && App.milestone('done:sec:' + ctx.section.id)) {
          FX.banner('⚓', 'Section anchored', ctx.section.name);
        }
        var topicDone = ctx.topic.sections.every(function (sec) { return sectionFacetKeys(sec).every(Store.isVerified); });
        if (topicDone && App.milestone('done:topic:' + ctx.topic.id)) {
          FX.confetti();
          FX.banner('🏆', ctx.topic.name + ' — fully anchored', 'Every facet verified by recall');
        }
        var subjDone = ctx.subject.topics.every(function (t) {
          return t.sections.every(function (sec) { return sectionFacetKeys(sec).every(Store.isVerified); });
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
  function sectionFacetKeys(sec) {
    var out = [];
    sec.items.forEach(function (it) {
      if (it.def) out.push('f:' + it.id + ':def');
      if (it.key) out.push('f:' + it.id + ':key');
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     HOME / HARBOUR
     ════════════════════════════════════════════════════════════════════ */
  function viewHome() {
    var D = Store.data();
    if (!D.subjects.length && !D.chains.length) return viewWelcome();

    var due = Store.dueFacets();
    var totalFacets = 0, verified = 0;
    D.subjects.forEach(function (subj) {
      Store.subjectFacets(subj).forEach(function (f) {
        totalFacets++;
        if (Store.isVerified(f.key)) verified++;
      });
    });

    var html = '<div class="h-title">Harbour</div>'
      + '<div class="h-sub">' + new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
      + ' · ' + verified + ' of ' + totalFacets + ' facets anchored</div>';

    if (due.length) {
      html += '<div class="due-callout"><div><div class="dc-txt">⚓ ' + due.length + ' ' + (due.length === 1 ? 'memory is' : 'memories are') + ' ready to strengthen</div>'
        + '<div class="dc-sub">They’ve drifted to your ' + Math.round(D.settings.retention * 100) + '% line — one recall each locks them back in stronger.</div></div>'
        + '<button class="btn primary" data-a="review-all">Strengthen now →</button></div>';
    } else if (totalFacets) {
      html += '<div class="due-callout" style="border-color:var(--green-line);border-left-color:var(--green)"><div><div class="dc-txt">🌊 Harbour’s calm — nothing due right now.</div>'
        + '<div class="dc-sub">Browse ahead, build a chain, or add tomorrow’s content.</div></div></div>';
    }

    html += '<div class="subj-grid">';
    D.subjects.forEach(function (subj) {
      var fs = Store.subjectFacets(subj);
      var v = fs.filter(function (f) { return Store.isVerified(f.key); }).length;
      var pctv = U.pct(v, fs.length);
      var dueN = Store.dueFacets(subj.id).length;
      var exam = U.daysUntil(subj.examDate);
      var C = 163.36;
      html += '<button class="subj-card" data-a="subject" data-id="' + subj.id + '">'
        + '<svg class="sc-ring" viewBox="0 0 60 60"><circle class="track" cx="30" cy="30" r="26"/>'
        + '<circle class="fill" cx="30" cy="30" r="26" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pctv / 100)) + '"/>'
        + '<text x="30" y="35" text-anchor="middle">' + pctv + '%</text></svg>'
        + '<span style="min-width:0"><span class="sc-name">' + U.esc(subj.name) + '</span>'
        + (subj.tagline ? '<span class="sc-tag" style="display:block">' + U.esc(subj.tagline) + '</span>' : '')
        + '<span class="sc-meta">'
        + (dueN ? '<span class="pill due">' + dueN + ' due</span>' : '<span class="pill">all held</span>')
        + '<span class="pill">' + fs.length + ' facets</span>'
        + (exam !== null ? '<span class="pill exam">' + (exam > 0 ? exam + 'd to exam' : 'exam day!') + '</span>' : '')
        + '</span></span></button>';
    });
    html += '<button class="add-card" data-a="subject-new">＋ New subject</button>';
    html += '</div>';

    if (D.chains.length) {
      var chDue = 0;
      D.chains.forEach(function (ch) {
        Store.chainFacets(ch).forEach(function (f) { var h = U.hold(f.key); if (h && h.due) chDue++; });
      });
      html += '<div class="sec-head" style="margin-top:34px">Chains</div>'
        + '<div class="due-callout" style="border-left-color:var(--accent);border-color:var(--line)"><div>'
        + '<div class="dc-txt">⛓️ ' + D.chains.length + ' chain' + (D.chains.length > 1 ? 's' : '') + (chDue ? ' · <span style="color:var(--amber)">' + chDue + ' links fading</span>' : '') + '</div>'
        + '<div class="dc-sub">Essay paragraphs, mastered in sequence.</div></div>'
        + '<button class="btn" data-a="chains">Open chains →</button></div>';
    }
    return html;
  }

  function viewWelcome() {
    return '<div class="welcome">'
      + '<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">'
      + '<circle cx="24" cy="10.5" r="4.4" fill="none" stroke="currentColor" stroke-width="3.4"/>'
      + '<line x1="24" y1="14.9" x2="24" y2="37" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>'
      + '<line x1="15" y1="21.5" x2="33" y2="21.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>'
      + '<path d="M10 29.5 C10 37 16 41.5 24 41.5 C32 41.5 38 37 38 29.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>'
      + '<path d="M10 29.5 L6.5 26.5 M10 29.5 L13.8 27.4" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>'
      + '<path d="M38 29.5 L41.5 26.5 M38 29.5 L34.2 27.4" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/></svg>'
      + '<div class="w-title">Memory that <em>holds</em>.</div>'
      + '<div class="w-sub">Anchor is a self-directed memorisation system for high-stakes exams — built on the two study techniques with the strongest evidence in cognitive science, and honest enough to show you what you’d actually recall today.</div>'
      + '<div class="w-actions">'
      + '<button class="btn primary big" data-a="seed-load">Load Business Studies (HSC)</button>'
      + '<button class="btn big" data-a="subject-new">Start fresh</button></div>'
      + '<div class="w-points">'
      + '<div class="w-point"><b>🧠 Retrieval, not re-reading</b><span>Reveal-and-grade turns every glance into practice testing — the #1 rated technique (g≈0.6 for high-schoolers).</span></div>'
      + '<div class="w-point"><b>📉 A real forgetting curve</b><span>FSRS-6 — the algorithm behind modern Anki — runs locally and knows when each fact will fade.</span></div>'
      + '<div class="w-point"><b>🟢 Green you can trust</b><span>Cards only count as anchored when you’ve actually recalled them — and they fade if you don’t come back.</span></div>'
      + '<div class="w-point"><b>⛓️ Essays as chains</b><span>One keyword per sentence. Master the order, then the links, then recite the lot.</span></div>'
      + '</div></div>';
  }

  ACTIONS['home'] = function () { App.go({ v: 'home' }); };
  ACTIONS['chains'] = function () { App.go({ v: 'chains' }); };
  ACTIONS['stats'] = function () { App.go({ v: 'stats' }); };
  ACTIONS['data'] = function () { App.go({ v: 'data' }); };
  ACTIONS['subject'] = function (el) { App.go({ v: 'subject', id: el.getAttribute('data-id') }); };
  ACTIONS['seed-load'] = function () {
    var subj = Store.loadSeed();
    if (subj) {
      FX.toast('Business Studies loaded — 255 items ready ⚓', 'green');
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
    Store.save();
  };

  /* ══════════════════════════════════════════════════════════════════════
     SUBJECT BOARD (Mode A)
     ════════════════════════════════════════════════════════════════════ */
  function viewSubject() {
    var subj = Store.subjectById(App.route.id);
    if (!subj) return '<div class="empty">Subject not found.</div>';
    if (!subj.topics.length) {
      return boardHead(subj) + '<div class="empty"><span class="big">🗺️</span>No topics yet.<br>Add your first topic — then sections, then the facts themselves.<br><br><button class="btn primary" data-a="board-add" data-id="' + subj.id + '">＋ Add content</button></div>';
    }

    var topic = subj.topics.filter(function (t) { return t.id === App.route.t; })[0] || subj.topics[0];
    var units = [];
    topic.sections.forEach(function (sec) { if (sec.unit && units.indexOf(sec.unit) < 0) units.push(sec.unit); });
    var unit = units.indexOf(App.route.u) >= 0 ? App.route.u : units[0] || null;
    var facet = App.route.f === 'key' ? 'key' : 'def';
    var sections = topic.sections.filter(function (sec) { return !unit || sec.unit === unit; });

    var html = boardHead(subj);
    html += subjectStats(subj);

    // nav card
    html += '<div class="navcard"><div class="topic-pills">';
    subj.topics.forEach(function (t) {
      var fs = Store.subjectFacets(subj).filter(function (f) { return f.topic === t; });
      var v = fs.filter(function (f) { return Store.isVerified(f.key); }).length;
      html += '<button class="tp-pill' + (t === topic ? ' on' : '') + '" data-a="board-topic" data-id="' + subj.id + '" data-t="' + t.id + '">'
        + U.esc(t.name) + '<span class="fillbar" style="width:' + U.pct(v, fs.length) + '%"></span></button>';
    });
    var dueN = Store.dueFacets(subj.id).length;
    html += '<button class="review-btn' + (dueN ? ' has-due' : '') + '" data-a="review-subject" data-id="' + subj.id + '">'
      + '🔔 Review queue' + (dueN ? ' <span class="badge">' + dueN + '</span>' : '') + '</button>';
    html += '</div>';
    html += '<div class="nav2"><div class="unit-tabs">';
    if (units.length) {
      units.forEach(function (u) {
        html += '<button class="ut-tab' + (u === unit ? ' on' : '') + '" data-a="board-unit" data-id="' + subj.id + '" data-t="' + topic.id + '" data-u="' + U.esc(u) + '">' + U.esc(u) + '</button>';
      });
    }
    html += '</div><div class="facet-toggle">'
      + '<button class="ft-btn' + (facet === 'def' ? ' on' : '') + '" data-a="board-facet" data-f="def">Definitions</button>'
      + '<button class="ft-btn' + (facet === 'key' ? ' on' : '') + '" data-a="board-facet" data-f="key">Key facts</button>'
      + '</div></div></div>';

    // sections + items
    var shown = 0, rated = 0, verifiedN = 0, num = 1;
    sections.forEach(function (sec) {
      var items = sec.items.filter(function (it) { return it[facet]; });
      if (!items.length) return;
      var keys = sectionFacetKeys(sec);
      var secDone = keys.length && keys.every(Store.isVerified);
      html += '<div class="sec-head"><span>' + U.esc(sec.name) + '</span>'
        + '<span class="shp">' + items.map(function (it) {
          var k = 'f:' + it.id + ':' + facet;
          var st = Store.data().state[k];
          var cls = !st || !st.conf ? '' : st.conf === 'g' ? (Store.isVerified(k) ? 'g' : 'gu') : st.conf === 'a' ? 'a' : 'r';
          return '<i class="' + cls + '"></i>';
        }).join('') + '</span>'
        + (secDone ? '<span class="sec-badge">⚓ anchored</span>' : '')
        + '<button class="tool" title="Focus session on this section" data-a="drill-section" data-id="' + subj.id + '" data-sec="' + sec.id + '">▶</button>'
        + '</div>';
      items.forEach(function (it) {
        html += itemCard(subj, topic, sec, it, facet, num++);
        shown++;
        var st = Store.data().state['f:' + it.id + ':' + facet];
        if (st && st.conf) rated++;
        if (Store.isVerified('f:' + it.id + ':' + facet)) verifiedN++;
      });
    });
    if (!shown) html += '<div class="empty">No ' + (facet === 'def' ? 'definitions' : 'key facts') + ' here yet.</div>';

    html += '<div class="board-foot"><span class="prog-lbl">' + rated + ' / ' + shown + ' rated · <b style="color:var(--green)">' + verifiedN + ' anchored</b></span>'
      + '<div class="prog-wrap"><div class="pbar"><div class="pbar-fill green" style="width:' + U.pct(verifiedN, shown) + '%"></div></div>'
      + '<span class="prog-lbl">' + U.pct(verifiedN, shown) + '%</span></div></div>';
    return html;
  }

  function boardHead(subj) {
    var exam = U.daysUntil(subj.examDate);
    return '<button class="bh-back" data-a="home">← Harbour</button>'
      + '<div class="board-head"><div><div class="bh-title">' + U.esc(subj.name) + '</div>'
      + '<div class="bh-sub">' + (subj.tagline ? U.esc(subj.tagline) + ' · ' : '')
      + (exam !== null ? (exam > 0 ? '<b style="color:var(--accent)">' + exam + ' days to the exam</b>' : '<b style="color:var(--amber)">exam day — go get it</b>') : '<button class="linklike" data-a="subject-edit" data-id="' + subj.id + '">set exam date</button>')
      + '</div></div>'
      + '<div class="bh-actions">'
      + '<button class="btn" data-a="board-add" data-id="' + subj.id + '">＋ Add</button>'
      + '<button class="btn" data-a="subject-edit" data-id="' + subj.id + '">✎ Edit</button>'
      + '</div></div>';
  }

  function subjectStats(subj) {
    var fs = Store.subjectFacets(subj);
    var c = { v: 0, gu: 0, a: 0, r: 0, u: 0 };
    fs.forEach(function (f) {
      var st = Store.data().state[f.key];
      if (Store.isVerified(f.key)) c.v++;
      else if (st && st.conf === 'g') c.gu++;
      else if (st && st.conf === 'a') c.a++;
      else if (st && st.conf === 'r') c.r++;
      else c.u++;
    });
    var dueN = Store.dueFacets(subj.id).length;
    function sc(n, lbl, color, sub, extra) {
      return '<div class="stat' + (extra || '') + '"><div class="n" style="color:' + color + '">' + n + '</div>'
        + '<div class="l"><span class="dot" style="background:' + color + '"></span>' + lbl + '</div><div class="sub">' + sub + '</div></div>';
    }
    return '<div class="statrow">'
      + sc(c.v, 'Anchored', 'var(--green)', 'verified by recall')
      + sc(c.gu, 'Untested green', 'rgba(52,211,153,.6)', 'tagged — prove them')
      + sc(c.a, 'Getting there', 'var(--amber)', 'nearly locked in')
      + sc(c.r, 'Not yet', 'var(--red)', 'honest starting point')
      + sc(c.u, 'Unrated', 'var(--text3)', 'not touched yet')
      + '<div class="stat click' + (dueN ? ' hot' : '') + '" data-a="review-subject" data-id="' + subj.id + '"><div class="n">' + dueN + '</div>'
      + '<div class="l">⚓ Due for review</div><div class="sub">' + (dueN ? 'tap to strengthen' : 'all holding strong') + '</div></div>'
      + '</div>';
  }

  function itemCard(subj, topic, sec, it, facet, num) {
    var key = 'f:' + it.id + ':' + facet;
    var st = Store.data().state[key];
    var conf = st ? st.conf : null;
    var hold = U.hold(key);
    var isDue = hold && hold.due;
    var revealed = !!REV[key];
    var verified = Store.isVerified(key);

    var html = '<div class="item ' + U.stClass(key) + '" data-card="' + key + '">';

    // term cell
    html += '<div class="cell cell-term"><div class="term-top"><span class="num">' + num + '</span>'
      + (isDue ? '<span class="due-pill">⚓ Review due</span>' : '') + '</div>'
      + '<div class="term">' + U.esc(it.term) + '</div></div>';

    // content cell
    html += '<div class="cell cell-content">'
      + '<div class="tools"><button class="tool" title="Edit this item" data-a="item-edit" data-id="' + it.id + '" data-subj="' + subj.id + '">✎</button></div>';
    if (!revealed) {
      html += '<div class="hidden-panel" data-a="reveal" data-k="' + key + '">👁 Reveal ' + (facet === 'def' ? 'definition' : 'key facts') + ' — try to say it first</div>';
    } else {
      html += '<div class="c-text">' + U.esc(it[facet]) + '</div>'
        + (it.note ? '<div class="note-box"><span class="note-lbl">Note</span><span>' + U.esc(it.note) + '</span></div>' : '')
        + '<div class="after-row"><span class="grade-hint">Did you produce it?</span>'
        + '<button class="gbtn g1" data-a="grade" data-k="' + key + '" data-g="1">✗ Missed</button>'
        + '<button class="gbtn g2" data-a="grade" data-k="' + key + '" data-g="2">~ Shaky</button>'
        + '<button class="gbtn g3" data-a="grade" data-k="' + key + '" data-g="3">✓ Got it</button>'
        + '<button class="gbtn g4" data-a="grade" data-k="' + key + '" data-g="4">⚡ Instant</button>'
        + '<button class="hide-link" data-a="hide" data-k="' + key + '">Hide</button></div>';
    }
    html += '</div>';

    // meta cell
    html += '<div class="cell cell-meta"><div class="meta-lbl">Confidence' + (verified ? ' <span style="color:var(--green)">⚓</span>' : '') + '</div>'
      + '<div class="conf-btns">'
      + '<button class="cbtn g' + (conf === 'g' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="g"><span class="cdot"></span>Know it' + (conf === 'g' && !verified ? '<span class="unv">untested</span>' : '') + '</button>'
      + '<button class="cbtn a' + (conf === 'a' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="a"><span class="cdot"></span>Getting there</button>'
      + '<button class="cbtn r' + (conf === 'r' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="r"><span class="cdot"></span>Not yet</button>'
      + '</div>';

    if (hold) {
      var col = U.holdColor(hold.r);
      html += '<div class="hold-line' + (isDue ? ' due' : '') + '">'
        + (isDue ? '⚓ Due — recall now ~' + hold.pct + '%' : 'Holding ' + hold.pct + '% · ~' + (hold.S < 1 ? '&lt;1' : Math.round(hold.S)) + 'd stability')
        + '</div><div class="hold-bar"><div class="hold-fill" style="width:' + hold.pct + '%;background:' + col + '"></div></div>';
    } else if (conf === 'g') {
      html += '<div class="hold-line" style="color:var(--amber)">Tagged green, never tested — reveal &amp; grade it once to anchor it.</div>';
    }

    var hist = st ? st.hist.slice(-7) : [];
    html += '<div class="hist-row">' + (hist.length
      ? hist.map(function (h) { return '<span class="hdot ' + (h.g >= 3 ? 'g' : h.g === 2 ? 'a' : 'r') + '" title="' + U.fmtDate(h.t) + '"></span>'; }).join('')
      : '<span class="hist-none">no attempts yet</span>') + '</div>';
    if (st && (st.got || st.miss)) {
      html += '<div class="hist-score"><span class="' + (st.got ? 'hs-g' : 'hs-z') + '">✓ ' + st.got + '</span>'
        + '<span class="' + (st.miss ? 'hs-r' : 'hs-z') + '">✗ ' + st.miss + '</span></div>';
    }
    html += '</div></div>';
    return html;
  }

  ACTIONS['board-topic'] = function (el) {
    App.go({ v: 'subject', id: el.getAttribute('data-id'), t: el.getAttribute('data-t') });
  };
  ACTIONS['board-unit'] = function (el) {
    App.go({ v: 'subject', id: el.getAttribute('data-id'), t: el.getAttribute('data-t'), u: el.getAttribute('data-u'), f: App.route.f });
  };
  ACTIONS['board-facet'] = function (el) {
    App.route.f = el.getAttribute('data-f');
    REV = {};
    App.render();
  };
  ACTIONS['reveal'] = function (el) { REV[el.getAttribute('data-k')] = true; App.render(); };
  ACTIONS['hide'] = function (el) { REV[el.getAttribute('data-k')] = false; App.render(); };

  ACTIONS['conf'] = function (el) {
    var k = el.getAttribute('data-k'), c = el.getAttribute('data-c');
    var stBefore = Store.data().state[k];
    var wasUnstudied = !stBefore || !stBefore.srs;
    var res = Store.setConf(k, c);
    if (res === 'g' && wasUnstudied) {
      FX.toast('Tagged green — reveal &amp; grade it once to make it count ⚓', '', 3200);
    }
    App.render();
  };

  ACTIONS['grade'] = function (el) {
    var k = el.getAttribute('data-k'), g = +el.getAttribute('data-g');
    var res = Store.applyGrade(k, g);
    var card = document.querySelector('[data-card="' + k + '"]');
    if (res.wentGreen) FX.green(card);
    else if (g >= 3) FX.burstOn(el, 7);
    REV[k] = false;
    App.afterGradeCommon(res);
    // let the sweep play on the old card before re-render
    setTimeout(function () { App.render(); App.checkCompletions(k); }, res.wentGreen ? 420 : 60);
  };

  ACTIONS['review-subject'] = function (el) {
    var id = el.getAttribute('data-id');
    var subj = Store.subjectById(id);
    var due = Store.dueFacets(id).map(function (d) { return d.key; });
    if (!due.length) {
      FX.toast('Nothing due in ' + subj.name + ' — everything is holding above ' + Math.round(Store.data().settings.retention * 100) + '%.', 'green');
      return;
    }
    App.startSession(due, { v: 'subject', id: id }, subj.name + ' · review');
  };

  ACTIONS['drill-section'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var secId = el.getAttribute('data-sec');
    var sec;
    subj.topics.forEach(function (t) { t.sections.forEach(function (s2) { if (s2.id === secId) sec = s2; }); });
    if (!sec) return;
    var keys = sectionFacetKeys(sec);
    // weakest first: unstudied, then lowest R
    keys.sort(function (a, b) {
      var ha = U.hold(a), hb = U.hold(b);
      return (ha ? ha.r : -1) - (hb ? hb.r : -1);
    });
    App.startSession(keys, { v: 'subject', id: subj.id }, sec.name);
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
        crumbs: ctx.subject.name + ' · ' + ctx.topic.name + ' · ' + ctx.section.name,
        tag: U.modeLabel(ctx.mode),
        front: ctx.item.term,
        back: ctx.item[ctx.mode],
        note: ctx.item.note
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
      + '<button class="sess-close" data-a="sess-exit" title="End session">✕</button>'
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
        if (typeFirst) {
          html += '<textarea class="type-zone" id="sessTa" placeholder="Produce it from memory — type (or say) the answer, then reveal to check.">' + U.esc(s.typed) + '</textarea>'
            + '<div class="type-hint">Ctrl+Enter to reveal · producing first is what makes it stick</div>'
            + '<div class="sess-actions"><button class="btn primary big" data-a="sess-reveal">Reveal &amp; check</button>'
            + '<button class="btn" data-a="sess-reveal" data-skip="1">Just show me</button></div>';
        } else {
          html += '<div class="hidden-panel" data-a="sess-reveal" style="min-height:120px;font-size:16px">👁 Reveal — say it from memory first</div>';
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
          + '</div><div class="type-hint" style="margin-top:10px">Grade what you produced, not what you meant.</div></div>';
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
      + '</div>'
      + '<div class="m-actions" style="justify-content:center">'
      + '<button class="btn primary big" data-a="sess-exit">Back to the board</button>'
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

  ACTIONS['sess-exit'] = function () {
    var s = App.sess;
    var origin = s ? s.origin : { v: 'home' };
    App.sess = null;
    App.go(origin);
  };

  /* ══════════════════════════════════════════════════════════════════════
     EDITORS — subjects, topics, sections, items, bulk paste
     ════════════════════════════════════════════════════════════════════ */
  ACTIONS['subject-new'] = function () {
    Modal.open('<div class="m-title">New subject</div>'
      + '<div class="m-sub">A subject is the whole course — topics and sections come next.</div>'
      + '<div class="m-row"><label class="m-lbl">Name</label><input class="m-input" id="mName" placeholder="e.g. Legal Studies"></div>'
      + '<div class="m-row"><label class="m-lbl">Tagline (optional)</label><input class="m-input" id="mTag" placeholder="e.g. HSC · Crime · Human Rights"></div>'
      + '<div class="m-row"><label class="m-lbl">Exam date (optional — powers the countdown &amp; schedule compression)</label><input class="m-input" type="date" id="mExam"></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="subject-new-ok">Create subject</button></div>');
  };
  ACTIONS['subject-new-ok'] = function () {
    var name = document.getElementById('mName').value.trim();
    if (!name) return;
    var subj = Store.addSubject(name, document.getElementById('mTag').value.trim(), document.getElementById('mExam').value || null);
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
    Store.save();
    Modal.close();
    App.render();
  };

  ACTIONS['board-add'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id') || App.route.id);
    var topicOpts = subj.topics.map(function (t) { return '<option value="' + t.id + '">' + U.esc(t.name) + '</option>'; }).join('');
    var secOpts = '';
    subj.topics.forEach(function (t) {
      t.sections.forEach(function (sec) {
        secOpts += '<option value="' + sec.id + '">' + U.esc(t.name) + ' → ' + (sec.unit ? sec.unit + ' → ' : '') + U.esc(sec.name) + '</option>';
      });
    });
    Modal.open('<div class="m-title">Add to ' + U.esc(subj.name) + '</div>'
      + '<div class="m-sub">Writing your own material is the first study pass — that’s the generation effect working for you.</div>'
      + '<div class="m-row"><label class="m-lbl">What are you adding?</label>'
      + '<select class="m-select" id="mKind">'
      + (secOpts ? '<option value="item">A single item (term + definition / key facts)</option>' : '')
      + (secOpts ? '<option value="bulk">Bulk paste items (Term | definition | key facts)</option>' : '')
      + (topicOpts ? '<option value="section">A section</option>' : '')
      + '<option value="topic">A topic</option>'
      + '</select></div>'
      + '<div id="mKindBody"></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="board-add-ok" data-id="' + subj.id + '">Add</button></div>',
      function (root) {
        var kind = root.querySelector('#mKind');
        var body = root.querySelector('#mKindBody');
        function paint() {
          var k = kind.value;
          if (k === 'topic') body.innerHTML = '<div class="m-row"><label class="m-lbl">Topic name</label><input class="m-input" id="mA" placeholder="e.g. Human Resources"></div>';
          else if (k === 'section') body.innerHTML = '<div class="m-row"><label class="m-lbl">Inside topic</label><select class="m-select" id="mT">' + topicOpts + '</select></div>'
            + '<div class="m-row"><label class="m-lbl">Section name</label><input class="m-input" id="mA" placeholder="e.g. Training &amp; Development"></div>'
            + '<div class="m-row"><label class="m-lbl">Unit / tab (optional — e.g. Role, Influences, Processes, Strategies)</label><input class="m-input" id="mB" placeholder="leave blank for none"></div>';
          else if (k === 'item') body.innerHTML = '<div class="m-row"><label class="m-lbl">Section</label><select class="m-select" id="mSec">' + secOpts + '</select></div>'
            + '<div class="m-row"><label class="m-lbl">Term</label><input class="m-input" id="mA" placeholder="e.g. Outsourcing"></div>'
            + '<div class="m-row"><label class="m-lbl">Definition (optional)</label><textarea class="m-ta" id="mB" style="min-height:70px"></textarea></div>'
            + '<div class="m-row"><label class="m-lbl">Key facts (optional)</label><textarea class="m-ta" id="mC" style="min-height:70px"></textarea></div>';
          else body.innerHTML = '<div class="m-row"><label class="m-lbl">Section</label><select class="m-select" id="mSec">' + secOpts + '</select></div>'
            + '<div class="m-row"><label class="m-lbl">One item per line: <b>Term | definition | key facts</b></label>'
            + '<textarea class="m-ta" id="mA" placeholder="Liquidity | The ability to pay short-term debts as they fall due | Current ratio = CA ÷ CL&#10;Solvency | … | …"></textarea></div>'
            + '<div class="m-hint">Definition or key facts can be left empty — “Term || facts” works too.</div>';
        }
        kind.onchange = paint;
        paint();
      });
  };
  ACTIONS['board-add-ok'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var kind = document.getElementById('mKind').value;
    var A = document.getElementById('mA');
    if (kind === 'topic') {
      if (!A.value.trim()) return;
      Store.addTopic(subj, A.value.trim());
      FX.toast('Topic added.', 'green');
    } else if (kind === 'section') {
      var t = subj.topics.filter(function (x) { return x.id === document.getElementById('mT').value; })[0];
      if (!t || !A.value.trim()) return;
      Store.addSection(t, A.value.trim(), (document.getElementById('mB').value || '').trim() || null);
      FX.toast('Section added.', 'green');
    } else {
      var sec = findSection(subj, document.getElementById('mSec').value);
      if (!sec) return;
      if (kind === 'item') {
        if (!A.value.trim()) return;
        Store.addItem(sec, A.value.trim(), document.getElementById('mB').value.trim(), document.getElementById('mC').value.trim());
        FX.toast('Item added — go earn its green.', 'green');
      } else {
        var n = 0;
        A.value.split('\n').forEach(function (line) {
          var parts = line.split('|').map(function (p) { return p.trim(); });
          if (!parts[0]) return;
          Store.addItem(sec, parts[0], parts[1] || '', parts[2] || '');
          n++;
        });
        FX.toast(n + ' items added ⚓', 'green');
      }
    }
    Modal.close();
    App.render();
  };
  function findSection(subj, secId) {
    var found = null;
    subj.topics.forEach(function (t) { t.sections.forEach(function (s2) { if (s2.id === secId) found = s2; }); });
    return found;
  }

  ACTIONS['item-edit'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-subj'));
    var itemId = el.getAttribute('data-id');
    var sec, item;
    subj.topics.forEach(function (t) { t.sections.forEach(function (s2) {
      s2.items.forEach(function (it) { if (it.id === itemId) { sec = s2; item = it; } });
    }); });
    if (!item) return;
    Modal.open('<div class="m-title">Edit “' + U.esc(item.term) + '”</div>'
      + '<div class="m-row"><label class="m-lbl">Term</label><input class="m-input" id="mTerm" value="' + U.esc(item.term) + '"></div>'
      + '<div class="m-row"><label class="m-lbl">Definition</label><textarea class="m-ta" id="mDef">' + U.esc(item.def || '') + '</textarea></div>'
      + '<div class="m-row"><label class="m-lbl">Key facts</label><textarea class="m-ta" id="mKey">' + U.esc(item.key || '') + '</textarea></div>'
      + '<div class="m-row"><label class="m-lbl">Your note (shown after reveal)</label><textarea class="m-ta" id="mNote" style="min-height:60px">' + U.esc(item.note || '') + '</textarea></div>'
      + '<div class="m-actions"><button class="btn warn" data-a="item-del" data-id="' + item.id + '" data-subj="' + subj.id + '" style="margin-right:auto">Delete item</button>'
      + '<button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="item-edit-ok" data-id="' + item.id + '" data-subj="' + subj.id + '">Save</button></div>');
  };
  ACTIONS['item-edit-ok'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-subj'));
    var itemId = el.getAttribute('data-id');
    subj.topics.forEach(function (t) { t.sections.forEach(function (s2) {
      s2.items.forEach(function (it) {
        if (it.id !== itemId) return;
        it.term = document.getElementById('mTerm').value.trim() || it.term;
        var d = document.getElementById('mDef').value.trim();
        var k = document.getElementById('mKey').value.trim();
        var n = document.getElementById('mNote').value.trim();
        if (d) it.def = d; else delete it.def;
        if (k) it.key = k; else delete it.key;
        if (n) it.note = n; else delete it.note;
      });
    }); });
    Store.save();
    Modal.close();
    App.render();
  };
  ACTIONS['item-del'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-subj'));
    var itemId = el.getAttribute('data-id');
    Modal.confirm('Delete this item?', 'Its study history goes with it.', 'Delete', true, function () {
      subj.topics.forEach(function (t) { t.sections.forEach(function (s2) { Store.deleteItem(s2, itemId); }); });
      App.render();
    });
  };

  /* ─── Event delegation & keyboard ────────────────────────────────────── */
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el !== document.body) {
      var a = el.getAttribute && el.getAttribute('data-a');
      if (a && ACTIONS[a]) { ACTIONS[a](el, ev); return; }
      el = el.parentNode;
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (App.route.v !== 'session' || !App.sess || App.sess.done) return;
    var s = App.sess;
    var inTa = document.activeElement && document.activeElement.id === 'sessTa';
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
    var ta = document.getElementById('sessTa');
    if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
    var nl = document.getElementById('nlInput');
    if (nl) {
      nl.focus();
      nl.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); ACTIONS['nl-check'](); } };
    }
  }

  /* ─── Boot ───────────────────────────────────────────────────────────── */
  Store.load();
  document.documentElement.setAttribute('data-theme', Store.data().settings.theme || 'dark');
  App.render();
})();

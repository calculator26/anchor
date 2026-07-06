/* ============================================================================
   Anchor · ui-main.js — router, harbour, subject board (Mode A),
   session player, editors, boot. Loads last.
   Content model the user sees: a subject has TABS, tabs hold CARDS.
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
      + ' · ' + verified + ' of ' + totalFacets + ' cards anchored</div>';

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
        + '<span class="pill">' + fs.length + ' cards</span>'
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
      + '<div style="margin:-26px 0 34px"><button class="linklike" data-a="import">…or import a subject file from a mate</button></div>'
      + '<div class="w-points">'
      + '<div class="w-point"><b>🧠 Retrieval, not re-reading</b><span>Reveal-and-grade turns every glance into practice testing — the #1 rated technique (g≈0.6 for high-schoolers).</span></div>'
      + '<div class="w-point"><b>📉 A real forgetting curve</b><span>FSRS-6 — the algorithm behind modern Anki — runs locally and knows when each fact will fade.</span></div>'
      + '<div class="w-point"><b>🟢 Green you can trust</b><span>A card is only anchored after three successful recalls — and it fades if you don’t come back.</span></div>'
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
    Store.save();
  };

  /* ══════════════════════════════════════════════════════════════════════
     SUBJECT BOARD (Mode A) — tabs across the top, cards below.
     ════════════════════════════════════════════════════════════════════ */
  function viewSubject() {
    var subj = Store.subjectById(App.route.id);
    if (!subj) return '<div class="empty">Subject not found.</div>';
    if (!subj.tabs.length) {
      return boardHead(subj) + '<div class="empty"><span class="big">🗺️</span>Empty board.<br>Make a tab for each area of the syllabus (e.g. “Finance — Role”), then fill it with cards.<br><br><button class="btn primary" data-a="board-add" data-id="' + subj.id + '">＋ Add your first tab</button></div>';
    }

    var tab = subj.tabs.filter(function (t) { return t.id === App.route.tab; })[0] || subj.tabs[0];
    var facet = subj.dual ? (App.route.f === 'key' ? 'key' : 'def') : 'card';

    var html = boardHead(subj);
    html += subjectStats(subj);

    // nav card: one row of tabs + review queue; second row only for dual style
    html += '<div class="navcard"><div class="topic-pills">';
    subj.tabs.forEach(function (t) {
      var keys = tabFacetKeys(subj, t);
      var v = keys.filter(Store.isVerified).length;
      html += '<button class="tp-pill' + (t === tab ? ' on' : '') + '" data-a="board-tab" data-id="' + subj.id + '" data-t="' + t.id + '">'
        + U.esc(t.name) + '<span class="fillbar" style="width:' + U.pct(v, keys.length) + '%"></span></button>';
    });
    var dueN = Store.dueFacets(subj.id).length;
    html += '<button class="review-btn' + (dueN ? ' has-due' : '') + '" data-a="review-subject" data-id="' + subj.id + '">'
      + '🔔 Review' + (dueN ? ' <span class="badge">' + dueN + '</span>' : '') + '</button>';
    html += '</div>';
    if (subj.dual) {
      html += '<div class="nav2"><div class="unit-tabs"></div><div class="facet-toggle">'
        + '<button class="ft-btn' + (facet === 'def' ? ' on' : '') + '" data-a="board-facet" data-f="def">Definitions</button>'
        + '<button class="ft-btn' + (facet === 'key' ? ' on' : '') + '" data-a="board-facet" data-f="key">Key facts</button>'
        + '</div></div>';
    }
    html += '</div>';

    // cards, clustered under their (optional) group headings
    var shown = 0, rated = 0, verifiedN = 0, num = 1, lastGroup = '~none~';
    tab.cards.forEach(function (card) {
      if (!Store.facetText(card, facet)) return;
      var grp = card.group || null;
      if (grp !== lastGroup) {
        lastGroup = grp;
        if (grp) {
          var gKeys = groupFacetKeys(subj, tab, grp);
          var gDone = gKeys.length && gKeys.every(Store.isVerified);
          html += '<div class="sec-head"><span>' + U.esc(grp) + '</span>'
            + '<span class="shp">' + tab.cards.filter(function (c) { return (c.group || null) === grp && Store.facetText(c, facet); }).map(function (c) {
              var k = 'f:' + c.id + ':' + facet;
              var st = Store.data().state[k];
              var cls = !st || !st.conf ? '' : st.conf === 'g' ? (Store.isVerified(k) ? 'g' : 'gu') : st.conf === 'a' ? 'a' : 'r';
              return '<i class="' + cls + '"></i>';
            }).join('') + '</span>'
            + (gDone ? '<span class="sec-badge">⚓ anchored</span>' : '')
            + '<button class="tool" title="Focus session on this group" data-a="drill-group" data-id="' + subj.id + '" data-t="' + tab.id + '" data-g="' + U.esc(grp) + '">▶</button>'
            + '</div>';
        } else {
          html += '<div class="sec-head"><span>&nbsp;</span></div>';
        }
      }
      html += itemCard(subj, tab, card, facet, num++);
      shown++;
      var st = Store.data().state['f:' + card.id + ':' + facet];
      if (st && st.conf) rated++;
      if (Store.isVerified('f:' + card.id + ':' + facet)) verifiedN++;
    });
    if (!shown) html += '<div class="empty">No cards in this tab yet.<br><br><button class="btn primary" data-a="board-add" data-id="' + subj.id + '">＋ Add cards</button></div>';

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
      + '<button class="btn" data-a="board-add" data-id="' + subj.id + '">＋ Add cards</button>'
      + '<button class="btn" data-a="share-subj" data-id="' + subj.id + '">⇪ Share</button>'
      + '<button class="btn" data-a="subject-edit" data-id="' + subj.id + '">✎ Edit</button>'
      + '</div></div>';
  }

  function subjectStats(subj) {
    var fs = Store.subjectFacets(subj);
    var c = { v: 0, a: 0, r: 0, u: 0 };
    fs.forEach(function (f) {
      var st = Store.data().state[f.key];
      if (Store.isVerified(f.key)) c.v++;
      else if (st && (st.conf === 'a' || st.conf === 'g')) c.a++;   // in progress (incl. green-tagged but unproven)
      else if (st && st.conf === 'r') c.r++;
      else c.u++;
    });
    var dueN = Store.dueFacets(subj.id).length;
    function sc(n, lbl, color, sub) {
      return '<div class="stat"><div class="n" style="color:' + color + '">' + n + '</div>'
        + '<div class="l"><span class="dot" style="background:' + color + '"></span>' + lbl + '</div><div class="sub">' + sub + '</div></div>';
    }
    return '<div class="statrow">'
      + sc(c.v, 'Anchored', 'var(--green)', '3+ successful recalls')
      + sc(c.a, 'Getting there', 'var(--amber)', 'keep recalling — 3 anchors it')
      + sc(c.r, 'Not yet', 'var(--red)', 'honest starting point')
      + sc(c.u, 'New', 'var(--text3)', 'not touched yet')
      + '<div class="stat click' + (dueN ? ' hot' : '') + '" data-a="review-subject" data-id="' + subj.id + '"><div class="n">' + dueN + '</div>'
      + '<div class="l">⚓ Due for review</div><div class="sub">' + (dueN ? 'tap to strengthen' : 'all holding strong') + '</div></div>'
      + '</div>';
  }

  function itemCard(subj, tab, card, facet, num) {
    var key = 'f:' + card.id + ':' + facet;
    var st = Store.data().state[key];
    var conf = st ? st.conf : null;
    var got = st ? st.got : 0;
    var hold = U.hold(key);
    var isDue = hold && hold.due;
    var revealed = !!REV[key];
    var verified = Store.isVerified(key);
    var CRIT = Store.GREEN_CRITERION;

    var html = '<div class="item ' + U.stClass(key) + '" data-card="' + key + '">';

    // term cell
    html += '<div class="cell cell-term"><div class="term-top"><span class="num">' + num + '</span>'
      + (isDue ? '<span class="due-pill">⚓ Review due</span>' : '')
      + (!verified && got > 0 && got < CRIT ? '<span class="pill" title="Successful recalls — ' + CRIT + ' anchors it">⚓ ' + got + '/' + CRIT + '</span>' : '')
      + '</div>'
      + '<div class="term">' + U.esc(card.term) + '</div></div>';

    // content cell
    html += '<div class="cell cell-content">'
      + '<div class="tools"><button class="tool" title="Edit this card" data-a="card-edit" data-id="' + card.id + '" data-subj="' + subj.id + '">✎</button></div>';
    if (!revealed) {
      var revLbl = facet === 'def' ? 'definition' : facet === 'key' ? 'key facts' : 'answer';
      html += '<div class="hidden-panel" data-a="reveal" data-k="' + key + '">👁 Reveal ' + revLbl + ' — try to say it first</div>';
    } else {
      html += '<div class="c-text">' + U.esc(Store.facetText(card, facet)) + '</div>'
        + (card.note ? '<div class="note-box"><span class="note-lbl">Note</span><span>' + U.esc(card.note) + '</span></div>' : '')
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
      + '<button class="cbtn g' + (conf === 'g' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="g"><span class="cdot"></span>Know it' + (conf === 'g' && !verified && got < CRIT ? '<span class="unv">' + got + '/' + CRIT + '</span>' : '') + '</button>'
      + '<button class="cbtn a' + (conf === 'a' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="a"><span class="cdot"></span>Getting there</button>'
      + '<button class="cbtn r' + (conf === 'r' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="r"><span class="cdot"></span>Not yet</button>'
      + '</div>';

    if (hold) {
      var col = U.holdColor(hold.r);
      html += '<div class="hold-line' + (isDue ? ' due' : '') + '">'
        + (isDue ? '⚓ Due — recall now ~' + hold.pct + '%' : 'Holding ' + hold.pct + '% · ~' + (hold.S < 1 ? '&lt;1' : Math.round(hold.S)) + 'd stability')
        + '</div><div class="hold-bar"><div class="hold-fill" style="width:' + hold.pct + '%;background:' + col + '"></div></div>';
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

  ACTIONS['board-tab'] = function (el) {
    App.go({ v: 'subject', id: el.getAttribute('data-id'), tab: el.getAttribute('data-t'), f: App.route.f });
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
    App.afterGradeCommon(res);
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

  ACTIONS['drill-group'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var tab = subj.tabs.filter(function (t) { return t.id === el.getAttribute('data-t'); })[0];
    if (!tab) return;
    var keys = groupFacetKeys(subj, tab, el.getAttribute('data-g'));
    keys.sort(function (a, b) {
      var ha = U.hold(a), hb = U.hold(b);
      return (ha ? ha.r : -1) - (hb ? hb.r : -1);
    });
    App.startSession(keys, { v: 'subject', id: subj.id, tab: tab.id }, el.getAttribute('data-g'));
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
     EDITORS — subjects, tabs, cards, bulk paste
     ════════════════════════════════════════════════════════════════════ */
  ACTIONS['subject-new'] = function () {
    Modal.open('<div class="m-title">New subject</div>'
      + '<div class="m-sub">A subject holds tabs (one per syllabus area), and tabs hold cards. That’s the whole structure.</div>'
      + '<div class="m-row"><label class="m-lbl">Name</label><input class="m-input" id="mName" placeholder="e.g. Legal Studies"></div>'
      + '<div class="m-row"><label class="m-lbl">Tagline (optional)</label><input class="m-input" id="mTag" placeholder="e.g. HSC · Crime · Human Rights"></div>'
      + '<div class="m-row"><label class="m-lbl">Card style</label><select class="m-select" id="mDual">'
      + '<option value="0">Simple flashcards — front / back (recommended)</option>'
      + '<option value="1">Dual — definition + key facts per term (Business-Studies style)</option>'
      + '</select></div>'
      + '<div class="m-row"><label class="m-lbl">Exam date (optional — powers the countdown &amp; schedule compression)</label><input class="m-input" type="date" id="mExam"></div>'
      + '<div class="m-actions"><button class="btn" data-a="import" style="margin-right:auto">⬆ Import a file instead</button>'
      + '<button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="subject-new-ok">Create subject</button></div>');
  };
  ACTIONS['subject-new-ok'] = function () {
    var name = document.getElementById('mName').value.trim();
    if (!name) return;
    var subj = Store.addSubject(name, document.getElementById('mTag').value.trim(),
      document.getElementById('mExam').value || null, document.getElementById('mDual').value === '1');
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
    Store.save();
    Modal.close();
    App.render();
  };

  // One simple Add flow: pick a tab (or make one), then add cards.
  ACTIONS['board-add'] = function (el) {
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
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="board-add-ok" data-id="' + subj.id + '">Add</button></div>',
      function (root) {
        root.querySelector('#mTab').onchange = function () {
          root.querySelector('#mNewTabRow').style.display = this.value === '__new' ? 'block' : 'none';
        };
        root.querySelector('#mKind').onchange = function () {
          root.querySelector('#mOne').style.display = this.value === 'one' ? 'block' : 'none';
          root.querySelector('#mBulk').style.display = this.value === 'bulk' ? 'block' : 'none';
        };
      });
  };
  ACTIONS['board-add-ok'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    var tabSel = document.getElementById('mTab').value;
    var tab;
    if (tabSel === '__new') {
      var tn = document.getElementById('mNewTab').value.trim();
      if (!tn) { FX.toast('Give the new tab a name first.', 'amber'); return; }
      tab = Store.addTab(subj, tn);
    } else {
      tab = subj.tabs.filter(function (t) { return t.id === tabSel; })[0];
    }
    if (!tab) return;
    var group = document.getElementById('mGroup').value.trim() || null;
    var kind = document.getElementById('mKind').value;
    var added = 0;

    if (kind === 'one') {
      var term = document.getElementById('mTerm').value.trim();
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
      added = 1;
    } else {
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
    }
    Modal.close();
    FX.toast(added + (added === 1 ? ' card' : ' cards') + ' added — go earn the green ⚓', 'green');
    App.go({ v: 'subject', id: subj.id, tab: tab.id, f: App.route.f });
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

/* ============================================================================
   Anchor · classroom.js — what tutors and students share.

   DECKS (managed content). A tutor publishes a subject / essay / chain from
   their own Anchor into the library (public.library_decks, versioned). Giving
   it to a student installs a LINKED copy into the student's document:
     - the same ids as the master, so progress survives every update;
     - tutor cards/tabs carry `lk:1` (locked) — the student can't edit them,
       but can add their own cards anywhere, and those are never touched;
     - the copy carries `src:{deck, v, by}`; when the tutor republishes, the
       student's app (or the tutor, immediately) applies the new version.

   ASSIGNMENTS (homework). Rows in public.assignments; progress is computed
   from the student's real study state — never self-reported:
     goal {type:'anchor', pct}  → % of in-scope facets anchored (3 recalls, green)
     goal {type:'reviews', n}   → reviews of in-scope facets since it was set

   On the student side this module renders the Homework + Notes strip on the
   Harbour and keeps managed decks up to date.
   ========================================================================== */
(function () {
  'use strict';

  window.ACTIONS = window.ACTIONS || {};
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function strip(o) { delete o.folderId; delete o.src; delete o.lk; delete o.pub; return o; }

  /* ─── Deck build / apply (pure functions on a document) ──────────────── */
  var Deck = {
    build: function (doc, kind, id) {
      var c = { kind: kind, essays: [], chains: [] };
      if (kind === 'subject') {
        var s = doc.subjects.find(function (x) { return x.id === id; });
        if (!s) return null;
        c.subject = strip(clone(s));
        c.subject.tabs.forEach(function (t) { delete t.lk; t.cards.forEach(function (cd) { delete cd.lk; }); });
        c.essays = doc.essays.filter(function (e) { return e.subjectId === id; }).map(function (e) { return strip(clone(e)); });
        var eids = c.essays.map(function (e) { return e.id; });
        c.chains = doc.chains.filter(function (ch) { return ch.subjectId === id || eids.indexOf(ch.essayId) >= 0; })
          .map(function (ch) { return strip(clone(ch)); });
        c.title = s.name;
      } else if (kind === 'essay') {
        var e = doc.essays.find(function (x) { return x.id === id; });
        if (!e) return null;
        c.essays = [strip(clone(e))];
        c.chains = doc.chains.filter(function (ch) { return ch.essayId === id; }).map(function (ch) { return strip(clone(ch)); });
        c.title = e.title;
      } else if (kind === 'chain') {
        var ch = doc.chains.find(function (x) { return x.id === id; });
        if (!ch) return null;
        var one = strip(clone(ch)); one.essayId = null;
        c.chains = [one];
        c.title = ch.title;
      } else return null;
      // chains in a deck don't point at subjects/essays that aren't in it
      var sid = c.subject ? c.subject.id : null;
      var eset = c.essays.map(function (x) { return x.id; });
      c.essays.forEach(function (x) { if (x.subjectId !== sid) x.subjectId = sid; });
      c.chains.forEach(function (x) {
        if (x.subjectId && x.subjectId !== sid) x.subjectId = sid;
        if (x.essayId && eset.indexOf(x.essayId) < 0) x.essayId = null;
      });
      return c;
    },

    count: function (c) {
      var n = 0;
      if (c && c.subject) c.subject.tabs.forEach(function (t) {
        t.cards.forEach(function (cd) { n += Store.cardModes(c.subject).filter(function (m) { return Store.facetText(cd, m); }).length; });
      });
      (c && c.chains || []).forEach(function (ch) { n += ch.sentences.length; });
      return n;
    },

    installed: function (doc) {
      var out = {};
      [doc.subjects || [], doc.essays || [], doc.chains || []].forEach(function (arr) {
        arr.forEach(function (x) { if (x.src && x.src.deck) out[x.src.deck] = Math.max(out[x.src.deck] || 0, x.src.v || 0); });
      });
      return out;
    },

    // Install or update deck `d` ({id, version, content, by}) inside `doc`.
    // opts.tabs = [tabIds] → grant just those tabs (added to anything already
    //             granted); students never see tabs they weren't given.
    // opts.all  = true     → grant the whole deck.
    // neither              → keep whatever was granted before (deck updates).
    apply: function (doc, d, opts) {
      opts = opts || {};
      var c = d.content || {};
      var dropKeys = [], added = 0;
      doc.subjects = doc.subjects || []; doc.essays = doc.essays || []; doc.chains = doc.chains || []; doc.state = doc.state || {};
      var granted = null;   // null = whole deck

      if (c.subject) {
        var i = doc.subjects.findIndex(function (s) { return s.id === c.subject.id || (s.src && s.src.deck === d.id); });
        var cur = i >= 0 ? doc.subjects[i] : null;
        var prev = cur && cur.src ? (cur.src.tabs || null) : (cur ? null : []);
        if (opts.all) granted = null;
        else if (opts.tabs && opts.tabs.length) granted = prev === null ? null : prev.concat(opts.tabs.filter(function (t) { return prev.indexOf(t) < 0; }));
        else granted = cur ? prev : null;

        var m = clone(c.subject);
        if (granted) m.tabs = m.tabs.filter(function (t) { return granted.indexOf(t.id) >= 0; });
        m.src = { deck: d.id, v: d.version, by: d.by || '' };
        if (granted) m.src.tabs = granted;
        var masterIds = {};
        m.tabs.forEach(function (t) { t.lk = 1; t.cards.forEach(function (cd) { cd.lk = 1; masterIds[cd.id] = true; }); });
        if (!cur) {
          doc.subjects.push(m);
          added = Object.keys(masterIds).length;
        } else {
          var had = {};
          cur.tabs.forEach(function (t) { t.cards.forEach(function (cd) { had[cd.id] = cd; }); });
          var mine = function (cd) { return !cd.lk && !masterIds[cd.id]; };
          var tabs = m.tabs.map(function (mt) {
            var ct = cur.tabs.find(function (t) { return t.id === mt.id; });
            if (ct) mt.cards = mt.cards.concat(ct.cards.filter(mine));
            return mt;
          });
          cur.tabs.forEach(function (ct) {
            if (m.tabs.some(function (t) { return t.id === ct.id; })) return;
            var own = ct.cards.filter(mine);
            if (!ct.lk) { ct.cards = own; tabs.push(ct); }
            else if (own.length) { ct.cards = own; delete ct.lk; tabs.push(ct); }
          });
          Object.keys(had).forEach(function (cid) {
            if (had[cid].lk && !masterIds[cid]) ['card', 'def', 'key'].forEach(function (md) { dropKeys.push('f:' + cid + ':' + md); });
          });
          Object.keys(masterIds).forEach(function (cid) { if (!had[cid]) added++; });
          m.tabs = tabs;
          if (cur.folderId) m.folderId = cur.folderId;
          if (cur.examDate) m.examDate = cur.examDate;      // the student's own exam date wins
          doc.subjects[i] = m;
        }
      } else if (opts.all === undefined && !opts.tabs) {
        granted = null;
      }

      // Essays and chains that ride along with a subject only come with the WHOLE deck.
      if (!granted) {
        var src = { deck: d.id, v: d.version, by: d.by || '' };
        (c.essays || []).forEach(function (e0) {
          var e = clone(e0); e.lk = 1; e.src = src;
          var j = doc.essays.findIndex(function (x) { return x.id === e.id; });
          if (j < 0) doc.essays.push(e);
          else { if (doc.essays[j].folderId) e.folderId = doc.essays[j].folderId; doc.essays[j] = e; }
        });
        var keepChains = {};
        (c.chains || []).forEach(function (c0) {
          var ch = clone(c0); ch.lk = 1; ch.src = src; keepChains[ch.id] = true;
          var j = doc.chains.findIndex(function (x) { return x.id === ch.id; });
          if (j < 0) { doc.chains.push(ch); added += ch.sentences.length; return; }
          var old = doc.chains[j];
          var sids = ch.sentences.map(function (sn) { return sn.id; });
          old.sentences.forEach(function (sn) { if (sids.indexOf(sn.id) < 0) dropKeys.push('c:' + ch.id + ':' + sn.id); });
          if (old.folderId) ch.folderId = old.folderId;
          if (!Merge.deq(old.sentences, ch.sentences)) delete doc.state['o:' + ch.id];   // order changed → re-earn it
          doc.chains[j] = ch;
        });
        doc.chains = doc.chains.filter(function (ch) {
          if (!ch.lk || !ch.src || ch.src.deck !== d.id || keepChains[ch.id]) return true;
          ch.sentences.forEach(function (sn) { dropKeys.push('c:' + ch.id + ':' + sn.id); });
          dropKeys.push('o:' + ch.id);
          return false;
        });
      }
      dropKeys.forEach(function (k) { delete doc.state[k]; });
      return { added: added, removed: dropKeys.length };
    }
  };

  /* ─── Assignment progress (pure, works on any document) ─────────────── */
  function scopeKeys(doc, scope) {
    var keys = [];
    if (!scope || !scope.id) return keys;
    if (scope.kind === 'subject') {
      var s = (doc.subjects || []).find(function (x) { return x.id === scope.id; });
      if (!s) return keys;
      s.tabs.forEach(function (t) {
        if (scope.tabs && scope.tabs.length && scope.tabs.indexOf(t.id) < 0) return;
        t.cards.forEach(function (cd) {
          Store.cardModes(s).forEach(function (m) { if (Store.facetText(cd, m)) keys.push('f:' + cd.id + ':' + m); });
        });
      });
    } else {
      var chains = scope.kind === 'essay'
        ? (doc.chains || []).filter(function (ch) { return ch.essayId === scope.id; })
        : (doc.chains || []).filter(function (ch) { return ch.id === scope.id; });
      chains.forEach(function (ch) {
        ch.sentences.forEach(function (sn) { keys.push('c:' + ch.id + ':' + sn.id); });
        keys.push('o:' + ch.id);
      });
    }
    return keys;
  }
  function verifiedIn(doc, k) {
    var st = doc.state && doc.state[k];
    return !!(st && st.conf === 'g' && (st.got || 0) >= Store.GREEN_CRITERION);
  }
  function progress(doc, a) {
    var keys = scopeKeys(doc, a.scope);
    var goal = a.goal || { type: 'anchor', pct: 100 };
    var v = 0, reviews = 0, since = a.created_at || '';
    keys.forEach(function (k) {
      if (verifiedIn(doc, k)) v++;
      var st = doc.state && doc.state[k];
      if (st && st.hist) st.hist.forEach(function (h) { if (h.t >= since) reviews++; });
    });
    var frac;
    if (!keys.length) frac = 0;
    else if (goal.type === 'reviews') frac = Math.min(1, reviews / Math.max(1, goal.n || 1));
    else frac = Math.min(1, (v / keys.length) / Math.max(0.01, (goal.pct || 100) / 100));
    return {
      n: keys.length, v: v, reviews: reviews, frac: frac, pct: Math.round(frac * 100), done: keys.length > 0 && frac >= 1,
      missing: keys.length === 0,
      label: goal.type === 'reviews' ? Math.min(reviews, goal.n) + '/' + goal.n + ' reviews' : v + '/' + keys.length + ' anchored'
    };
  }
  function goalText(g) {
    g = g || {};
    if (g.type === 'reviews') return 'Do ' + g.n + ' reviews';
    return (g.pct && g.pct < 100 ? 'Anchor ' + g.pct + '%' : 'Anchor every card');
  }
  function dueText(due) {
    if (!due) return '';
    var d = U.daysUntil(due);
    if (d < 0) return 'overdue ' + (-d === 1 ? '1 day' : -d + ' days');
    if (d === 0) return 'due today';
    if (d === 1) return 'due tomorrow';
    return 'due ' + U.fmtDate(due);
  }

  // Study order for homework: what isn't anchored yet first, then fading anchors.
  function homeworkQueue(doc, a) {
    var keys = scopeKeys(doc, a.scope).filter(function (k) { return k.charAt(0) !== 'o'; });
    var ret = (doc.settings && doc.settings.retention) || 0.9;
    function rank(k) {
      var st = doc.state[k];
      if (!st || !st.conf) return 2;
      if (st.conf === 'r') return 0;
      if (!verifiedIn(doc, k)) return 1;
      var r = st.srs ? FSRS.rNow(st.srs) : 1;
      return r !== null && r <= ret ? 3 : 9;
    }
    var ranked = keys.map(function (k, i) { return { k: k, r: rank(k), i: i }; }).filter(function (x) { return x.r < 9; });
    ranked.sort(function (x, y) { return x.r - y.r || x.i - y.i; });
    return ranked.slice(0, 30).map(function (x) { return x.k; });
  }

  /* ─── Student side: homework + notes for the signed-in student ─────── */
  var ST = { assigns: [], notes: [], tutors: {}, loaded: false, busy: false, lastUpdateCheck: 0 };

  function refresh() {
    if (!window.Cloud || !Cloud.user() || Store.lens() || ST.busy) return;
    var sb = Cloud.client(), me = Cloud.user().id;
    ST.busy = true;
    Promise.all([
      sb.from('assignments').select('*').eq('student_id', me).neq('status', 'archived').order('created_at', { ascending: false }),
      sb.from('notes').select('*').eq('to_id', me).is('read_at', null).order('created_at', { ascending: false }).limit(20)
    ]).then(function (r) {
      ST.assigns = (r[0].data || []);
      ST.notes = (r[1].data || []);
      var ids = {};
      ST.assigns.forEach(function (a) { ids[a.tutor_id] = 1; });
      ST.notes.forEach(function (n) { ids[n.from_id] = 1; });
      var meP = Cloud.me(); if (meP && meP.tutor_id) ids[meP.tutor_id] = 1;
      var need = Object.keys(ids).filter(function (id) { return !ST.tutors[id]; });
      return (need.length ? sb.from('profiles').select('user_id, display_name, email').in('user_id', need) : Promise.resolve({ data: [] }))
        .then(function (p) {
          (p.data || []).forEach(function (x) { ST.tutors[x.user_id] = x.display_name || (x.email || '').split('@')[0]; });
        });
    }).then(function () {
      ST.loaded = true; ST.busy = false;
      return selfUpdate();
    }).then(function () {
      checkCompletions();
      if (App.route.v === 'home' && !Store.lens()) App.render();
    }).catch(function (e) { ST.busy = false; console.warn('Anchor classroom:', e && e.message); });
  }

  // Install assigned decks that are missing; apply newer versions of installed ones.
  function selfUpdate() {
    if (Store.lens()) return Promise.resolve();
    var doc = Store.data();
    var inst = Deck.installed(doc);
    var want = {};
    Object.keys(inst).forEach(function (id) { want[id] = 1; });
    ST.assigns.forEach(function (a) { if (a.deck_id && a.status === 'active') want[a.deck_id] = 1; });
    var ids = Object.keys(want);
    if (!ids.length) return Promise.resolve();
    var sb = Cloud.client();
    return sb.from('library_decks').select('id, version, owner_id, title').in('id', ids).then(function (res) {
      var stale = (res.data || []).filter(function (d) { return !inst[d.id] || d.version > inst[d.id]; });
      // missing decks only matter if an active assignment wants them
      stale = stale.filter(function (d) { return inst[d.id] || ST.assigns.some(function (a) { return a.deck_id === d.id && a.status === 'active'; }); });
      if (!stale.length) return;
      return sb.from('library_decks').select('id, version, owner_id, title, content').in('id', stale.map(function (d) { return d.id; })).then(function (r2) {
        if (Store.lens()) return;
        var msgs = [];
        (r2.data || []).forEach(function (d) {
          var by = ST.tutors[d.owner_id] || 'your tutor';
          var was = inst[d.id];
          var grant = was ? {} : grantFor(d.id);
          var res2 = Deck.apply(Store.data(), { id: d.id, version: d.version, content: d.content, by: by }, grant);
          msgs.push(was ? by + ' updated “' + d.title + '”' + (res2.added ? ' · ' + U.plural(res2.added, 'new card') : '')
                        : by + ' added “' + d.title + '” to your Anchor');
        });
        if (msgs.length) { Store.save(); FX.toast('⚓ ' + msgs.join(' · '), 'green', 4200); }
      });
    });
  }

  // Which tabs this student's active homework grants for a deck (all = no tab limit).
  function grantFor(deckId) {
    var tabs = [], all = false;
    ST.assigns.forEach(function (a) {
      if (a.deck_id !== deckId || a.status === 'archived') return;
      if (a.scope && a.scope.tabs && a.scope.tabs.length) a.scope.tabs.forEach(function (t) { if (tabs.indexOf(t) < 0) tabs.push(t); });
      else all = true;
    });
    return all || !tabs.length ? { all: true } : { tabs: tabs };
  }

  function checkCompletions() {
    if (Store.lens()) return;
    var doc = Store.data();
    ST.assigns.forEach(function (a) {
      var p = progress(doc, a);
      if (a.status === 'active' && p.done) {
        a.status = 'done';
        Cloud.rpc('complete_assignment', { p_id: a.id, p_done: true });
        FX.banner('🎯', 'Homework done', a.title);
      }
    });
  }

  // Assignments visible in the current context (yours, or the student you're viewing as).
  function visibleAssigns() {
    var l = Store.lens();
    if (l) return (window.Teach && Teach.assignsFor) ? Teach.assignsFor(l.uid) : [];
    return ST.assigns;
  }

  function homeHTML() {
    var list = visibleAssigns().filter(function (a) { return a.status !== 'archived'; });
    var notes = Store.lens() ? [] : ST.notes;
    if (!list.length && !notes.length) return '';
    var doc = Store.data(), html = '';
    if (notes.length) {
      html += '<div class="notes-strip">' + notes.map(function (n) {
        var ctx = n.facet ? Store.resolveFacet(n.facet) : null;
        var about = ctx ? (ctx.card ? ctx.card.term : ctx.chain ? ctx.chain.title : '') : '';
        return '<div class="note-card"><div class="note-from">' + U.icon('bell', 'sm') + 'Note from ' + U.esc(ST.tutors[n.from_id] || 'your tutor')
          + '<span class="muted"> · ' + U.ago(n.created_at) + '</span></div>'
          + (about ? '<div class="note-about">About: <b>' + U.esc(about) + '</b></div>' : '')
          + '<div class="note-body">' + U.esc(n.body) + '</div>'
          + '<button class="btn sm" data-a="note-read" data-id="' + n.id + '">' + U.icon('check') + 'Got it</button></div>';
      }).join('') + '</div>';
    }
    if (list.length) {
      var active = list.filter(function (a) { return a.status === 'active'; });
      var done = list.filter(function (a) { return a.status === 'done'; }).slice(0, 3);
      active.sort(function (a, b) { return (a.due_on || '9999') < (b.due_on || '9999') ? -1 : 1; });
      var by = ST.tutors[(active[0] || list[0]).tutor_id];
      html += '<div class="sec-title"><span>Homework</span>' + (by && !Store.lens() ? '<span class="muted">— from ' + U.esc(by) + '</span>' : '') + '</div>';
      html += '<div class="hw-grid">' + active.concat(done).map(function (a) { return hwCard(doc, a); }).join('') + '</div>';
    }
    return html;
  }

  function hwCard(doc, a) {
    var p = progress(doc, a);
    var d = a.due_on ? U.daysUntil(a.due_on) : null;
    var cls = a.status === 'done' || p.done ? ' done' : d !== null && d < 0 ? ' overdue' : d !== null && d <= 1 ? ' soon' : '';
    var openHref = a.scope && a.scope.kind === 'subject' ? '#/subject/' + encodeURIComponent(a.scope.id)
      : a.scope && a.scope.kind === 'essay' ? '#/essay/' + encodeURIComponent(a.scope.id)
      : a.scope && a.scope.kind === 'chain' ? '#/chain/' + encodeURIComponent(a.scope.id) : '';
    return '<div class="hw-card' + cls + '">'
      + '<div class="hw-top">' + U.ring(p.pct, 46)
      + '<div class="hw-body"><div class="hw-title">' + U.esc(a.title) + '</div>'
      + '<div class="hw-meta">' + U.esc(goalText(a.goal)) + (a.due_on ? ' · <span class="hw-due">' + dueText(a.due_on) + '</span>' : '') + '</div>'
      + '<div class="hw-meta muted">' + (p.missing ? 'Syncing content…' : p.label) + '</div></div></div>'
      + (a.note ? '<div class="hw-note">“' + U.esc(a.note) + '”</div>' : '')
      + '<div class="hw-actions">'
      + (a.status === 'done' || p.done ? '<span class="pill ok">' + U.icon('check', 'xs') + ' Done</span>'
        : '<button class="btn primary sm" data-a="hw-start" data-id="' + a.id + '">' + U.icon('play') + 'Start</button>')
      + (openHref ? '<a class="btn sm" href="' + openHref + '">Open</a>' : '')
      + '</div></div>';
  }

  ACTIONS['hw-start'] = function (el) {
    var a = visibleAssigns().find(function (x) { return x.id === el.getAttribute('data-id'); });
    if (!a) return;
    var keys = homeworkQueue(Store.data(), a);
    if (!keys.length) {
      if (a.scope && a.scope.kind !== 'subject') { App.go(a.scope.kind === 'essay' ? { v: 'essay', id: a.scope.id } : { v: 'chain', id: a.scope.id }); return; }
      FX.toast('Everything here is anchored and holding — nice.', 'green'); return;
    }
    App.startSession(keys, { v: 'home' }, 'Homework · ' + a.title);
  };
  ACTIONS['note-read'] = function (el) {
    var id = el.getAttribute('data-id');
    ST.notes = ST.notes.filter(function (n) { return n.id !== id; });
    Cloud.rpc('mark_note_read', { p_id: id });
    App.render();
  };

  // Locked (tutor-managed) content helpers for the editors
  function lockedCard(card) { return !!(card && card.lk) && !Store.lens(); }
  function managedBy(item) { return item && item.src ? (item.src.by || 'your tutor') : ''; }

  window.Deck = Deck;
  window.Classroom = {
    refresh: refresh,
    selfUpdate: selfUpdate,
    homeHTML: homeHTML,
    progress: progress,
    scopeKeys: scopeKeys,
    homeworkQueue: homeworkQueue,
    goalText: goalText,
    dueText: dueText,
    verifiedIn: verifiedIn,
    lockedCard: lockedCard,
    managedBy: managedBy,
    hwCard: hwCard,
    state: ST
  };
})();

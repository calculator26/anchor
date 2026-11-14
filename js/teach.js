/* ============================================================================
   Anchor · teach.js — the tutor's side of Anchor.

   #/teach              Students — your roster, drag decks onto students/groups
   #/teach/homework     every assignment, with live progress
   #/teach/library      publish subjects/essays/chains from your Anchor as decks
   #/teach/groups       classes; assign to a whole group at once
   #/teach/student/:id  one student: lesson brief (most-missed, fading, typed
                        answers to check), homework, messages, private notes,
                        "Open their Anchor" and "Quiz them" (tutor-graded)

   Everything here is enforced by the database (RLS): a tutor only ever sees
   and edits their own students; the admin sees everyone. `Staff` is the data
   cache shared with admin.js.
   ========================================================================== */
(function () {
  'use strict';

  window.ACTIONS = window.ACTIONS || {};
  var esc = function (s) { return U.esc(s); };

  /* ─── Staff data cache (shared with admin.js) ─────────────────────────── */
  var Staff = window.Staff = {
    roster: null, decks: null, groups: null, members: null, assigns: null,
    docs: {}, notes: {}, priv: {}, deckContent: {}, loading: false, err: '',

    sb: function () { return Cloud.client(); },
    meId: function () { return Cloud.user() && Cloud.user().id; },

    load: function (force) {
      if (Staff.loading && Staff._p) return Staff._p;          // join the request already in flight
      if (!force && Staff.roster) return Promise.resolve();
      Staff.loading = true; Staff.err = '';
      var sb = Staff.sb();
      Staff._p = Promise.all([
        Cloud.rpc('roster'),
        sb.from('library_decks').select('id, owner_id, kind, source_id, title, description, version, card_count, archived, published_at').order('published_at', { ascending: false }),
        sb.from('groups').select('*').order('created_at'),
        sb.from('group_members').select('*'),
        sb.from('assignments').select('*').neq('status', 'archived').order('created_at', { ascending: false })
      ]).then(function (r) {
        Staff.loading = false;
        var bad = r.find(function (x) { return x.error; });
        if (bad) { Staff.err = bad.error.message; return; }
        Staff.roster = r[0].data || [];
        Staff.decks = r[1].data || [];
        Staff.groups = r[2].data || [];
        Staff.members = r[3].data || [];
        Staff.assigns = r[4].data || [];
      }, function (e) { Staff.loading = false; Staff.err = (e && e.message) || 'Couldn’t load'; });
      return Staff._p;
    },
    reload: function () { return Staff.load(true).then(rerender); },

    person: function (uid) { return (Staff.roster || []).find(function (p) { return p.user_id === uid; }) || null; },
    name: function (p) {
      if (typeof p === 'string') p = Staff.person(p);
      if (!p) return 'Unknown';
      return p.display_name || (p.email || '').split('@')[0] || 'Unnamed';
    },
    myStudents: function () {
      var me = Staff.meId();
      return (Staff.roster || []).filter(function (p) { return p.role === 'student' && (p.tutor_id === me || Cloud.isAdmin()); });
    },
    groupMembers: function (gid) {
      return (Staff.members || []).filter(function (m) { return m.group_id === gid; }).map(function (m) { return m.student_id; });
    },
    groupsOf: function (uid) {
      var gids = (Staff.members || []).filter(function (m) { return m.student_id === uid; }).map(function (m) { return m.group_id; });
      return (Staff.groups || []).filter(function (g) { return gids.indexOf(g.id) >= 0; });
    },
    loadDoc: function (uid, force) {
      if (!force && Staff.docs[uid]) return Promise.resolve(Staff.docs[uid]);
      return Cloud.fetchRow(uid).then(function (row) {
        Staff.docs[uid] = row ? { data: row.data, rev: row.rev, at: row.updated_at, by: row.updated_by } : { data: Store.blankDoc(), rev: 0, at: null };
        return Staff.docs[uid];
      });
    },
    deck: function (id) { return (Staff.decks || []).find(function (d) { return d.id === id; }) || null; },
    loadDeckContent: function (id) {
      if (Staff.deckContent[id]) return Promise.resolve(Staff.deckContent[id]);
      return Staff.sb().from('library_decks').select('content, version').eq('id', id).single().then(function (res) {
        if (res.error) throw res.error;
        Staff.deckContent[id] = res.data.content;
        return res.data.content;
      });
    },
    audit: function (target, action, detail) {
      return Staff.sb().from('admin_audit').insert({ actor: Staff.meId(), target: target, action: action, detail: detail || {} }).then(function () {});
    }
  };

  // Re-render the staff page when data lands — but never under someone's
  // fingers: if they're typing in a field, wait until they leave it.
  var pendingRender = false;
  function rerender() {
    var v = App.route.v;
    if (!(v === 'teach' || v === 'student' || v === 'admin' || v === 'adminUser')) return;
    var a = document.activeElement;
    var typing = a && a.closest && a.closest('#view') && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.id !== 'admSearch'));
    if (typing) {
      if (!pendingRender) { pendingRender = true; a.addEventListener('blur', function () { setTimeout(function () { pendingRender = false; rerender(); }, 150); }, { once: true }); }
      return;
    }
    App.render();
  }
  Staff.rerender = rerender;
  function loading(msg) { return '<div class="staff-loading"><div class="spinner"></div>' + esc(msg || 'Loading…') + '</div>'; }
  function errBox() { return '<div class="staff-err">Couldn’t load: ' + esc(Staff.err) + ' <button class="btn sm" data-a="staff-reload">Retry</button></div>'; }
  ACTIONS['staff-reload'] = function () { Staff.reload(); };

  /* ─── Study analytics on any document ─────────────────────────────────── */
  var Ana = window.Ana = {
    actDays: function (doc, n) {
      var out = [], d = new Date();
      for (var i = n - 1; i >= 0; i--) {
        var dt = new Date(d); dt.setDate(d.getDate() - i);
        var k = Store.todayISO(dt), a = (doc.act || {})[k];
        out.push({ day: k, n: a ? a.n : 0, got: a ? a.got : 0, miss: a ? a.miss : 0 });
      }
      return out;
    },
    // what a facet key looks like inside `doc` (doc-agnostic resolveFacet)
    describe: function (doc, key) {
      var p = key.split(':');
      if (p[0] === 'f') {
        for (var i = 0; i < doc.subjects.length; i++) {
          var s = doc.subjects[i];
          for (var j = 0; j < s.tabs.length; j++) {
            var c = s.tabs[j].cards.find(function (x) { return x.id === p[1]; });
            if (c) return { q: c.term, a: Store.facetText(c, p[2]), where: (s.dual ? U.modeLabel(p[2]) + ' · ' : '') + s.name + ' · ' + s.tabs[j].name, mode: p[2] };
          }
        }
      } else if (p[0] === 'c' || p[0] === 'o') {
        var ch = doc.chains.find(function (x) { return x.id === p[1]; });
        if (!ch) return null;
        if (p[0] === 'o') return { q: 'Order of “' + ch.title + '”', a: ch.sentences.map(function (s2) { return s2.kw; }).join(' → '), where: ch.title };
        var sn = ch.sentences.find(function (x) { return x.id === p[2]; });
        if (sn) return { q: sn.kw, a: sn.text, where: ch.title };
      }
      return null;
    },
    mostMissed: function (doc, days, limit) {
      var since = new Date(Date.now() - days * 864e5).toISOString(), out = [];
      Object.keys(doc.state || {}).forEach(function (k) {
        var st = doc.state[k];
        if (!st || !st.hist) return;
        var miss = 0, tries = 0;
        st.hist.forEach(function (h) { if (h.t >= since) { tries++; if (h.g === 1) miss++; } });
        if (miss) out.push({ key: k, miss: miss, tries: tries, st: st });
      });
      out.sort(function (a, b) { return b.miss - a.miss || b.tries - a.tries; });
      return out.filter(function (x) { return Ana.describe(doc, x.key); }).slice(0, limit || 10);
    },
    fading: function (doc, limit) {
      var ret = (doc.settings && doc.settings.retention) || 0.9, out = [];
      Object.keys(doc.state || {}).forEach(function (k) {
        if (k.charAt(0) === 'o' || !Classroom.verifiedIn(doc, k)) return;
        var st = doc.state[k], r = st.srs ? FSRS.rNow(st.srs) : null;
        if (r !== null && r < ret + 0.04) out.push({ key: k, r: r });
      });
      out.sort(function (a, b) { return a.r - b.r; });
      return out.filter(function (x) { return Ana.describe(doc, x.key); }).slice(0, limit || 10);
    },
    typed: function (doc, days, limit) {
      var since = new Date(Date.now() - days * 864e5).toISOString(), out = [];
      Object.keys(doc.state || {}).forEach(function (k) {
        var st = doc.state[k];
        if (st && st.ans && st.ans.t >= since && !st.ans.ok) out.push({ key: k, ans: st.ans });
      });
      out.sort(function (a, b) { return a.ans.t < b.ans.t ? 1 : -1; });
      return out.filter(function (x) { return Ana.describe(doc, x.key); }).slice(0, limit || 12);
    },
    tally: function (doc) {
      var n = 0, v = 0;
      Object.keys(doc.state || {}).forEach(function (k) { if (Classroom.verifiedIn(doc, k)) v++; });
      (doc.subjects || []).forEach(function (s) { n += Store.subjectFacets(s).length; });
      (doc.chains || []).forEach(function (c) { n += c.sentences.length; });
      return { n: n, v: v };
    },
    subjectRows: function (doc) {
      return (doc.subjects || []).map(function (s) {
        var fs = Store.subjectFacets(s), v = fs.filter(function (f) { return Classroom.verifiedIn(doc, f.key); }).length;
        return { name: s.name, n: fs.length, v: v, src: s.src };
      }).concat((doc.essays || []).map(function (e) {
        var keys = [];
        doc.chains.filter(function (c) { return c.essayId === e.id; }).forEach(function (c) { c.sentences.forEach(function (sn) { keys.push('c:' + c.id + ':' + sn.id); }); });
        return { name: e.title, n: keys.length, v: keys.filter(function (k) { return Classroom.verifiedIn(doc, k); }).length, essay: true, src: e.src };
      }));
    }
  };

  /* ─── Shared bits of UI ───────────────────────────────────────────────── */
  function initials(name) {
    return (name || '?').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '?';
  }
  function avatar(p, size) {
    var name = Staff.name(p), h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return '<span class="avatar" style="--h:' + h + (size ? ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.4) + 'px' : '') + '">' + esc(initials(name)) + '</span>';
  }
  function lastStudied(p) {
    if (!p.last_study_day) return '<span class="muted">never studied</span>';
    var d = Math.round((Date.parse(Store.todayISO() + 'T12:00') - Date.parse(p.last_study_day + 'T12:00')) / 864e5);
    var cls = d <= 1 ? 'ok' : d <= 4 ? '' : 'stale';
    return '<span class="ls ' + cls + '">' + (d === 0 ? 'studied today' : d === 1 ? 'studied yesterday' : 'studied ' + d + 'd ago') + '</span>';
  }
  function tabs(cur) {
    var t = [['students', 'Students', '#/teach'], ['homework', 'Homework', '#/teach/homework'], ['library', 'Library', '#/teach/library'], ['groups', 'Groups', '#/teach/groups']];
    return '<div class="staff-tabs">' + t.map(function (x) {
      return '<a class="tabp' + (cur === x[0] ? ' on' : '') + '" href="' + x[2] + '">' + x[1] + '</a>';
    }).join('') + (Cloud.isAdmin() ? '<a class="tabp admin-link" href="#/admin">' + U.icon('settings', 'sm') + ' Admin</a>' : '') + '</div>';
  }
  function deckChip(d, extra) {
    return '<button class="deck-chip" draggable="true" data-deck="' + d.id + '" data-a="assign-open" data-deck-id="' + d.id + '"' + (extra || '') + ' title="Drag onto a student or group — or click to assign">'
      + U.icon(d.kind === 'subject' ? 'book' : d.kind === 'essay' ? 'doc' : 'chain', 'sm')
      + '<span>' + esc(d.title) + '</span><em>v' + d.version + '</em></button>';
  }

  /* ─── Views ───────────────────────────────────────────────────────────── */
  var Teach = window.Teach = {};
  Teach.prefetch = function () { Staff.load(); };
  Teach.assignsFor = function (uid) {
    return (Staff.assigns || []).filter(function (a) { return a.student_id === uid; });
  };

  Teach.view = function (route) {
    if (!Cloud.isTutor()) return '<div class="staff-err">This area is for tutors.</div>';
    if (!Staff.roster) { if (!Staff.err) Staff.load().then(rerender); return Staff.err ? errBox() : loading('Loading your students…'); }
    var tab = route.tab || 'students';
    var head = '<div class="page-head"><div><div class="eyebrow">Tutor</div><h1>Teaching</h1>'
      + '<div class="ph-sub">' + U.plural(Staff.myStudents().length, 'student') + ' · ' + U.plural((Staff.decks || []).filter(function (d) { return !d.archived; }).length, 'deck') + ' in your library</div></div>'
      + '<div class="ph-actions"><button class="btn" data-a="staff-reload" title="Refresh">↻</button>'
      + '<button class="btn" data-a="assign-open">' + U.icon('target') + 'Set homework</button>'
      + '<button class="btn primary" data-a="acct-new">' + U.icon('plus') + 'New student</button></div></div>';
    var body = tab === 'homework' ? viewHomework() : tab === 'library' ? viewLibrary() : tab === 'groups' ? viewGroups() : viewStudents();
    return head + tabs(tab) + body;
  };

  function viewStudents() {
    var studs = Staff.myStudents();
    var decks = (Staff.decks || []).filter(function (d) { return !d.archived; });
    var html = '';
    // attention strip
    var today = Store.todayISO();
    var overdue = (Staff.assigns || []).filter(function (a) { return a.status === 'active' && a.due_on && a.due_on < today; });
    var quiet = studs.filter(function (p) {
      if ((Date.now() - Date.parse(p.created_at)) / 864e5 < 3) return false;     // just joined
      return !p.last_study_day || (Date.parse(today) - Date.parse(p.last_study_day)) / 864e5 >= 3;
    });
    var week = studs.reduce(function (s, p) { return s + (p.reviews_7d || 0); }, 0);
    html += '<div class="today staff-today">'
      + '<div class="tile"><div class="t-lbl">' + U.icon('target', 'sm') + 'Reviews this week</div><div class="t-mid">' + week + '</div><div class="t-sub">across all your students</div></div>'
      + '<div class="tile' + (overdue.length ? ' warnt' : '') + '"><div class="t-lbl">' + U.icon('bell', 'sm') + 'Overdue homework</div><div class="t-mid">' + overdue.length + '</div><div class="t-sub">' + (overdue.length ? overdue.slice(0, 3).map(function (a) { return esc(Staff.name(a.student_id)); }).join(', ') : 'all on track') + '</div></div>'
      + '<div class="tile' + (quiet.length ? ' warnt' : '') + '"><div class="t-lbl">💤 Gone quiet (3+ days)</div><div class="t-mid">' + quiet.length + '</div><div class="t-sub">' + (quiet.length ? quiet.slice(0, 3).map(function (p) { return esc(Staff.name(p)); }).join(', ') : 'everyone’s studying') + '</div></div>'
      + '</div>';

    // library rail
    html += '<div class="sec-title"><span>Your decks</span><span class="muted hide-sm">— drag onto a student or group to set homework</span><a class="sec-link" href="#/teach/library">Library' + U.icon('chevR', 'sm') + '</a></div>';
    html += decks.length ? '<div class="deck-rail">' + decks.map(function (d) { return deckChip(d); }).join('') + '</div>'
      : '<div class="empty-hint">No decks yet. <a href="#/teach/library">Publish a subject from your Anchor</a> — e.g. your Business Studies — and it becomes a deck you can hand out.</div>';

    // groups
    if ((Staff.groups || []).length) {
      html += '<div class="sec-title"><span>Groups</span><a class="sec-link" href="#/teach/groups">Manage' + U.icon('chevR', 'sm') + '</a></div><div class="group-rail">'
        + Staff.groups.map(function (g) {
          return '<div class="group-chip" data-drop-group="' + g.id + '"><b>' + esc(g.name) + '</b><span>' + U.plural(Staff.groupMembers(g.id).length, 'student') + '</span></div>';
        }).join('') + '</div>';
    }

    html += '<div class="sec-title"><span>Students</span></div>';
    if (!studs.length) {
      html += '<div class="empty-hint">No students yet. Hit <b>New student</b> to make an account for one (you choose their password and can preload decks)'
        + (Cloud.isAdmin() ? ', or mark existing users as students from the <a href="#/admin">Admin</a> panel.' : '.') + '</div>';
      return html;
    }
    studs.sort(function (a, b) { return Staff.name(a).localeCompare(Staff.name(b)); });
    html += '<div class="stu-grid">' + studs.map(studentCard).join('') + '</div>';
    return html;
  }

  function studentCard(p) {
    var as = Teach.assignsFor(p.user_id).filter(function (a) { return a.status === 'active'; });
    var od = as.filter(function (a) { return a.due_on && a.due_on < Store.todayISO(); }).length;
    return '<a class="stu-card" href="#/teach/student/' + p.user_id + '" data-drop-student="' + p.user_id + '">'
      + '<div class="stu-top">' + avatar(p, 40) + '<div class="stu-id"><div class="stu-name">' + esc(Staff.name(p)) + '</div>'
      + '<div class="stu-sub">' + (p.year_level ? esc(p.year_level) + ' · ' : '') + lastStudied(p) + '</div></div></div>'
      + '<div class="stu-stats"><div><b>' + (p.streak || 0) + '</b><span>streak</span></div><div><b>' + (p.reviews_7d || 0) + '</b><span>reviews 7d</span></div>'
      + '<div><b>' + (p.anchored || 0) + '</b><span>anchored</span></div></div>'
      + '<div class="stu-hw">' + (as.length ? '<span class="pill' + (od ? ' due' : '') + '">' + U.plural(as.length, 'task') + (od ? ' · ' + od + ' overdue' : '') + '</span>' : '<span class="pill">no homework</span>')
      + Staff.groupsOf(p.user_id).map(function (g) { return '<span class="pill">' + esc(g.name) + '</span>'; }).join('') + '</div>'
      + '<div class="drop-hint">Drop to assign</div></a>';
  }

  /* — Homework board — */
  function viewHomework() {
    var list = (Staff.assigns || []).slice();
    if (!list.length) return '<div class="empty-hint">No homework set yet. Drag a deck onto a student, or hit <b>Set homework</b>.</div>';
    // progress needs each student's document
    var need = {};
    list.forEach(function (a) { if (!Staff.docs[a.student_id]) need[a.student_id] = 1; });
    var ids = Object.keys(need);
    if (ids.length) {
      Promise.all(ids.map(function (id) { return Staff.loadDoc(id).catch(function () {}); })).then(rerender);
      return loading('Checking progress…');
    }
    var today = Store.todayISO();
    list.sort(function (a, b) {
      var ka = (a.status === 'done' ? '2' : a.due_on && a.due_on < today ? '0' : '1') + (a.due_on || '9999');
      var kb = (b.status === 'done' ? '2' : b.due_on && b.due_on < today ? '0' : '1') + (b.due_on || '9999');
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return '<div class="hw-table">' + list.map(function (a) {
      var doc = Staff.docs[a.student_id].data, p = Classroom.progress(doc, a);
      var over = a.status === 'active' && a.due_on && a.due_on < today;
      return '<div class="hw-row' + (over ? ' overdue' : '') + (a.status === 'done' || p.done ? ' done' : '') + '">'
        + '<a class="hw-who" href="#/teach/student/' + a.student_id + '">' + avatar(a.student_id, 28) + '<span>' + esc(Staff.name(a.student_id)) + '</span></a>'
        + '<div class="hw-what"><b>' + esc(a.title) + '</b><span class="muted">' + esc(Classroom.goalText(a.goal)) + (a.due_on ? ' · ' + Classroom.dueText(a.due_on) : '') + '</span></div>'
        + '<div class="hw-prog"><div class="bar"><span style="width:' + p.pct + '%"></span></div><span class="muted">' + p.label + '</span></div>'
        + '<div class="hw-act"><button class="kebab" data-a="hw-menu" data-id="' + a.id + '">' + U.icon('dots') + '</button></div></div>';
    }).join('') + '</div>';
  }

  /* — Library — */
  function viewLibrary() {
    var own = Store.ownData(), decks = Staff.decks || [];
    var mine = decks.filter(function (d) { return d.owner_id === Staff.meId(); });
    function row(kind, item, title, sub) {
      var d = mine.find(function (x) { return x.source_id === item.id; });
      var users = d ? (Staff.assigns || []).filter(function (a) { return a.deck_id === d.id; }).map(function (a) { return a.student_id; }) : [];
      var uniq = users.filter(function (u, i) { return users.indexOf(u) === i; }).length;
      return '<div class="lib-row' + (d && d.archived ? ' archived' : '') + '">'
        + '<div class="lib-ic">' + U.icon(kind === 'subject' ? 'book' : kind === 'essay' ? 'doc' : 'chain') + '</div>'
        + '<div class="lib-main"><b>' + esc(title) + '</b><span class="muted">' + sub + (d ? ' · <span class="pill ok">v' + d.version + '</span> published ' + U.ago(d.published_at) + (uniq ? ' · ' + U.plural(uniq, 'student') : '') : '') + '</span></div>'
        + '<div class="lib-act">'
        + (d ? deckChip(d, '') + '<button class="btn sm" data-a="deck-publish" data-kind="' + kind + '" data-id="' + item.id + '" title="Send your latest edits to every student who has it">Publish update</button>'
             + '<button class="kebab" data-a="deck-menu" data-id="' + d.id + '">' + U.icon('dots') + '</button>'
           : '<button class="btn sm primary" data-a="deck-publish" data-kind="' + kind + '" data-id="' + item.id + '">Publish as deck</button>')
        + '</div></div>';
    }
    var html = '<div class="lib-intro">Decks are made from your own Anchor. Edit cards normally in your Harbour, then hit <b>Publish update</b> — every student with that deck gets the changes, and keeps their progress. Students can add their own cards to your decks but can’t change yours.</div>';
    html += '<div class="sec-title"><span>Subjects</span></div>';
    html += own.subjects.length ? '<div class="lib-list">' + own.subjects.filter(function (s) { return !s.src; }).map(function (s) {
      var n = Store.subjectFacets(s).length;
      return row('subject', s, s.name, U.plural(s.tabs.length, 'tab') + ' · ' + U.plural(n, 'card'));
    }).join('') + '</div>' : '<div class="empty-hint">No subjects in your Anchor yet.</div>';
    var essays = own.essays.filter(function (e) { return !e.src; });
    if (essays.length) {
      html += '<div class="sec-title"><span>Essays</span></div><div class="lib-list">' + essays.map(function (e) {
        var n = own.chains.filter(function (c) { return c.essayId === e.id; }).length;
        return row('essay', e, e.title, U.plural(n, 'paragraph'));
      }).join('') + '</div>';
    }
    var loose = own.chains.filter(function (c) { return !c.essayId && !c.src; });
    if (loose.length) {
      html += '<div class="sec-title"><span>Standalone chains</span></div><div class="lib-list">' + loose.map(function (c) {
        return row('chain', c, c.title, U.plural(c.sentences.length, 'link'));
      }).join('') + '</div>';
    }
    var others = decks.filter(function (d) { return d.owner_id !== Staff.meId(); });
    if (others.length) {
      html += '<div class="sec-title"><span>Other tutors’ decks</span></div><div class="deck-rail">' + others.map(function (d) { return deckChip(d); }).join('') + '</div>';
    }
    return html;
  }

  /* — Groups — */
  function viewGroups() {
    var gs = Staff.groups || [];
    var html = '<div class="m-actions" style="justify-content:flex-start;margin:0 0 14px"><button class="btn primary" data-a="group-new">' + U.icon('plus') + 'New group</button></div>';
    if (!gs.length) return html + '<div class="empty-hint">Groups let you set homework for a whole class at once — e.g. “Yr 12 Business · Tue 4pm”.</div>';
    html += '<div class="grp-list">' + gs.map(function (g) {
      var mem = Staff.groupMembers(g.id);
      return '<div class="grp-card" data-drop-group="' + g.id + '"><div class="grp-head"><b>' + esc(g.name) + '</b><span class="muted">' + U.plural(mem.length, 'student') + '</span>'
        + '<button class="btn sm" data-a="assign-open" data-group="' + g.id + '">' + U.icon('target') + 'Set homework</button>'
        + '<button class="kebab" data-a="group-menu" data-id="' + g.id + '">' + U.icon('dots') + '</button></div>'
        + '<div class="grp-mem">' + (mem.length ? mem.map(function (uid) {
          return '<span class="mem-chip">' + avatar(uid, 22) + esc(Staff.name(uid)) + '<button data-a="group-rm" data-g="' + g.id + '" data-u="' + uid + '" title="Remove">' + U.icon('x', 'xs') + '</button></span>';
        }).join('') : '<span class="muted">No one yet.</span>')
        + '<button class="btn xs" data-a="group-add" data-id="' + g.id + '">' + U.icon('plus') + 'Add students</button></div></div>';
    }).join('') + '</div>';
    return html;
  }

  /* — One student — */
  Teach.studentView = function (route) {
    if (!Cloud.isTutor()) return '<div class="staff-err">This area is for tutors.</div>';
    if (!Staff.roster) { Staff.load().then(rerender); return loading(); }
    var uid = route.id, p = Staff.person(uid);
    if (!p) return '<div class="staff-err">That student isn’t on your roster.</div>' + U.backLink('#/teach', 'Teaching');
    var D = Staff.docs[uid];
    if (!D) { Staff.loadDoc(uid).then(rerender, function (e) { Staff.err = e.message; rerender(); }); return loading('Opening ' + Staff.name(p) + '’s Anchor…'); }
    if (Staff.notes[uid] === undefined) {
      Staff.notes[uid] = null;
      Promise.all([
        Staff.sb().from('notes').select('*').eq('to_id', uid).order('created_at', { ascending: false }).limit(30),
        Staff.sb().from('profile_notes').select('notes').eq('user_id', uid).maybeSingle()
      ]).then(function (r) { Staff.notes[uid] = r[0].data || []; Staff.priv[uid] = (r[1].data && r[1].data.notes) || ''; rerender(); });
    }
    var doc = D.data, name = Staff.name(p), first = name.split(' ')[0];
    var t = Ana.tally(doc);
    var html = U.crumbs([['Teaching', '#/teach'], [name]]);
    html += '<div class="stu-head">' + avatar(p, 56) + '<div class="stu-id"><h1>' + esc(name) + '</h1>'
      + '<div class="ph-sub">' + esc(p.email) + (p.year_level ? ' · ' + esc(p.year_level) : '') + ' · ' + lastStudied(p) + (D.at ? ' · synced ' + U.ago(D.at) : '') + '</div></div>'
      + '<div class="ph-actions">'
      + '<button class="btn" data-a="stu-open" data-id="' + uid + '">' + U.icon('home') + 'Open their Anchor</button>'
      + '<button class="btn" data-a="stu-quiz" data-id="' + uid + '">' + U.icon('play') + 'Quiz them</button>'
      + '<button class="btn primary" data-a="assign-open" data-student="' + uid + '">' + U.icon('target') + 'Set homework</button>'
      + '<button class="kebab" data-a="stu-menu" data-id="' + uid + '">' + U.icon('dots') + '</button></div></div>';

    var days = Ana.actDays(doc, 14), max = Math.max.apply(null, days.map(function (d) { return d.n; }).concat([1]));
    html += '<div class="today stu-tiles">'
      + '<div class="tile"><div class="t-lbl">🔥 Streak</div><div class="t-mid">' + (p.streak || 0) + '<span> days</span></div><div class="t-sub">' + (p.reviews_30d || 0) + ' reviews in 30 days</div></div>'
      + '<div class="tile"><div class="t-lbl">' + U.icon('target', 'sm') + 'Anchored</div><div class="t-mid">' + t.v + '<span>/' + t.n + '</span></div><div class="t-sub">' + U.pct(t.v, t.n) + '% of everything in their Anchor</div></div>'
      + '<div class="tile wide"><div class="t-lbl">Last 14 days</div><div class="spark">' + days.map(function (d) {
        return '<span title="' + d.day + ': ' + d.n + ' reviews" style="height:' + Math.max(4, Math.round(d.n / max * 100)) + '%"' + (d.n ? '' : ' class="zero"') + '></span>';
      }).join('') + '</div><div class="t-sub">' + days.reduce(function (s, d) { return s + d.n; }, 0) + ' reviews · ' + days.filter(function (d) { return d.n; }).length + '/14 days active</div></div>'
      + '</div>';

    // Lesson brief
    var missed = Ana.mostMissed(doc, 14, 8), fading = Ana.fading(doc, 8), typed = Ana.typed(doc, 10, 8);
    html += '<div class="sec-title"><span>Lesson brief</span><span class="muted hide-sm">— what to work on with ' + esc(first) + '</span></div><div class="brief">';
    html += briefCol('Most missed · 14 days', missed.map(function (m) {
      var d = Ana.describe(doc, m.key);
      return { key: m.key, q: d.q, sub: d.where, badge: m.miss + '× missed', cls: 'red' };
    }), uid, 'Nothing missed lately.');
    html += briefCol('Fading now', fading.map(function (f) {
      var d = Ana.describe(doc, f.key);
      return { key: f.key, q: d.q, sub: d.where, badge: Math.round(f.r * 100) + '% recall', cls: 'amber' };
    }), uid, 'Every anchor is holding.');
    html += '</div>';
    if (typed.length) {
      html += '<div class="sec-title"><span>Typed answers to check</span><span class="muted hide-sm">— they marked these themselves</span></div><div class="typed-list">'
        + typed.map(function (x) {
          var d = Ana.describe(doc, x.key);
          return '<div class="typed-row"><div class="typed-q"><b>' + esc(d.q) + '</b><span class="muted">' + esc(d.where) + ' · ' + U.ago(x.ans.t) + ' · they graded <b>' + ['', 'Missed', 'Shaky', 'Got it', 'Instant'][x.ans.g] + '</b></span></div>'
            + '<div class="typed-cmp"><div><div class="ab-lbl">Their answer</div><div class="your-answer">' + esc(x.ans.x) + '</div></div>'
            + '<div><div class="ab-lbl acc">The answer</div><div class="real-answer">' + esc(d.a) + '</div></div></div>'
            + '<div class="typed-act"><button class="btn sm" data-a="ans-ok" data-u="' + uid + '" data-k="' + esc(x.key) + '">' + U.icon('check') + 'Fair</button>'
            + '<button class="btn sm warn" data-a="ans-wrong" data-u="' + uid + '" data-k="' + esc(x.key) + '">Actually wrong</button>'
            + '<button class="btn sm subtle" data-a="note-new" data-u="' + uid + '" data-k="' + esc(x.key) + '">Leave a note</button></div></div>';
        }).join('') + '</div>';
    }

    // Homework
    var as = Teach.assignsFor(uid);
    html += '<div class="sec-title"><span>Homework</span></div>';
    html += as.length ? '<div class="hw-grid">' + as.map(function (a) {
      return '<div class="hw-wrap">' + Classroom.hwCard(doc, a).replace('data-a="hw-start"', 'data-a="stu-hw-quiz" data-u="' + uid + '"') + '<button class="kebab hw-k" data-a="hw-menu" data-id="' + a.id + '">' + U.icon('dots') + '</button></div>';
    }).join('') + '</div>' : '<div class="empty-hint">No homework yet — drag a deck here from Teaching, or hit Set homework.</div>';

    // Subjects overview
    var rows = Ana.subjectRows(doc);
    html += '<div class="sec-title"><span>Their Anchor</span></div>';
    html += rows.length ? '<div class="sub-rows">' + rows.map(function (r) {
      return '<div class="sub-row"><span class="sub-n">' + U.icon(r.essay ? 'doc' : 'book', 'sm') + esc(r.name) + (r.src ? ' <span class="pill">⚓ ' + esc(r.src.by || 'deck') + '</span>' : '') + '</span>'
        + '<div class="bar"><span style="width:' + U.pct(r.v, r.n) + '%"></span></div><span class="muted">' + r.v + '/' + r.n + '</span></div>';
    }).join('') + '</div>' : '<div class="empty-hint">Their Anchor is empty.</div>';

    // Messages + private notes
    var notes = Staff.notes[uid];
    html += '<div class="two-col"><div><div class="sec-title"><span>Notes to ' + esc(first) + '</span></div>'
      + '<div class="note-compose"><textarea class="m-ta" id="noteBody" placeholder="Shows on their Harbour next time they open Anchor"></textarea>'
      + '<button class="btn primary sm" data-a="note-send" data-u="' + uid + '">Send note</button></div>'
      + (notes === null ? loading() : (notes || []).map(function (n) {
        return '<div class="note-hist"><div class="muted">' + U.ago(n.created_at) + (n.read_at ? ' · read' : ' · unread') + '</div>' + esc(n.body) + '</div>';
      }).join(''))
      + '</div><div><div class="sec-title"><span>Private notes</span><span class="muted">— only you see these</span></div>'
      + '<textarea class="m-ta priv-notes" id="privNotes" data-u="' + uid + '" placeholder="Goals, weak spots, what you covered last lesson…">' + esc(Staff.priv[uid] || '') + '</textarea>'
      + '<div class="muted" style="font-size:12px;margin-top:6px">Saves when you click away.</div></div></div>';
    return html;
  };

  function briefCol(title, items, uid, empty) {
    return '<div class="brief-col"><div class="brief-h"><b>' + title + '</b>'
      + (items.length ? '<button class="btn xs" data-a="stu-quiz-keys" data-u="' + uid + '" data-keys="' + esc(items.map(function (i) { return i.key; }).join(',')) + '">' + U.icon('play') + 'Quiz these</button>' : '') + '</div>'
      + (items.length ? items.map(function (i) {
        return '<div class="brief-item"><div><div class="bi-q">' + esc(i.q) + '</div><div class="bi-sub">' + esc(i.sub) + '</div></div><span class="pill ' + i.cls + '">' + i.badge + '</span></div>';
      }).join('') : '<div class="muted brief-empty">' + empty + '</div>') + '</div>';
  }

  /* ─── View-as / quiz (the lens) ───────────────────────────────────────── */
  Teach.openAs = function (uid, opts) {
    opts = opts || {};
    var p = Staff.person(uid) || { user_id: uid, email: '', display_name: '' };
    FX.toast('Opening ' + Staff.name(p) + '’s Anchor…', '', 1600);
    return Cloud.openLens(uid, { tutor: true }).then(function () {
      App.viewAs = {
        uid: uid, name: Staff.name(p), email: p.email, role: p.role,
        edit: !!opts.edit, student: p.role === 'student',
        back: opts.back || (Cloud.isTutor() && p.role === 'student' ? { v: 'student', id: uid } : { v: 'adminUser', id: uid })
      };
      if (opts.keys) App.startSession(opts.keys, App.viewAs.back, opts.label || ('Lesson quiz · ' + Staff.name(p)));
      else App.go(opts.route || { v: 'home' });
    }, function (e) { FX.toast('Couldn’t open: ' + (e.message || e), 'amber', 3500); });
  };
  ACTIONS['stu-open'] = function (el) { Teach.openAs(el.getAttribute('data-id')); };
  function quiz(uid, keys, label) {
    keys = keys.filter(function (k) { return k.charAt(0) !== 'o'; });
    if (!keys.length) { FX.toast('Nothing to quiz there yet.', ''); return; }
    Teach.openAs(uid, { edit: true, keys: keys.slice(0, 40), label: label });
  }
  ACTIONS['stu-quiz-keys'] = function (el) { quiz(el.getAttribute('data-u'), el.getAttribute('data-keys').split(','), null); };
  ACTIONS['stu-hw-quiz'] = function (el) {
    var uid = el.getAttribute('data-u'), a = (Staff.assigns || []).find(function (x) { return x.id === el.getAttribute('data-id'); });
    if (!a) return;
    quiz(uid, Classroom.homeworkQueue(Staff.docs[uid].data, a), 'Homework check · ' + a.title);
  };
  ACTIONS['stu-quiz'] = function (el) {
    var uid = el.getAttribute('data-id'), doc = Staff.docs[uid] && Staff.docs[uid].data;
    if (!doc) return;
    var missed = Ana.mostMissed(doc, 21, 15).map(function (m) { return m.key; });
    var fading = Ana.fading(doc, 15).map(function (f) { return f.key; });
    var opts = '<label class="radio-row"><input type="radio" name="qz" value="weak" checked> <span><b>Weak spots</b> — most missed + fading (' + (missed.length + fading.length) + ')</span></label>';
    doc.subjects.forEach(function (s) {
      opts += '<label class="radio-row"><input type="radio" name="qz" value="s:' + s.id + '"> <span><b>' + esc(s.name) + '</b> — anything not anchored yet</span></label>';
    });
    Modal.open('<div class="m-title">Quiz ' + esc(Staff.name(uid)) + '</div>'
      + '<div class="m-sub">Runs a session on <b>their</b> cards. They answer out loud, you grade — your grades count in their Anchor (marked as tutor-graded).</div>'
      + '<div class="radio-list">' + opts + '</div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="stu-quiz-go" data-u="' + uid + '">' + U.icon('play') + 'Start quiz</button></div>');
    ACTIONS['stu-quiz-go'] = function (b) {
      var v = (document.querySelector('input[name=qz]:checked') || {}).value || 'weak';
      Modal.close();
      if (v === 'weak') { var ks = missed.concat(fading.filter(function (k) { return missed.indexOf(k) < 0; })); quiz(uid, ks, 'Lesson quiz · weak spots'); return; }
      var sid = v.slice(2), s = doc.subjects.find(function (x) { return x.id === sid; });
      var keys = Store.subjectFacets(s).map(function (f) { return f.key; }).filter(function (k) { return !Classroom.verifiedIn(doc, k); });
      quiz(b.getAttribute('data-u'), keys, 'Lesson quiz · ' + s.name);
    };
  };

  /* typed-answer review: "Fair" just clears it; "Actually wrong" records a tutor miss */
  function fixAnswer(uid, key, wrong) {
    Cloud.mutateDoc(uid, function (doc) {
      var st = doc.state && doc.state[key];
      if (!st) return;
      if (st.ans) st.ans.ok = 1;
      if (wrong) {
        var now = Date.now();
        st.srs = FSRS.grade(st.srs, 1, now);
        st.hist = st.hist || [];
        st.hist.push({ t: new Date(now).toISOString(), g: 1, r: null, c: st.conf, tu: 1 });
        st.conf = 'r'; st.miss = (st.miss || 0) + 1;
      }
    }).then(function () {
      FX.toast(wrong ? 'Marked as missed — it’ll come back to them.' : 'Cleared ✓', 'green');
      return Staff.loadDoc(uid, true);
    }).then(rerender, function (e) { FX.toast('Couldn’t save: ' + e.message, 'amber'); });
  }
  ACTIONS['ans-ok'] = function (el) { fixAnswer(el.getAttribute('data-u'), el.getAttribute('data-k'), false); };
  ACTIONS['ans-wrong'] = function (el) { fixAnswer(el.getAttribute('data-u'), el.getAttribute('data-k'), true); };

  /* ─── Notes ───────────────────────────────────────────────────────────── */
  function sendNote(uid, body, facet) {
    return Staff.sb().from('notes').insert({ from_id: Staff.meId(), to_id: uid, body: body, facet: facet || null }).then(function (res) {
      if (res.error) throw res.error;
      delete Staff.notes[uid];
    });
  }
  ACTIONS['note-send'] = function (el) {
    var uid = el.getAttribute('data-u'), ta = document.getElementById('noteBody'), body = (ta && ta.value || '').trim();
    if (!body) { FX.toast('Write something first.', ''); return; }
    el.disabled = true;
    sendNote(uid, body).then(function () { FX.toast('Note sent ✓', 'green'); rerender(); }, function (e) { el.disabled = false; FX.toast(e.message, 'amber'); });
  };
  ACTIONS['note-new'] = function (el) {
    var uid = el.getAttribute('data-u'), key = el.getAttribute('data-k'), d = Ana.describe(Staff.docs[uid].data, key);
    Modal.open('<div class="m-title">Note about “' + esc(d ? d.q : '') + '”</div>'
      + '<textarea class="m-ta" id="noteBody2" placeholder="e.g. Remember the 4 Ps here — product, price, promotion, place"></textarea>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="note-new-ok">Send</button></div>');
    ACTIONS['note-new-ok'] = function () {
      var body = (document.getElementById('noteBody2').value || '').trim();
      if (!body) return;
      Modal.close();
      sendNote(uid, body, key).then(function () { FX.toast('Note sent ✓', 'green'); rerender(); });
    };
  };
  document.addEventListener('focusout', function (ev) {
    var t = ev.target;
    if (!t || t.id !== 'privNotes') return;
    var uid = t.getAttribute('data-u'), v = t.value;
    if (Staff.priv[uid] === v) return;
    Staff.priv[uid] = v;
    Staff.sb().from('profile_notes').upsert({ user_id: uid, notes: v, updated_at: new Date().toISOString() }).then(function (res) {
      FX.toast(res.error ? 'Couldn’t save notes: ' + res.error.message : 'Notes saved', res.error ? 'amber' : '', 1400);
    });
  });

  /* ─── Student menu ────────────────────────────────────────────────────── */
  ACTIONS['stu-menu'] = function (el) {
    var uid = el.getAttribute('data-id');
    Menu.open(el, Menu.item('stu-edit', 'Edit details', 'edit', ' data-id="' + uid + '"')
      + Menu.item('stu-pass', 'Set a new password', 'settings', ' data-id="' + uid + '"')
      + Menu.item('stu-groups', 'Groups…', 'folder', ' data-id="' + uid + '"')
      + Menu.item('stu-reload', 'Refresh their data', 'download', ' data-id="' + uid + '"')
      + (Cloud.isAdmin() ? Menu.sep() + Menu.item('stu-admin', 'Open in Admin', 'settings', ' data-id="' + uid + '"') : '')
      + Menu.sep() + Menu.item('stu-release', 'Remove from my students', 'x', ' data-id="' + uid + '"', true));
  };
  ACTIONS['stu-admin'] = function (el) { App.go({ v: 'adminUser', id: el.getAttribute('data-id') }); };
  ACTIONS['stu-reload'] = function (el) {
    var uid = el.getAttribute('data-id');
    delete Staff.notes[uid];
    Staff.loadDoc(uid, true).then(function () { return Staff.load(true); }).then(rerender);
  };
  ACTIONS['stu-edit'] = function (el) {
    var p = Staff.person(el.getAttribute('data-id'));
    Modal.open('<div class="m-title">Edit ' + esc(Staff.name(p)) + '</div>'
      + '<div class="m-row"><label class="m-lbl">Name</label><input class="m-input" id="seName" value="' + esc(p.display_name) + '"></div>'
      + '<div class="m-row"><label class="m-lbl">Year / class</label><input class="m-input" id="seYear" value="' + esc(p.year_level) + '" placeholder="e.g. Year 12 · Business"></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="stu-edit-ok" data-id="' + p.user_id + '">Save</button></div>');
  };
  ACTIONS['stu-edit-ok'] = function (el) {
    var uid = el.getAttribute('data-id');
    Staff.sb().from('profiles').update({ display_name: document.getElementById('seName').value.trim(), year_level: document.getElementById('seYear').value.trim() })
      .eq('user_id', uid).then(function (res) {
        if (res.error) { FX.toast(res.error.message, 'amber'); return; }
        Modal.close(); FX.toast('Saved ✓', 'green'); Staff.reload();
      });
  };
  ACTIONS['stu-pass'] = function (el) { Teach.passwordModal(el.getAttribute('data-id')); };
  Teach.passwordModal = function (uid) {
    var pw = genPassword();
    Modal.open('<div class="m-title">New password for ' + esc(Staff.name(uid)) + '</div>'
      + '<div class="m-sub">Sets it straight away — give it to them in person or by message.</div>'
      + '<div class="m-row"><input class="m-input mono" id="npw" value="' + esc(pw) + '"></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="stu-pass-ok" data-id="' + uid + '">Set password</button></div>');
  };
  ACTIONS['stu-pass-ok'] = function (el) {
    var pw = document.getElementById('npw').value;
    el.disabled = true;
    Cloud.callAdmin('set_password', { user_id: el.getAttribute('data-id'), password: pw }).then(function () {
      Modal.open('<div class="m-title">Password set ✓</div><div class="cred-box mono">' + esc(pw) + '</div>'
        + '<div class="m-actions"><button class="btn" data-a="copy-text" data-text="' + esc(pw) + '">Copy</button><button class="btn primary" data-a="modal-close">Done</button></div>');
    }, function (e) { el.disabled = false; FX.toast(e.message, 'amber'); });
  };
  ACTIONS['stu-release'] = function (el) {
    var uid = el.getAttribute('data-id');
    Modal.confirm('Remove ' + Staff.name(uid) + ' from your students?', 'Their account and Anchor stay exactly as they are — you just stop seeing them here. Their homework is archived.', 'Remove', true, function () {
      Staff.sb().from('profiles').update({ role: 'user', tutor_id: null }).eq('user_id', uid).then(function (res) {
        if (res.error) { FX.toast(res.error.message, 'amber'); return; }
        return Staff.sb().from('assignments').update({ status: 'archived' }).eq('student_id', uid).eq('status', 'active');
      }).then(function () { Staff.reload(); App.go({ v: 'teach' }); });
    });
  };
  ACTIONS['stu-groups'] = function (el) {
    var uid = el.getAttribute('data-id'), mine = Staff.groupsOf(uid).map(function (g) { return g.id; });
    if (!(Staff.groups || []).length) { FX.toast('Make a group first (Teaching → Groups).', ''); return; }
    Modal.open('<div class="m-title">Groups for ' + esc(Staff.name(uid)) + '</div><div class="check-list">'
      + Staff.groups.map(function (g) { return '<label class="radio-row"><input type="checkbox" value="' + g.id + '"' + (mine.indexOf(g.id) >= 0 ? ' checked' : '') + '> <span>' + esc(g.name) + '</span></label>'; }).join('')
      + '</div><div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="stu-groups-ok" data-id="' + uid + '">Save</button></div>');
  };
  ACTIONS['stu-groups-ok'] = function (el) {
    var uid = el.getAttribute('data-id'), before = Staff.groupsOf(uid).map(function (g) { return g.id; }), after = [];
    document.querySelectorAll('.check-list input:checked').forEach(function (c) { after.push(c.value); });
    var add = after.filter(function (g) { return before.indexOf(g) < 0; }), rm = before.filter(function (g) { return after.indexOf(g) < 0; });
    var ops = add.map(function (g) { return Staff.sb().from('group_members').insert({ group_id: g, student_id: uid }); })
      .concat(rm.map(function (g) { return Staff.sb().from('group_members').delete().eq('group_id', g).eq('student_id', uid); }));
    Promise.all(ops).then(function () { Modal.close(); Staff.reload(); });
  };

  /* ─── Assign (set homework) ───────────────────────────────────────────── */
  var AS = null;   // modal state
  Teach.assignModal = function (pre) {
    pre = pre || {};
    var decks = (Staff.decks || []).filter(function (d) { return !d.archived; });
    if (!decks.length) { FX.toast('Publish a deck first (Teaching → Library).', '', 3000); App.go({ v: 'teach', tab: 'library' }); return; }
    var due = new Date(Date.now() + 7 * 864e5);
    AS = {
      deck: pre.deck || decks[0].id, students: pre.students || [], groups: pre.groups || [],
      tabs: null, goal: 'anchor', pct: 100, n: 100, due: Store.todayISO(due), note: ''
    };
    renderAssign();
  };
  function renderAssign() {
    var decks = (Staff.decks || []).filter(function (d) { return !d.archived; });
    var d = Staff.deck(AS.deck), content = Staff.deckContent[AS.deck];
    if (!content) Staff.loadDeckContent(AS.deck).then(renderAssign, function () {});
    var studs = Staff.myStudents().slice().sort(function (a, b) { return Staff.name(a).localeCompare(Staff.name(b)); });
    var tabsHtml = '';
    if (d && d.kind === 'subject') {
      tabsHtml = !content ? '<div class="muted">Loading tabs…</div>' : '<label class="radio-row"><input type="radio" name="asScope" value="all"' + (!AS.tabs ? ' checked' : '') + '> <span>The whole deck</span></label>'
        + '<label class="radio-row"><input type="radio" name="asScope" value="some"' + (AS.tabs ? ' checked' : '') + '> <span>Just some tabs</span></label>'
        + (AS.tabs ? '<div class="tab-picks">' + content.subject.tabs.map(function (t) {
          return '<label class="tick"><input type="checkbox" class="asTab" value="' + t.id + '"' + (AS.tabs.indexOf(t.id) >= 0 ? ' checked' : '') + '> ' + esc(t.name) + ' <em>' + t.cards.length + '</em></label>';
        }).join('') + '</div>' : '');
    }
    Modal.open('<div class="m-title">Set homework</div>'
      + '<div class="m-row"><label class="m-lbl">Deck</label><select class="m-input" id="asDeck">' + decks.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === AS.deck ? ' selected' : '') + '>' + esc(x.title) + ' (v' + x.version + ' · ' + x.card_count + ' cards)</option>';
      }).join('') + '</select></div>'
      + (tabsHtml ? '<div class="m-row"><label class="m-lbl">What</label>' + tabsHtml + '</div>' : '')
      + '<div class="m-row"><label class="m-lbl">Who</label><div class="who-picks">'
      + (Staff.groups || []).map(function (g) { return '<label class="tick grp"><input type="checkbox" class="asGroup" value="' + g.id + '"' + (AS.groups.indexOf(g.id) >= 0 ? ' checked' : '') + '> ' + esc(g.name) + ' <em>' + Staff.groupMembers(g.id).length + '</em></label>'; }).join('')
      + studs.map(function (p) { return '<label class="tick"><input type="checkbox" class="asStu" value="' + p.user_id + '"' + (AS.students.indexOf(p.user_id) >= 0 ? ' checked' : '') + '> ' + esc(Staff.name(p)) + '</label>'; }).join('')
      + (studs.length ? '' : '<span class="muted">No students yet.</span>') + '</div></div>'
      + '<div class="m-row two"><div><label class="m-lbl">Goal</label><select class="m-input" id="asGoal">'
      + '<option value="anchor100"' + (AS.goal === 'anchor' && AS.pct === 100 ? ' selected' : '') + '>Anchor every card</option>'
      + '<option value="anchor80"' + (AS.goal === 'anchor' && AS.pct === 80 ? ' selected' : '') + '>Anchor 80%</option>'
      + '<option value="anchor50"' + (AS.goal === 'anchor' && AS.pct === 50 ? ' selected' : '') + '>Anchor 50%</option>'
      + '<option value="reviews"' + (AS.goal === 'reviews' ? ' selected' : '') + '>Do a number of reviews</option></select>'
      + (AS.goal === 'reviews' ? '<input class="m-input" id="asN" type="number" min="5" step="5" value="' + AS.n + '" style="margin-top:6px">' : '') + '</div>'
      + '<div><label class="m-lbl">Due</label><input class="m-input" id="asDue" type="date" value="' + AS.due + '"></div></div>'
      + '<div class="m-row"><label class="m-lbl">Note (optional)</label><textarea class="m-ta" id="asNote" style="min-height:56px" placeholder="e.g. Focus on Finance before Thursday">' + esc(AS.note) + '</textarea></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="assign-go">' + U.icon('target') + 'Set homework</button></div>',
      function (root) {
        root.querySelector('#asDeck').onchange = function () { readAssign(); AS.deck = this.value; AS.tabs = null; renderAssign(); };
        root.querySelector('#asGoal').onchange = function () { readAssign(); renderAssign(); };
        root.querySelectorAll('input[name=asScope]').forEach(function (r) { r.onchange = function () { readAssign(); AS.tabs = this.value === 'some' ? [] : null; renderAssign(); }; });
      });
  }
  function readAssign() {
    var g = (document.getElementById('asGoal') || {}).value || 'anchor100';
    AS.goal = g === 'reviews' ? 'reviews' : 'anchor';
    AS.pct = g === 'anchor80' ? 80 : g === 'anchor50' ? 50 : 100;
    var n = document.getElementById('asN'); if (n) AS.n = Math.max(1, parseInt(n.value, 10) || 100);
    AS.due = (document.getElementById('asDue') || {}).value || '';
    AS.note = (document.getElementById('asNote') || {}).value || '';
    AS.students = []; AS.groups = [];
    document.querySelectorAll('.asStu:checked').forEach(function (c) { AS.students.push(c.value); });
    document.querySelectorAll('.asGroup:checked').forEach(function (c) { AS.groups.push(c.value); });
    if (AS.tabs) { AS.tabs = []; document.querySelectorAll('.asTab:checked').forEach(function (c) { AS.tabs.push(c.value); }); }
  }
  ACTIONS['assign-open'] = function (el) {
    var pre = {};
    if (el.getAttribute('data-deck-id')) pre.deck = el.getAttribute('data-deck-id');
    if (el.getAttribute('data-student')) pre.students = [el.getAttribute('data-student')];
    if (el.getAttribute('data-group')) pre.groups = [el.getAttribute('data-group')];
    Teach.assignModal(pre);
  };
  ACTIONS['assign-go'] = function (el) {
    readAssign();
    var d = Staff.deck(AS.deck), content = Staff.deckContent[AS.deck];
    if (!d || !content) { FX.toast('Still loading the deck…', ''); return; }
    var targets = {};   // uid → group id (or '')
    AS.students.forEach(function (u) { targets[u] = targets[u] || ''; });
    AS.groups.forEach(function (g) { Staff.groupMembers(g).forEach(function (u) { if (!targets[u]) targets[u] = g; }); });
    var uids = Object.keys(targets);
    if (!uids.length) { FX.toast('Pick at least one student or group.', 'amber'); return; }
    if (AS.tabs && !AS.tabs.length) { FX.toast('Pick at least one tab (or choose the whole deck).', 'amber'); return; }
    var scopeId = content.subject ? content.subject.id : content.essays.length ? content.essays[0].id : content.chains[0].id;
    var scopeKind = content.subject ? 'subject' : content.essays.length ? 'essay' : 'chain';
    var title = d.title;
    if (AS.tabs && content.subject) {
      var names = content.subject.tabs.filter(function (t) { return AS.tabs.indexOf(t.id) >= 0; }).map(function (t) { return t.name; });
      title = d.title + ' · ' + (names.length <= 2 ? names.join(', ') : names.length + ' tabs');
    }
    el.disabled = true; el.textContent = 'Setting…';
    Teach.giveDeck(d, content, uids, function (uid) {
      return {
        tutor_id: Staff.meId(), student_id: uid, group_id: targets[uid] || null, deck_id: d.id, title: title, note: AS.note.trim(),
        scope: { kind: scopeKind, id: scopeId, tabs: AS.tabs || null },
        goal: AS.goal === 'reviews' ? { type: 'reviews', n: AS.n } : { type: 'anchor', pct: AS.pct },
        due_on: AS.due || null
      };
    }).then(function (res) {
      Modal.close();
      FX.toast('Homework set for ' + U.plural(res.ok, 'student') + (res.fail ? ' · ' + res.fail + ' failed' : '') + ' ✓', res.fail ? 'amber' : 'green', 3500);
      Staff.reload();
    });
  };

  // Install deck content into each student's Anchor (immediately, merge-safe)
  // and optionally create an assignment row per student.
  Teach.giveDeck = function (d, content, uids, rowFor) {
    var by = (Cloud.me() && Cloud.me().display_name) || 'your tutor';
    var ok = 0, fail = 0;
    return uids.reduce(function (pr, uid) {
      return pr.then(function () {
        return Cloud.mutateDoc(uid, function (doc) {
          Deck.apply(doc, { id: d.id, version: d.version, content: content, by: by });
        }).then(function () {
          delete Staff.docs[uid];
          if (!rowFor) return;
          return Staff.sb().from('assignments').insert(rowFor(uid)).then(function (r) { if (r.error) throw r.error; });
        }).then(function () { ok++; }, function (e) { fail++; console.error('assign', uid, e); });
      });
    }, Promise.resolve()).then(function () { return { ok: ok, fail: fail }; });
  };

  /* drag a deck chip onto a student card / group */
  var dragDeck = null;
  document.addEventListener('dragstart', function (ev) {
    var c = ev.target.closest && ev.target.closest('[data-deck]');
    if (!c) return;
    dragDeck = c.getAttribute('data-deck');
    try { ev.dataTransfer.setData('text/plain', dragDeck); ev.dataTransfer.effectAllowed = 'copy'; } catch (e) {}
    document.body.classList.add('dragging-deck');
  });
  document.addEventListener('dragend', function () { dragDeck = null; document.body.classList.remove('dragging-deck'); document.querySelectorAll('.drop-on').forEach(function (x) { x.classList.remove('drop-on'); }); });
  function dropTarget(ev) { return ev.target.closest && ev.target.closest('[data-drop-student],[data-drop-group]'); }
  document.addEventListener('dragover', function (ev) {
    if (!dragDeck) return;
    var t = dropTarget(ev);
    if (!t) return;
    ev.preventDefault();
    document.querySelectorAll('.drop-on').forEach(function (x) { if (x !== t) x.classList.remove('drop-on'); });
    t.classList.add('drop-on');
  });
  document.addEventListener('drop', function (ev) {
    if (!dragDeck) return;
    var t = dropTarget(ev);
    if (!t) return;
    ev.preventDefault();
    var pre = { deck: dragDeck };
    if (t.getAttribute('data-drop-student')) pre.students = [t.getAttribute('data-drop-student')];
    if (t.getAttribute('data-drop-group')) pre.groups = [t.getAttribute('data-drop-group')];
    dragDeck = null;
    document.body.classList.remove('dragging-deck');
    t.classList.remove('drop-on');
    Teach.assignModal(pre);
  });

  /* ─── Assignment menu ─────────────────────────────────────────────────── */
  ACTIONS['hw-menu'] = function (el) {
    var id = el.getAttribute('data-id'), a = (Staff.assigns || []).find(function (x) { return x.id === id; });
    if (!a) return;
    Menu.open(el, Menu.item('hw-due', 'Change due date', 'edit', ' data-id="' + id + '"')
      + (a.status === 'done' ? Menu.item('hw-reopen', 'Reopen', 'play', ' data-id="' + id + '"') : Menu.item('hw-done', 'Mark done', 'check', ' data-id="' + id + '"'))
      + Menu.item('hw-archive', 'Archive', 'folder', ' data-id="' + id + '"')
      + Menu.sep() + Menu.item('hw-del', 'Delete', 'trash', ' data-id="' + id + '"', true));
  };
  function hwUpdate(id, patch, msg) {
    Staff.sb().from('assignments').update(patch).eq('id', id).then(function (res) {
      if (res.error) { FX.toast(res.error.message, 'amber'); return; }
      if (msg) FX.toast(msg, 'green');
      Staff.reload();
    });
  }
  ACTIONS['hw-done'] = function (el) { hwUpdate(el.getAttribute('data-id'), { status: 'done', completed_at: new Date().toISOString() }, 'Marked done'); };
  ACTIONS['hw-reopen'] = function (el) { hwUpdate(el.getAttribute('data-id'), { status: 'active', completed_at: null }, 'Reopened'); };
  ACTIONS['hw-archive'] = function (el) { hwUpdate(el.getAttribute('data-id'), { status: 'archived' }, 'Archived'); };
  ACTIONS['hw-del'] = function (el) {
    var id = el.getAttribute('data-id');
    Modal.confirm('Delete this homework?', 'The cards stay in their Anchor — only the task goes.', 'Delete', true, function () {
      Staff.sb().from('assignments').delete().eq('id', id).then(function () { Staff.reload(); });
    });
  };
  ACTIONS['hw-due'] = function (el) {
    var id = el.getAttribute('data-id'), a = Staff.assigns.find(function (x) { return x.id === id; });
    Modal.open('<div class="m-title">Due date</div><input class="m-input" type="date" id="hwDue" value="' + (a.due_on || '') + '">'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="hw-due-ok" data-id="' + id + '">Save</button></div>');
  };
  ACTIONS['hw-due-ok'] = function (el) { var v = document.getElementById('hwDue').value || null; Modal.close(); hwUpdate(el.getAttribute('data-id'), { due_on: v }); };

  /* ─── Library: publish / update ───────────────────────────────────────── */
  ACTIONS['deck-publish'] = function (el) {
    var kind = el.getAttribute('data-kind'), id = el.getAttribute('data-id');
    if (Store.lens()) { FX.toast('Exit the student view first.', 'amber'); return; }
    var content = Deck.build(Store.ownData(), kind, id);
    if (!content) return;
    var title = content.title; delete content.title;
    var count = Deck.count(content);
    if (!count) { FX.toast('That has no cards yet.', 'amber'); return; }
    var existing = (Staff.decks || []).find(function (d) { return d.owner_id === Staff.meId() && d.source_id === id; });
    el.disabled = true;
    var sb = Staff.sb();
    var p = existing
      ? sb.from('library_decks').select('content, version').eq('id', existing.id).single().then(function (r) {
          if (r.error) throw r.error;
          if (Merge.deq(r.data.content, content) && existing.title === title) return { same: true, deck: existing };
          return sb.from('library_decks').update({ content: content, title: title, card_count: count, version: r.data.version + 1, published_at: new Date().toISOString(), archived: false })
            .eq('id', existing.id).select('id, owner_id, kind, source_id, title, version, card_count, archived, published_at').single()
            .then(function (u) { if (u.error) throw u.error; return { deck: u.data }; });
        })
      : sb.from('library_decks').insert({ owner_id: Staff.meId(), kind: kind, source_id: id, title: title, content: content, card_count: count })
          .select('id, owner_id, kind, source_id, title, version, card_count, archived, published_at').single()
          .then(function (u) { if (u.error) throw u.error; return { deck: u.data, fresh: true }; });
    p.then(function (res) {
      el.disabled = false;
      if (res.same) { FX.toast('No changes since v' + res.deck.version + ' — nothing to send.', ''); return; }
      Staff.deckContent[res.deck.id] = content;
      if (res.fresh) { FX.toast('Published “' + title + '” ✓ — drag it onto a student to hand it out.', 'green', 3500); Staff.reload(); return; }
      // push the new version into every student who has it
      var users = (Staff.assigns || []).filter(function (a) { return a.deck_id === res.deck.id; }).map(function (a) { return a.student_id; });
      users = users.filter(function (u, i) { return users.indexOf(u) === i; });
      if (!users.length) { FX.toast('Published v' + res.deck.version + ' ✓', 'green'); Staff.reload(); return; }
      FX.toast('Published v' + res.deck.version + ' — updating ' + U.plural(users.length, 'student') + '…', '', 2500);
      Teach.giveDeck(res.deck, content, users, null).then(function (r) {
        FX.toast('v' + res.deck.version + ' is in ' + U.plural(r.ok, 'student') + '’s Anchor ✓' + (r.fail ? ' (' + r.fail + ' will update next time they open it)' : ''), 'green', 3500);
        Staff.reload();
      });
    }, function (e) { el.disabled = false; FX.toast('Couldn’t publish: ' + e.message, 'amber', 3500); });
  };
  ACTIONS['deck-menu'] = function (el) {
    var id = el.getAttribute('data-id'), d = Staff.deck(id);
    Menu.open(el, Menu.item('assign-open', 'Set as homework', 'target', ' data-deck-id="' + id + '"')
      + Menu.item('deck-give', 'Give to students (no homework)', 'share', ' data-id="' + id + '"')
      + (d.archived ? Menu.item('deck-arch', 'Unarchive', 'folder', ' data-id="' + id + '" data-v="0"') : Menu.item('deck-arch', 'Archive', 'folder', ' data-id="' + id + '" data-v="1"'))
      + Menu.sep() + Menu.item('deck-del', 'Delete deck', 'trash', ' data-id="' + id + '"', true));
  };
  ACTIONS['deck-arch'] = function (el) {
    Staff.sb().from('library_decks').update({ archived: el.getAttribute('data-v') === '1' }).eq('id', el.getAttribute('data-id')).then(function () { Staff.reload(); });
  };
  ACTIONS['deck-del'] = function (el) {
    var id = el.getAttribute('data-id');
    Modal.confirm('Delete this deck?', 'Students keep the cards they already have (and their progress) — they just stop getting updates. Homework that used it stays.', 'Delete deck', true, function () {
      Staff.sb().from('library_decks').delete().eq('id', id).then(function (r) { if (r.error) FX.toast(r.error.message, 'amber'); Staff.reload(); });
    });
  };
  ACTIONS['deck-give'] = function (el) {
    var id = el.getAttribute('data-id'), d = Staff.deck(id);
    var studs = Staff.myStudents();
    Modal.open('<div class="m-title">Give “' + esc(d.title) + '”</div><div class="m-sub">Adds it to their Anchor without setting homework.</div><div class="who-picks">'
      + studs.map(function (p) { return '<label class="tick"><input type="checkbox" class="gvStu" value="' + p.user_id + '"> ' + esc(Staff.name(p)) + '</label>'; }).join('')
      + '</div><div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="deck-give-ok" data-id="' + id + '">Give</button></div>');
  };
  ACTIONS['deck-give-ok'] = function (el) {
    var id = el.getAttribute('data-id'), d = Staff.deck(id), uids = [];
    document.querySelectorAll('.gvStu:checked').forEach(function (c) { uids.push(c.value); });
    if (!uids.length) return;
    el.disabled = true;
    Staff.loadDeckContent(id).then(function (content) { return Teach.giveDeck(d, content, uids, null); }).then(function (r) {
      Modal.close(); FX.toast('Added to ' + U.plural(r.ok, 'student') + ' ✓', 'green');
    });
  };

  /* ─── Groups ──────────────────────────────────────────────────────────── */
  ACTIONS['group-new'] = function () {
    Modal.open('<div class="m-title">New group</div><input class="m-input" id="gName" placeholder="e.g. Yr 12 Business · Tue 4pm">'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="group-new-ok">Create</button></div>', function (root) { enterSubmits(root, 'group-new-ok'); });
  };
  ACTIONS['group-new-ok'] = function () {
    var n = document.getElementById('gName').value.trim();
    if (!n) return;
    Staff.sb().from('groups').insert({ tutor_id: Staff.meId(), name: n }).then(function (r) { if (r.error) FX.toast(r.error.message, 'amber'); Modal.close(); Staff.reload(); });
  };
  ACTIONS['group-menu'] = function (el) {
    var id = el.getAttribute('data-id');
    Menu.open(el, Menu.item('group-rename', 'Rename', 'edit', ' data-id="' + id + '"') + Menu.sep() + Menu.item('group-del', 'Delete group', 'trash', ' data-id="' + id + '"', true));
  };
  ACTIONS['group-rename'] = function (el) {
    var g = Staff.groups.find(function (x) { return x.id === el.getAttribute('data-id'); });
    Modal.open('<div class="m-title">Rename group</div><input class="m-input" id="gName" value="' + esc(g.name) + '">'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="group-rename-ok" data-id="' + g.id + '">Save</button></div>', function (root) { enterSubmits(root, 'group-rename-ok'); });
  };
  ACTIONS['group-rename-ok'] = function (el) {
    var id = (el.getAttribute && el.getAttribute('data-id')) || document.querySelector('[data-a=group-rename-ok]').getAttribute('data-id');
    Staff.sb().from('groups').update({ name: document.getElementById('gName').value.trim() }).eq('id', id).then(function () { Modal.close(); Staff.reload(); });
  };
  ACTIONS['group-del'] = function (el) {
    var id = el.getAttribute('data-id');
    Modal.confirm('Delete this group?', 'Students and their homework stay — only the grouping goes.', 'Delete', true, function () {
      Staff.sb().from('groups').delete().eq('id', id).then(function () { Staff.reload(); });
    });
  };
  ACTIONS['group-rm'] = function (el, ev) {
    ev.preventDefault(); ev.stopPropagation();
    Staff.sb().from('group_members').delete().eq('group_id', el.getAttribute('data-g')).eq('student_id', el.getAttribute('data-u')).then(function () { Staff.reload(); });
  };
  ACTIONS['group-add'] = function (el) {
    var gid = el.getAttribute('data-id'), cur = Staff.groupMembers(gid);
    var studs = Staff.myStudents().filter(function (p) { return cur.indexOf(p.user_id) < 0; });
    if (!studs.length) { FX.toast('Everyone’s already in this group.', ''); return; }
    Modal.open('<div class="m-title">Add to group</div><div class="who-picks">'
      + studs.map(function (p) { return '<label class="tick"><input type="checkbox" class="gaStu" value="' + p.user_id + '"> ' + esc(Staff.name(p)) + '</label>'; }).join('')
      + '</div><div class="m-sub" style="margin-top:10px">New members also get the group’s current homework.</div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="group-add-ok" data-id="' + gid + '">Add</button></div>');
  };
  ACTIONS['group-add-ok'] = function (el) {
    var gid = el.getAttribute('data-id'), uids = [];
    document.querySelectorAll('.gaStu:checked').forEach(function (c) { uids.push(c.value); });
    if (!uids.length) return;
    el.disabled = true;
    Staff.sb().from('group_members').insert(uids.map(function (u) { return { group_id: gid, student_id: u }; })).then(function (r) {
      if (r.error) throw r.error;
      // copy the group's active homework to the newcomers
      var seen = {}, active = (Staff.assigns || []).filter(function (a) {
        if (a.group_id !== gid || a.status !== 'active' || !a.deck_id) return false;
        var k = a.deck_id + '|' + a.title; if (seen[k]) return false; seen[k] = 1; return true;
      });
      return active.reduce(function (pr, a) {
        var d = Staff.deck(a.deck_id);
        if (!d) return pr;
        return pr.then(function () { return Staff.loadDeckContent(d.id); }).then(function (content) {
          return Teach.giveDeck(d, content, uids, function (uid) {
            return { tutor_id: Staff.meId(), student_id: uid, group_id: gid, deck_id: d.id, title: a.title, note: a.note, scope: a.scope, goal: a.goal, due_on: a.due_on };
          });
        });
      }, Promise.resolve());
    }).then(function () { Modal.close(); FX.toast('Added ✓', 'green'); Staff.reload(); }, function (e) { el.disabled = false; FX.toast(e.message, 'amber'); });
  };

  /* ─── Create an account (students; admin can make any role) ───────────── */
  var WORDS = ['anchor', 'harbour', 'maple', 'river', 'comet', 'cedar', 'falcon', 'coral', 'summit', 'meadow', 'atlas', 'ember', 'orbit', 'pixel', 'tidal', 'willow', 'zephyr', 'quartz', 'nova', 'delta'];
  function genPassword() {
    var r = new Uint32Array(3); (window.crypto || window.msCrypto).getRandomValues(r);
    return WORDS[r[0] % WORDS.length] + '-' + WORDS[r[1] % WORDS.length] + '-' + (10 + r[2] % 90);
  }
  Teach.genPassword = genPassword;
  ACTIONS['acct-new'] = function () {
    var decks = (Staff.decks || []).filter(function (d) { return !d.archived; });
    Modal.open('<div class="m-title">New student account</div>'
      + '<div class="m-sub">They can sign in straight away with this email + password — no confirmation email needed.</div>'
      + '<div class="m-row two"><div><label class="m-lbl">First name</label><input class="m-input" id="naName" placeholder="Sam"></div>'
      + '<div><label class="m-lbl">Year / class</label><input class="m-input" id="naYear" placeholder="Year 12 · Business"></div></div>'
      + '<div class="m-row"><label class="m-lbl">Email</label><input class="m-input" id="naEmail" type="email" placeholder="sam@example.com" spellcheck="false"></div>'
      + '<div class="m-row"><label class="m-lbl">Password</label><div class="row-inline"><input class="m-input mono" id="naPass" value="' + genPassword() + '"><button class="btn sm" data-a="na-regen" title="New password">↻</button></div></div>'
      + (Cloud.isAdmin() ? '<div class="m-row"><label class="m-lbl">Account type</label><select class="m-input" id="naRole"><option value="student">Student (yours)</option><option value="user">Regular user</option><option value="tutor">Tutor</option></select></div>' : '')
      + (decks.length ? '<div class="m-row"><label class="m-lbl">Preload decks</label><div class="who-picks">' + decks.map(function (d) {
        return '<label class="tick"><input type="checkbox" class="naDeck" value="' + d.id + '"> ' + esc(d.title) + '</label>';
      }).join('') + '</div></div>' : '')
      + ((Staff.groups || []).length ? '<div class="m-row"><label class="m-lbl">Group</label><select class="m-input" id="naGroup"><option value="">—</option>'
        + Staff.groups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + '</option>'; }).join('') + '</select></div>' : '')
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="acct-new-ok">Create account</button></div>');
  };
  ACTIONS['na-regen'] = function () { document.getElementById('naPass').value = genPassword(); };
  ACTIONS['acct-new-ok'] = function (el) {
    var name = document.getElementById('naName').value.trim(), email = document.getElementById('naEmail').value.trim().toLowerCase();
    var pass = document.getElementById('naPass').value, year = document.getElementById('naYear').value.trim();
    var role = (document.getElementById('naRole') || {}).value || 'student';
    var gid = (document.getElementById('naGroup') || {}).value || '';
    var deckIds = []; document.querySelectorAll('.naDeck:checked').forEach(function (c) { deckIds.push(c.value); });
    if (!name) { FX.toast('Add their first name.', 'amber'); return; }
    el.disabled = true; el.textContent = 'Creating…';
    var uid;
    Cloud.callAdmin('create', { email: email, password: pass, display_name: name, year_level: year, role: role }).then(function (r) {
      uid = r.user_id;
      // their Anchor starts with today's date; decks get installed as linked copies
      return Cloud.mutateDoc(uid, function () {});
    }).then(function () {
      if (gid && role === 'student') return Staff.sb().from('group_members').insert({ group_id: gid, student_id: uid });
    }).then(function () {
      return Staff.load(true);
    }).then(function () {
      return deckIds.reduce(function (pr, id) {
        return pr.then(function () { return Staff.loadDeckContent(id); }).then(function (content) {
          var d = Staff.deck(id);
          return Teach.giveDeck(d, content, [uid], null);
        });
      }, Promise.resolve());
    }).then(function () {
      var url = location.origin + location.pathname;
      var msg = 'Hi ' + name + '! Your Anchor account is ready.\n\n' + url + '\nEmail: ' + email + '\nPassword: ' + pass + '\n\nAdd it to your home screen so it works like an app.';
      Modal.open('<div class="m-title">Account ready ✓</div><div class="m-sub">Send them their login:</div>'
        + '<pre class="cred-box">' + esc(msg) + '</pre>'
        + '<div class="m-actions"><button class="btn" data-a="copy-text" data-text="' + esc(msg) + '">' + U.icon('share') + 'Copy message</button>'
        + '<button class="btn primary" data-a="acct-new-done" data-id="' + uid + '" data-role="' + role + '">Done</button></div>');
      rerender();
    }, function (e) { el.disabled = false; el.textContent = 'Create account'; FX.toast(e.message || 'Couldn’t create the account', 'amber', 4000); });
  };
  ACTIONS['acct-new-done'] = function (el) {
    Modal.close();
    var uid = el.getAttribute('data-id');
    App.go(el.getAttribute('data-role') === 'student' ? { v: 'student', id: uid } : { v: 'adminUser', id: uid });
  };
  ACTIONS['copy-text'] = function (el) {
    var t = el.getAttribute('data-text');
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { FX.toast('Copied ✓', 'green'); }, function () {
      var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); FX.toast('Copied ✓', 'green'); } catch (e) {} ta.remove();
    });
  };
})();

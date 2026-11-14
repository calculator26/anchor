/* ============================================================================
   Anchor · admin.js — the admin console (admin role only; enforced by RLS +
   the admin-users edge function, never just by hiding buttons).

   #/admin            every account: search, filter, sort, bulk actions
   #/admin/audit      who did what to whose account
   #/admin/user/:id   one account: profile + role, stats, open as user
                      (read-only, or Edit behind a typed confirmation),
                      backups (preview/download/restore), raw JSON editor,
                      password / email / delete.

   Editing someone else's Anchor is always merge-safe (revision-checked) and
   the database snapshots their account before the first edit of a session.
   ========================================================================== */
(function () {
  'use strict';

  window.ACTIONS = window.ACTIONS || {};
  var esc = function (s) { return U.esc(s); };
  var A = { q: '', filter: 'all', sort: 'doc_updated_at', dir: -1, sel: {}, audit: null, backups: {}, auth: {} };

  function rerender() { Staff.rerender(); }
  function loading(msg) { return '<div class="staff-loading"><div class="spinner"></div>' + esc(msg || 'Loading…') + '</div>'; }
  function kb(n) { return n ? (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB') : '—'; }
  function roleBadge(r) { return '<span class="role r-' + r + '">' + r + '</span>'; }
  function when(iso) { return iso ? U.ago(iso) : '—'; }

  var Admin = window.Admin = {};

  function tabs(cur) {
    return '<div class="staff-tabs"><a class="tabp' + (cur === 'users' ? ' on' : '') + '" href="#/admin">Users</a>'
      + '<a class="tabp' + (cur === 'audit' ? ' on' : '') + '" href="#/admin/audit">Audit log</a>'
      + '<a class="tabp admin-link" href="#/teach">' + U.icon('book', 'sm') + ' Teaching</a></div>';
  }

  Admin.view = function (route) {
    if (!Cloud.isAdmin()) return '<div class="staff-err">Admin only.</div>';
    if (!Staff.roster) { if (!Staff.err) Staff.load().then(rerender); return Staff.err ? '<div class="staff-err">' + esc(Staff.err) + '</div>' : loading('Loading accounts…'); }
    var head = '<div class="page-head"><div><div class="eyebrow admin-eye">Admin</div><h1>Accounts</h1>'
      + '<div class="ph-sub">' + U.plural(Staff.roster.length, 'account') + ' · ' + Staff.roster.filter(function (p) { return p.reviews_30d > 0; }).length + ' studied in the last 30 days</div></div>'
      + '<div class="ph-actions"><button class="btn" data-a="staff-reload">↻</button><button class="btn primary" data-a="acct-new">' + U.icon('plus') + 'Create account</button></div></div>';
    if (route.tab === 'audit') return head + tabs('audit') + viewAudit();
    return head + tabs('users') + viewUsers();
  };

  /* ─── Users table ──────────────────────────────────────────────────────── */
  var FILTERS = [['all', 'All'], ['students', 'My students'], ['tutors', 'Tutors'], ['active', 'Active 7d'], ['dormant', 'Dormant 30d+'], ['empty', 'No data']];
  var COLS = [
    ['name', 'Account'], ['role', 'Role'], ['created_at', 'Joined'], ['last_study_day', 'Last studied'], ['streak', 'Streak'],
    ['reviews_7d', '7d'], ['anchored', 'Anchored / studied'], ['bytes', 'Size'], ['doc_updated_at', 'Synced']
  ];

  function filtered() {
    var q = A.q.trim().toLowerCase(), me = Staff.meId();
    var today = Store.todayISO();
    return Staff.roster.filter(function (p) {
      if (q && (p.email + ' ' + p.display_name + ' ' + p.year_level).toLowerCase().indexOf(q) < 0) return false;
      if (A.filter === 'students') return p.role === 'student' && p.tutor_id === me;
      if (A.filter === 'tutors') return p.role === 'tutor' || p.role === 'admin';
      if (A.filter === 'active') return p.reviews_7d > 0;
      if (A.filter === 'dormant') return !p.last_study_day || (Date.parse(today) - Date.parse(p.last_study_day)) / 864e5 > 30;
      if (A.filter === 'empty') return !p.facets && !p.subjects && !p.chains;
      return true;
    }).sort(function (a, b) {
      var k = A.sort, va = k === 'name' ? Staff.name(a).toLowerCase() : a[k], vb = k === 'name' ? Staff.name(b).toLowerCase() : b[k];
      if (va == null) va = ''; if (vb == null) vb = '';
      return (va < vb ? -1 : va > vb ? 1 : 0) * A.dir;
    });
  }

  function viewUsers() {
    var counts = {};
    FILTERS.forEach(function (f) { var s = A.filter; A.filter = f[0]; var q = A.q; A.q = ''; counts[f[0]] = filtered().length; A.filter = s; A.q = q; });
    return '<div class="adm-bar"><input class="set-input adm-search" id="admSearch" placeholder="Search name, email, class…" value="' + esc(A.q) + '">'
      + '<div class="seg">' + FILTERS.map(function (f) {
        return '<button class="seg-o' + (A.filter === f[0] ? ' on' : '') + '" data-a="adm-filter" data-f="' + f[0] + '">' + f[1] + ' <em>' + counts[f[0]] + '</em></button>';
      }).join('') + '</div></div>'
      + '<div id="admBulk">' + bulkBar() + '</div>'
      + '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th class="ck"><input type="checkbox" data-a="adm-selall"></th>'
      + COLS.map(function (c) {
        return '<th data-a="adm-sort" data-k="' + c[0] + '" class="' + (A.sort === c[0] ? 'sorted' : '') + '">' + c[1] + (A.sort === c[0] ? (A.dir > 0 ? ' ↑' : ' ↓') : '') + '</th>';
      }).join('') + '</tr></thead><tbody id="admRows">' + rowsHtml() + '</tbody></table></div>';
  }
  function rowsHtml() {
    var list = filtered();
    if (!list.length) return '<tr><td colspan="' + (COLS.length + 1) + '" class="muted" style="padding:24px;text-align:center">No accounts match.</td></tr>';
    var me = Staff.meId();
    return list.map(function (p) {
      return '<tr data-a="adm-open" data-id="' + p.user_id + '" class="' + (A.sel[p.user_id] ? 'sel' : '') + '">'
        + '<td class="ck" data-stop="1"><input type="checkbox" data-a="adm-sel" data-id="' + p.user_id + '"' + (A.sel[p.user_id] ? ' checked' : '') + '></td>'
        + '<td><div class="adm-name"><b>' + esc(Staff.name(p)) + '</b><span>' + esc(p.email) + '</span></div></td>'
        + '<td>' + roleBadge(p.role) + (p.role === 'student' && p.tutor_id && p.tutor_id !== me ? ' <span class="muted">(' + esc(Staff.name(p.tutor_id)) + ')</span>' : '') + '</td>'
        + '<td>' + when(p.created_at) + '</td>'
        + '<td>' + (p.last_study_day ? U.fmtDate(p.last_study_day) : '—') + '</td>'
        + '<td>' + (p.streak || '—') + '</td>'
        + '<td>' + (p.reviews_7d || '—') + '</td>'
        + '<td>' + (p.facets ? p.anchored + '<span class="muted">/' + p.facets + '</span>' : '—') + '</td>'
        + '<td>' + kb(p.bytes) + '</td>'
        + '<td>' + when(p.doc_updated_at) + '</td></tr>';
    }).join('');
  }
  function bulkBar() {
    var ids = Object.keys(A.sel).filter(function (k) { return A.sel[k]; });
    if (!ids.length) return '';
    return '<div class="bulk-bar"><b>' + ids.length + ' selected</b>'
      + '<button class="btn sm" data-a="bulk-role" data-r="student">Make my students</button>'
      + '<button class="btn sm" data-a="bulk-role" data-r="user">Make regular users</button>'
      + '<button class="btn sm" data-a="bulk-assign">' + U.icon('target') + 'Set homework</button>'
      + '<button class="btn sm" data-a="bulk-export">' + U.icon('download') + 'Export data</button>'
      + '<button class="btn sm subtle" data-a="bulk-clear">Clear</button></div>';
  }
  function refreshTable() {
    var tb = document.getElementById('admRows'); if (tb) tb.innerHTML = rowsHtml();
    var bb = document.getElementById('admBulk'); if (bb) bb.innerHTML = bulkBar();
  }
  document.addEventListener('input', function (ev) {
    if (ev.target && ev.target.id === 'admSearch') { A.q = ev.target.value; refreshTable(); }
  });
  ACTIONS['adm-filter'] = function (el) { A.filter = el.getAttribute('data-f'); App.render(); };
  ACTIONS['adm-sort'] = function (el) {
    var k = el.getAttribute('data-k');
    if (A.sort === k) A.dir = -A.dir; else { A.sort = k; A.dir = (k === 'name' || k === 'role') ? 1 : -1; }
    App.render();
  };
  ACTIONS['adm-sel'] = function (el, ev) { ev.stopPropagation(); A.sel[el.getAttribute('data-id')] = el.checked; el.closest('tr').classList.toggle('sel', el.checked); var bb = document.getElementById('admBulk'); if (bb) bb.innerHTML = bulkBar(); };
  ACTIONS['adm-selall'] = function (el) { filtered().forEach(function (p) { A.sel[p.user_id] = el.checked; }); refreshTable(); };
  ACTIONS['bulk-clear'] = function () { A.sel = {}; refreshTable(); };
  ACTIONS['adm-open'] = function (el, ev) {
    if (ev.target.closest('[data-stop]')) return;
    App.go({ v: 'adminUser', id: el.getAttribute('data-id') });
  };
  function selIds() { return Object.keys(A.sel).filter(function (k) { return A.sel[k]; }); }
  ACTIONS['bulk-role'] = function (el) {
    var r = el.getAttribute('data-r'), ids = selIds().filter(function (id) { var p = Staff.person(id); return p && p.role !== 'admin'; });
    if (!ids.length) return;
    Modal.confirm((r === 'student' ? 'Make ' : 'Change ') + U.plural(ids.length, 'account') + (r === 'student' ? ' your students?' : ' to regular users?'),
      r === 'student' ? 'They’ll appear in your Teaching dashboard. Nothing in their Anchor changes.' : 'They leave any tutor’s roster. Nothing in their Anchor changes.',
      'Confirm', false, function () {
        Staff.sb().from('profiles').update({ role: r, tutor_id: r === 'student' ? Staff.meId() : null }).in('user_id', ids).then(function (res) {
          if (res.error) { FX.toast(res.error.message, 'amber'); return; }
          Staff.audit(null, 'bulk.role', { role: r, users: ids });
          A.sel = {}; FX.toast('Updated ✓', 'green'); Staff.reload();
        });
      });
  };
  ACTIONS['bulk-assign'] = function () {
    var ids = selIds(), non = ids.filter(function (id) { var p = Staff.person(id); return !p || p.role !== 'student'; });
    if (non.length) { FX.toast('Homework is for students — make them your students first.', 'amber', 3200); return; }
    Teach.assignModal({ students: ids });
  };
  ACTIONS['bulk-export'] = function () {
    var ids = selIds();
    Staff.sb().from('anchor_data').select('user_id, data, rev, updated_at').in('user_id', ids).then(function (res) {
      if (res.error) { FX.toast(res.error.message, 'amber'); return; }
      var out = (res.data || []).map(function (r) { var p = Staff.person(r.user_id); return { email: p && p.email, user_id: r.user_id, rev: r.rev, updated_at: r.updated_at, data: r.data }; });
      download('anchor-export-' + Store.todayISO() + '.json', JSON.stringify(out, null, 1));
      Staff.audit(null, 'bulk.export', { users: ids });
    });
  };
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ─── Audit log ────────────────────────────────────────────────────────── */
  function viewAudit() {
    if (!A.audit) {
      Staff.sb().from('admin_audit').select('id, actor, target, action, detail, at').order('at', { ascending: false }).limit(300).then(function (res) {
        A.audit = res.data || []; rerender();
      });
      return loading();
    }
    if (!A.audit.length) return '<div class="empty-hint">Nothing yet.</div>';
    return '<div class="audit-list">' + A.audit.map(auditRow).join('') + '</div>';
  }
  var ACTION_LABEL = {
    'doc.write': 'edited their Anchor', 'backup.restore': 'restored a backup', 'user.create': 'created the account',
    'user.set_password': 'set a new password', 'user.send_reset': 'sent a password reset', 'user.set_email': 'changed the email',
    'user.delete': 'deleted the account', 'bulk.role': 'changed roles', 'bulk.export': 'exported data', 'profile.update': 'updated the profile',
    'lens.edit': 'unlocked editing', 'json.save': 'saved raw JSON', 'progress.reset': 'reset progress'
  };
  function auditRow(e) {
    var d = e.detail || {}, extra = '';
    if (e.action === 'doc.write') extra = 'rev ' + d.rev;
    else if (e.action === 'bulk.role') extra = d.role + ' · ' + (d.users || []).length + ' accounts';
    else if (e.action === 'user.create') extra = d.role;
    else if (e.action === 'profile.update') extra = Object.keys(d).join(', ');
    return '<div class="audit-row"><span class="muted">' + new Date(e.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + '</span>'
      + '<span><b>' + esc(e.actor ? Staff.name(e.actor) : 'Database') + '</b> ' + esc(ACTION_LABEL[e.action] || e.action)
      + (e.target ? ' · <a href="#/admin/user/' + e.target + '">' + esc(Staff.person(e.target) ? Staff.name(e.target) : (d.email || 'deleted account')) + '</a>' : '')
      + (extra ? ' <span class="muted">· ' + esc(extra) + '</span>' : '') + '</span></div>';
  }

  /* ─── One account ──────────────────────────────────────────────────────── */
  Admin.userView = function (route) {
    if (!Cloud.isAdmin()) return '<div class="staff-err">Admin only.</div>';
    if (!Staff.roster) { Staff.load().then(rerender); return loading(); }
    var uid = route.id, p = Staff.person(uid);
    if (!p) return '<div class="staff-err">No such account.</div>' + U.backLink('#/admin', 'Accounts');
    var D = Staff.docs[uid];
    if (!D) { Staff.loadDoc(uid).then(rerender); return loading('Loading ' + Staff.name(p) + '…'); }
    if (!A.backups[uid]) {
      A.backups[uid] = 'loading';
      A.auth[uid] = { audit: [], info: null };
      Staff.sb().from('anchor_backups').select('id, taken_at, reason, kind, bytes, rev, taken_by').eq('user_id', uid).order('taken_at', { ascending: false }).limit(60)
        .then(function (r) { A.backups[uid] = r.data || []; rerender(); }, function () { A.backups[uid] = []; rerender(); });
      Staff.sb().from('admin_audit').select('id, actor, target, action, detail, at').eq('target', uid).order('at', { ascending: false }).limit(40)
        .then(function (r) { A.auth[uid].audit = r.data || []; rerender(); });
      Cloud.callAdmin('auth_info', { user_id: uid }).then(function (i) { A.auth[uid].info = i; rerender(); }, function () {});
    }
    var doc = D.data, me = Staff.meId(), isMe = uid === me, t = Ana.tally(doc);
    var html = U.crumbs([['Accounts', '#/admin'], [Staff.name(p)]]);
    html += '<div class="stu-head"><span class="avatar" style="--h:200;width:56px;height:56px;font-size:22px">' + esc(Staff.name(p).charAt(0).toUpperCase()) + '</span>'
      + '<div class="stu-id"><h1>' + esc(Staff.name(p)) + ' ' + roleBadge(p.role) + '</h1>'
      + '<div class="ph-sub">' + esc(p.email) + ' · joined ' + U.fmtDate(p.created_at) + ' · last sign-in ' + when(p.last_sign_in_at) + '</div></div>'
      + '<div class="ph-actions">'
      + (isMe ? '<span class="muted">This is you.</span>' :
        '<button class="btn" data-a="adm-viewas" data-id="' + uid + '">' + U.icon('home') + 'View as user</button>'
        + '<button class="btn warn" data-a="adm-editas" data-id="' + uid + '">' + U.icon('edit') + 'Edit as user…</button>')
      + (p.role === 'student' ? '<a class="btn" href="#/teach/student/' + uid + '">' + U.icon('book') + 'Tutor view</a>' : '')
      + '</div></div>';

    html += '<div class="today stu-tiles">'
      + '<div class="tile"><div class="t-lbl">Content</div><div class="t-mid">' + (doc.subjects || []).length + '<span> subjects</span></div><div class="t-sub">' + (doc.essays || []).length + ' essays · ' + (doc.chains || []).length + ' chains · ' + t.n + ' facets</div></div>'
      + '<div class="tile"><div class="t-lbl">Anchored</div><div class="t-mid">' + t.v + '<span>/' + t.n + '</span></div><div class="t-sub">streak ' + (p.streak || 0) + ' · ' + (p.reviews_30d || 0) + ' reviews / 30d</div></div>'
      + '<div class="tile"><div class="t-lbl">Document</div><div class="t-mid">' + kb(p.bytes) + '</div><div class="t-sub">rev ' + (D.rev || 0) + ' · synced ' + when(D.at) + (D.by && D.by !== uid ? ' by ' + esc(Staff.name(D.by)) : '') + '</div></div>'
      + '</div>';

    // Profile
    html += '<div class="sec-title"><span>Profile</span></div><div class="set-card adm-profile">'
      + '<div class="m-row two"><div><label class="m-lbl">Name</label><input class="m-input" id="apName" value="' + esc(p.display_name) + '"></div>'
      + '<div><label class="m-lbl">Year / class</label><input class="m-input" id="apYear" value="' + esc(p.year_level) + '"></div></div>'
      + '<div class="m-row two"><div><label class="m-lbl">Role</label>'
      + (p.role === 'admin' ? '<div class="muted" style="padding:10px 0">Admin — can only be changed from the database console.</div>'
        : '<select class="m-input" id="apRole">' + ['user', 'student', 'tutor'].map(function (r) { return '<option value="' + r + '"' + (p.role === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select>')
      + '</div><div><label class="m-lbl">Tutor</label>' + (p.role === 'admin' ? '<div class="muted" style="padding:10px 0">—</div>'
        : '<select class="m-input" id="apTutor"><option value="">None</option>' + Staff.roster.filter(function (x) { return x.role === 'tutor' || x.role === 'admin'; }).map(function (x) {
          return '<option value="' + x.user_id + '"' + (p.tutor_id === x.user_id ? ' selected' : '') + '>' + esc(Staff.name(x)) + '</option>';
        }).join('') + '</select>') + '</div></div>'
      + '<div class="m-actions" style="justify-content:flex-start;margin:0"><button class="btn primary" data-a="adm-profile-save" data-id="' + uid + '">Save profile</button>'
      + (p.role !== 'student' && !isMe ? '<button class="btn" data-a="adm-make-student" data-id="' + uid + '">Make my student</button>' : '') + '</div></div>';

    // Content
    var rows = Ana.subjectRows(doc);
    html += '<div class="sec-title"><span>Their Anchor</span></div>' + (rows.length ? '<div class="sub-rows">' + rows.map(function (r) {
      return '<div class="sub-row"><span class="sub-n">' + U.icon(r.essay ? 'doc' : 'book', 'sm') + esc(r.name) + (r.src ? ' <span class="pill">⚓ ' + esc(r.src.by || 'deck') + '</span>' : '') + '</span>'
        + '<div class="bar"><span style="width:' + U.pct(r.v, r.n) + '%"></span></div><span class="muted">' + r.v + '/' + r.n + '</span></div>';
    }).join('') + '</div>' : '<div class="empty-hint">Empty.</div>');

    // Backups
    var bk = A.backups[uid];
    html += '<div class="sec-title"><span>Backups</span><span class="muted hide-sm">— taken automatically daily, before any admin edit, and before big deletions</span></div>';
    html += '<div class="m-actions" style="justify-content:flex-start;margin:0 0 10px"><button class="btn sm" data-a="adm-backup-now" data-id="' + uid + '">' + U.icon('download') + 'Take a backup now</button>'
      + '<button class="btn sm" data-a="adm-download" data-id="' + uid + '">Download current JSON</button></div>';
    html += bk === 'loading' ? loading() : bk.length ? '<div class="bk-list">' + bk.map(function (b) {
      return '<div class="bk-row"><div><b>' + new Date(b.taken_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + '</b> <span class="role r-' + esc(b.kind) + '">' + esc(b.kind) + '</span>'
        + '<div class="muted" style="font-size:12px">' + esc(b.reason || '') + ' · ' + kb(b.bytes) + (b.rev ? ' · rev ' + b.rev : '') + '</div></div>'
        + '<div class="bk-act"><button class="btn xs" data-a="adm-bk-peek" data-id="' + b.id + '" data-u="' + uid + '">Preview</button>'
        + '<button class="btn xs" data-a="adm-bk-dl" data-id="' + b.id + '">Download</button>'
        + '<button class="btn xs warn" data-a="adm-bk-restore" data-id="' + b.id + '" data-u="' + uid + '">Restore</button></div></div>';
    }).join('') + '</div>' : '<div class="empty-hint">No backups yet.</div>';

    // Account / danger
    var info = A.auth[uid] && A.auth[uid].info;
    html += '<div class="sec-title"><span>Account</span></div><div class="set-card adm-acct">'
      + (info ? '<div class="muted" style="margin-bottom:10px">Email ' + (info.confirmed ? 'confirmed' : '<b>not confirmed</b>') + ' · last sign-in ' + when(info.last_sign_in_at) + '</div>' : '')
      + '<div class="m-actions" style="justify-content:flex-start;margin:0;flex-wrap:wrap">'
      + '<button class="btn sm" data-a="stu-pass" data-id="' + uid + '">Set password</button>'
      + '<button class="btn sm" data-a="adm-reset-email" data-id="' + uid + '">Email a reset link</button>'
      + '<button class="btn sm" data-a="adm-email" data-id="' + uid + '">Change email</button>'
      + (isMe ? '' : '<button class="btn sm" data-a="adm-json" data-id="' + uid + '">Raw JSON…</button>'
        + '<button class="btn sm warn" data-a="adm-reset-progress" data-id="' + uid + '">Reset progress…</button>'
        + (p.role !== 'admin' ? '<button class="btn sm warn" data-a="adm-delete" data-id="' + uid + '">Delete account…</button>' : ''))
      + '</div></div>';

    var aud = A.auth[uid] && A.auth[uid].audit;
    if (aud && aud.length) html += '<div class="sec-title"><span>Activity on this account</span></div><div class="audit-list">' + aud.map(auditRow).join('') + '</div>';
    return html;
  };

  function invalidate(uid) { delete Staff.docs[uid]; delete A.backups[uid]; delete A.auth[uid]; A.audit = null; }

  ACTIONS['adm-profile-save'] = function (el) {
    var uid = el.getAttribute('data-id'), p = Staff.person(uid);
    var patch = { display_name: document.getElementById('apName').value.trim(), year_level: document.getElementById('apYear').value.trim() };
    var r = document.getElementById('apRole'), t = document.getElementById('apTutor');
    if (r) patch.role = r.value;
    if (t) patch.tutor_id = t.value || null;
    if (patch.role === 'student' && !patch.tutor_id) patch.tutor_id = Staff.meId();
    if (patch.role && patch.role !== 'student' && p.role === 'student' && t && t.value === p.tutor_id) patch.tutor_id = null;
    Staff.sb().from('profiles').update(patch).eq('user_id', uid).then(function (res) {
      if (res.error) { FX.toast(res.error.message, 'amber', 3500); return; }
      Staff.audit(uid, 'profile.update', patch);
      FX.toast('Saved ✓', 'green'); invalidate(uid); Staff.reload();
    });
  };
  ACTIONS['adm-make-student'] = function (el) {
    var uid = el.getAttribute('data-id');
    Staff.sb().from('profiles').update({ role: 'student', tutor_id: Staff.meId() }).eq('user_id', uid).then(function (res) {
      if (res.error) { FX.toast(res.error.message, 'amber'); return; }
      Staff.audit(uid, 'profile.update', { role: 'student' });
      FX.toast(Staff.name(uid) + ' is now your student ✓', 'green'); Staff.reload();
    });
  };

  /* view / edit as — editing a non-student is behind a typed confirmation */
  ACTIONS['adm-viewas'] = function (el) { Teach.openAs(el.getAttribute('data-id'), { back: { v: 'adminUser', id: el.getAttribute('data-id') } }); };
  ACTIONS['adm-editas'] = function (el) {
    var uid = el.getAttribute('data-id');
    Admin.wall(uid, 'Edit ' + Staff.name(uid) + '’s Anchor', 'Changes save straight to their account (merge-safe; a backup is taken first).', function () {
      Staff.audit(uid, 'lens.edit', {});
      Teach.openAs(uid, { edit: true, back: { v: 'adminUser', id: uid } });
    });
  };
  // A deliberate speed bump: type the account's email to continue.
  Admin.wall = function (uid, title, sub, then) {
    var p = Staff.person(uid);
    Modal.open('<div class="m-title">' + esc(title) + '</div><div class="m-sub">' + esc(sub) + '</div>'
      + '<div class="wall-box">Type <b class="mono">' + esc(p.email) + '</b> to continue</div>'
      + '<input class="m-input mono" id="wallIn" autocomplete="off" spellcheck="false">'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn warn" data-a="wall-ok" disabled>Continue</button></div>',
      function (root) {
        var inp = root.querySelector('#wallIn'), ok = root.querySelector('[data-a=wall-ok]');
        inp.oninput = function () { ok.disabled = inp.value.trim().toLowerCase() !== p.email.toLowerCase(); };
        enterSubmits(root, 'wall-ok');
      });
    ACTIONS['wall-ok'] = function () { Modal.close(); then(); };
  };

  /* backups */
  ACTIONS['adm-backup-now'] = function (el) {
    var uid = el.getAttribute('data-id');
    Cloud.rpc('take_backup', { p_user: uid, p_reason: 'manual backup by ' + ((Cloud.me() && Cloud.me().display_name) || 'admin') }).then(function (res) {
      if (res.error) { FX.toast(res.error.message, 'amber'); return; }
      FX.toast('Backup taken ✓', 'green'); delete A.backups[uid]; rerender();
    });
  };
  function getBackup(id) {
    return Staff.sb().from('anchor_backups').select('data, taken_at, user_id').eq('id', id).single().then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function summary(doc) {
    var t = Ana.tally(doc);
    return (doc.subjects || []).length + ' subjects · ' + (doc.essays || []).length + ' essays · ' + (doc.chains || []).length + ' chains · ' + t.n + ' facets · ' + t.v + ' anchored · ' + Object.keys(doc.act || {}).length + ' study days';
  }
  ACTIONS['adm-bk-peek'] = function (el) {
    var uid = el.getAttribute('data-u');
    getBackup(el.getAttribute('data-id')).then(function (b) {
      var cur = Staff.docs[uid].data;
      Modal.open('<div class="m-title">Backup from ' + new Date(b.taken_at).toLocaleString('en-AU') + '</div>'
        + '<div class="m-row"><label class="m-lbl">Backup</label><div>' + esc(summary(b.data)) + '</div><div class="muted" style="font-size:12px;margin-top:4px">' + esc((b.data.subjects || []).map(function (s) { return s.name; }).join(' · ')) + '</div></div>'
        + '<div class="m-row"><label class="m-lbl">Now</label><div>' + esc(summary(cur)) + '</div><div class="muted" style="font-size:12px;margin-top:4px">' + esc((cur.subjects || []).map(function (s) { return s.name; }).join(' · ')) + '</div></div>'
        + '<div class="m-actions"><button class="btn primary" data-a="modal-close">Close</button></div>');
    }, function (e) { FX.toast(e.message, 'amber'); });
  };
  ACTIONS['adm-bk-dl'] = function (el) {
    getBackup(el.getAttribute('data-id')).then(function (b) {
      var p = Staff.person(b.user_id);
      download('anchor-' + ((p && p.email) || b.user_id).split('@')[0] + '-' + b.taken_at.slice(0, 16).replace(/[:T]/g, '-') + '.json', JSON.stringify(b.data, null, 1));
    });
  };
  ACTIONS['adm-download'] = function (el) {
    var uid = el.getAttribute('data-id'), p = Staff.person(uid);
    Staff.loadDoc(uid, true).then(function (D) { download('anchor-' + p.email.split('@')[0] + '-' + Store.todayISO() + '.json', JSON.stringify(D.data, null, 1)); });
  };
  ACTIONS['adm-bk-restore'] = function (el) {
    var id = Number(el.getAttribute('data-id')), uid = el.getAttribute('data-u');
    Admin.wall(uid, 'Restore this backup?', 'Their whole Anchor goes back to that version, on every device. The current version is backed up first, so this is undoable.', function () {
      Cloud.rpc('restore_backup', { p_backup: id }).then(function (res) {
        if (res.error) { FX.toast(res.error.message, 'amber', 3500); return; }
        FX.toast('Restored ✓ — their devices pick it up next time they open Anchor.', 'green', 3500);
        invalidate(uid); Staff.reload();
      });
    });
  };

  /* raw JSON editor */
  ACTIONS['adm-json'] = function (el) {
    var uid = el.getAttribute('data-id');
    Admin.wall(uid, 'Raw JSON for ' + Staff.name(uid), 'Full control over their document. Invalid edits are refused; a backup is taken before saving.', function () {
      Staff.loadDoc(uid, true).then(function (D) {
        Modal.open('<div class="m-title">Raw JSON · rev ' + D.rev + '</div>'
          + '<textarea class="m-ta mono json-ed" id="jsonEd" spellcheck="false">' + esc(JSON.stringify(D.data, null, 2)) + '</textarea>'
          + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn warn" data-a="adm-json-save" data-id="' + uid + '" data-rev="' + D.rev + '">Save to their account</button></div>');
        document.querySelector('.modal').classList.add('wide');
      });
    });
  };
  ACTIONS['adm-json-save'] = function (el) {
    var uid = el.getAttribute('data-id'), rev = Number(el.getAttribute('data-rev')), doc;
    try { doc = JSON.parse(document.getElementById('jsonEd').value); } catch (e) { FX.toast('Not valid JSON: ' + e.message, 'amber', 4000); return; }
    if (!doc || doc.v !== 2 || !Array.isArray(doc.subjects) || typeof doc.state !== 'object') { FX.toast('That isn’t an Anchor v2 document (needs v:2, subjects[], state{}).', 'amber', 4000); return; }
    Cloud.rpc('save_anchor', { p_user: uid, p_data: doc, p_base_rev: rev }).then(function (res) {
      if (res.error) { FX.toast(res.error.message, 'amber'); return; }
      if (!res.data.ok) { FX.toast('They changed something meanwhile (now rev ' + res.data.rev + '). Reopen the editor to get the latest.', 'amber', 5000); return; }
      Staff.audit(uid, 'json.save', { rev: res.data.rev });
      Modal.close(); FX.toast('Saved ✓ (rev ' + res.data.rev + ')', 'green'); invalidate(uid); rerender();
    });
  };

  ACTIONS['adm-reset-progress'] = function (el) {
    var uid = el.getAttribute('data-id');
    Admin.wall(uid, 'Reset ' + Staff.name(uid) + '’s progress?', 'Clears every card’s study history, streaks and celebrations. Their subjects, cards and chains stay. A backup is taken first.', function () {
      Cloud.rpc('take_backup', { p_user: uid, p_reason: 'before progress reset' }).then(function () {
        return Cloud.mutateDoc(uid, function (doc) { doc.state = {}; doc.act = {}; if (doc.meta) doc.meta.milestones = []; });
      }).then(function () { Staff.audit(uid, 'progress.reset', {}); FX.toast('Progress reset ✓', 'green'); invalidate(uid); Staff.reload(); },
        function (e) { FX.toast(e.message, 'amber'); });
    });
  };
  ACTIONS['adm-reset-email'] = function (el) {
    var uid = el.getAttribute('data-id');
    Cloud.callAdmin('send_reset', { user_id: uid, redirect: location.origin + location.pathname }).then(function () {
      FX.toast('Reset link emailed to ' + Staff.person(uid).email, 'green', 3500);
    }, function (e) { FX.toast(e.message, 'amber', 3500); });
  };
  ACTIONS['adm-email'] = function (el) {
    var uid = el.getAttribute('data-id'), p = Staff.person(uid);
    Modal.open('<div class="m-title">Change email</div><div class="m-sub">They’ll sign in with the new email from now on (no confirmation needed).</div>'
      + '<input class="m-input" id="newEmail" type="email" value="' + esc(p.email) + '">'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button><button class="btn primary" data-a="adm-email-ok" data-id="' + uid + '">Change</button></div>');
  };
  ACTIONS['adm-email-ok'] = function (el) {
    var uid = el.getAttribute('data-id');
    Cloud.callAdmin('set_email', { user_id: uid, email: document.getElementById('newEmail').value }).then(function () {
      Modal.close(); FX.toast('Email changed ✓', 'green'); invalidate(uid); Staff.reload();
    }, function (e) { FX.toast(e.message, 'amber', 3500); });
  };
  ACTIONS['adm-delete'] = function (el) {
    var uid = el.getAttribute('data-id'), p = Staff.person(uid);
    Admin.wall(uid, 'Delete ' + Staff.name(uid) + '’s account?', 'Permanently removes their login, their Anchor and its backups. A final copy of their data is kept in the audit log. This can’t be undone from the app.', function () {
      Cloud.callAdmin('delete', { user_id: uid, confirm_email: p.email }).then(function () {
        FX.toast('Account deleted', 'green'); invalidate(uid); Staff.load(true).then(function () { App.go({ v: 'admin' }); });
      }, function (e) { FX.toast(e.message, 'amber', 3500); });
    });
  };
})();

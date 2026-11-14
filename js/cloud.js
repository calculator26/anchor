/* ============================================================================
   Anchor · cloud.js — accounts + cloud sync (Supabase).
   Sign in with email + password; the whole Anchor state syncs as ONE
   JSON document per user (exactly what localStorage holds). localStorage
   stays the offline cache. Every save is revision-checked: if the cloud copy
   moved on (another device, or your tutor), both versions are merged
   (js/merge.js) — nothing is ever silently overwritten.
   Also: roles (profiles), the "lens" that lets a tutor/admin work inside a
   student's account, and the admin edge-function client.
   Degrades gracefully: no config → local-only exactly as before;
   offline → keep studying locally, sync resumes when the network returns.
   Loads after store.js, before the UI modules.
   ========================================================================== */
(function () {
  'use strict';

  window.ACTIONS = window.ACTIONS || {};

  var LIB_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  var TABLE = 'anchor_data';
  var DIRTY = 'anchor_dirty';    // '1' → local changes not yet confirmed in the cloud
  var USERKEY = 'anchor_user';   // remembered sign-in email (for offline boots)
  var UIDKEY = 'anchor_uid';     // which account owns the local cache (shared-device guard)

  var sb = null, user = null;
  var mode = 'off';              // off | gate | gate-offline | offline | on
  var lastSync = null;
  var GATE = { tab: 'in', err: '', notice: '', busy: false };

  /* --- config / lib ---------------------------------------------------- */
  function cfg() { return window.ANCHOR_CONFIG || {}; }
  function configured() {
    var c = cfg();
    return typeof c.SUPABASE_URL === 'string' && c.SUPABASE_URL.indexOf('https://') === 0
      && c.SUPABASE_URL.indexOf('PASTE') < 0
      && typeof c.SUPABASE_ANON_KEY === 'string' && c.SUPABASE_ANON_KEY.length > 20
      && c.SUPABASE_ANON_KEY.indexOf('PASTE') < 0;
  }
  function ensureLib(cb) {
    if (window.supabase) return cb(true);
    var s = document.createElement('script');
    s.src = LIB_URL;
    s.onload = function () { cb(!!window.supabase); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  function client() {
    if (!sb && window.supabase) {
      sb = window.supabase.createClient(cfg().SUPABASE_URL, cfg().SUPABASE_ANON_KEY);
      sb.auth.onAuthStateChange(function (event, session) {
        if (event === 'PASSWORD_RECOVERY' && session) {
          // Arrived via a reset link — they're signed in; ask for the new password.
          onSignedIn(session.user, true);
          showRecoveryForm();
        } else if (event === 'SIGNED_IN' && session && mode !== 'on') {
          // e.g. arriving straight from the email confirmation link.
          onSignedIn(session.user);
        } else if (event === 'SIGNED_OUT' && mode === 'on') {
          // Session expired or revoked elsewhere. Keep local data — anything
          // unsynced pushes automatically after they sign back in.
          user = null; mode = 'gate';
          GATE.err = 'You were signed out — sign in again to keep syncing.'; GATE.notice = '';
          setChip('off'); App.render();
        }
      });
    }
    return sb;
  }

  // Central sign-in landing — safe to call twice (auth event + promise race).
  function onSignedIn(u, quietToast) {
    if (mode === 'on' && user && user.id === u.id) return;
    user = u;
    try { localStorage.setItem(USERKEY, u.email || ''); } catch (e) {}
    mode = 'on';
    GATE.err = ''; GATE.notice = ''; GATE.busy = false;
    document.body.classList.remove('gated');
    if (!quietToast) FX.toast('Welcome aboard ⚓', 'green');
    App.render(); App.renderTop();
    syncOnStart();
  }

  function appUrl() { return location.origin + location.pathname; }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

  function isDirty() { try { return localStorage.getItem(DIRTY) === '1'; } catch (e) { return false; } }
  function setDirty(on) {
    try { if (on) localStorage.setItem(DIRTY, '1'); else localStorage.removeItem(DIRTY); } catch (e) {}
  }
  function savedUser() { try { return localStorage.getItem(USERKEY) || ''; } catch (e) { return ''; } }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', Store.data().settings.theme || 'dark');
  }

  /* --- boot -------------------------------------------------------------- */
  function init() {
    if (!configured()) { mode = 'off'; App.render(); return; }
    ensureLib(function (ok) {
      if (!ok) {
        // No network for the auth library. If someone was signed in on this
        // device, let them keep studying locally; changes sync on reconnect.
        mode = savedUser() ? 'offline' : 'gate-offline';
        setChip(mode === 'offline' ? 'warn' : 'off');
        App.render();
        return;
      }
      client().auth.getSession().then(function (res) {
        var session = res && res.data && res.data.session;
        if (!session) { mode = 'gate'; setChip('off'); App.render(); return; }
        user = session.user;
        mode = 'on';
        App.render(); App.renderTop();   // instant paint from the local cache
        syncOnStart();
      }, function () {
        mode = savedUser() ? 'offline' : 'gate-offline';
        setChip(mode === 'offline' ? 'warn' : 'off');
        App.render();
      });
    });
  }

  /* --- DocSync · revision-checked saves with three-way merge ----------------
     One DocSync per account being edited: yours, and (while a tutor/admin is
     inside someone else's Anchor) theirs. A save names the revision it was
     built on; if the server has moved on, it hands back the current copy,
     we merge base→local with base→remote (js/merge.js) and save again.
     Nothing is ever silently overwritten — on any device, by anyone. */
  var BASEKEY = 'anchor_base', REVKEY = 'anchor_rev';

  function rpc(name, args) { return client().rpc(name, args); }

  function DocSync(uid, opts) {
    this.uid = uid;
    this.persist = !!opts.persist;
    this.isActive = opts.isActive;
    this.onState = opts.onState || function () {};
    this.base = null; this.rev = 0;
    this.busy = false; this.again = false; this.timer = null;
    this.seq = 0; this.dirtyMem = false; this.waiters = []; this.conflicts = 0;
    if (this.persist) {
      try {
        var b = localStorage.getItem(BASEKEY);
        this.base = b ? JSON.parse(b) : null;
        this.rev = parseInt(localStorage.getItem(REVKEY) || '0', 10) || 0;
      } catch (e) { this.base = null; this.rev = 0; }
    }
  }
  DocSync.prototype.dirty = function () { return this.persist ? isDirty() : this.dirtyMem; };
  DocSync.prototype.setDirtyFlag = function (on) { if (this.persist) setDirty(on); else this.dirtyMem = on; };
  DocSync.prototype.remember = function (base, rev) {
    this.base = base; this.rev = rev;
    if (!this.persist) return;
    try {
      localStorage.setItem(REVKEY, String(rev));
      // The merge base doubles local storage, so big accounts keep it in memory
      // only (after a reload with unsynced edits they union-merge instead).
      var json = JSON.stringify(base);
      if (json.length < 400000) localStorage.setItem(BASEKEY, json); else localStorage.removeItem(BASEKEY);
    } catch (e) { try { localStorage.removeItem(BASEKEY); } catch (e2) {} }
  };
  DocSync.prototype.onLocalSave = function () {
    this.seq++;
    this.setDirtyFlag(true);
    if (mode !== 'on') { this.onState('warn'); return; }
    this.onState('sync');
    var self = this;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.push(); }, 1200);
  };
  DocSync.prototype.finish = function (ok) {
    var w = this.waiters; this.waiters = [];
    w.forEach(function (cb) { try { cb(ok); } catch (e) {} });
  };
  DocSync.prototype.push = function (cb) {
    var self = this;
    if (cb) self.waiters.push(cb);
    if (!client() || !user || !self.isActive()) { self.finish(false); return; }
    if (self.busy) { self.again = true; return; }
    clearTimeout(self.timer);
    self.busy = true;
    var at = self.seq;
    var snap = Merge.clone(Store.data());
    self.onState('sync');
    rpc('save_anchor', { p_user: self.uid, p_data: snap, p_base_rev: self.rev || 0 }).then(function (res) {
      self.busy = false;
      if (!self.isActive()) { self.finish(false); return; }
      if (res.error || !res.data) {
        console.error('Anchor sync:', res.error && res.error.message);
        self.onState('err'); self.finish(false); return;
      }
      var d = res.data;
      if (d.ok) {
        self.conflicts = 0;
        self.remember(snap, d.rev);
        lastSync = d.updated_at;
        if (self.persist) { try { localStorage.setItem(UIDKEY, user.id); } catch (e) {} }
        if (self.seq === at) { self.setDirtyFlag(false); self.onState('ok'); }
        if (self.again || self.seq !== at) { self.again = false; self.push(); return; }
        self.finish(true);
        return;
      }
      // Someone else saved since our base: merge, adopt, save again.
      if (++self.conflicts > 6) { self.onState('err'); self.finish(false); return; }
      var merged = Merge.three(self.base, Store.data(), d.data);
      self.remember(d.data, d.rev);
      Store.setDoc(Merge.clone(merged));   // never share objects with `base`
      self.seq++;
      softRender();
      self.push();
    }, function () { self.busy = false; self.onState(mode === 'on' ? 'err' : 'warn'); self.finish(false); });
  };
  // Cheap freshness check: compare revisions, fetch only if they differ.
  DocSync.prototype.refresh = function (force) {
    var self = this;
    if (mode !== 'on' || !client() || !user || !self.isActive() || self.busy) return;
    if (App.sess || App.route.v === 'session') return;      // never yank a live session
    client().from(TABLE).select('rev').eq('user_id', self.uid).maybeSingle().then(function (res) {
      if (res.error || !self.isActive()) return;
      var r = res.data ? res.data.rev : 0;
      if (r === self.rev && !force) { if (!self.dirty()) self.onState('ok'); return; }
      if (self.dirty()) { self.push(); return; }              // the save will merge
      if (r === self.rev) return;
      fetchRow(self.uid).then(function (row) {
        if (!row || !self.isActive() || self.dirty() || self.busy) return;
        self.remember(row.data, row.rev);
        lastSync = row.updated_at;
        Store.setDoc(Merge.clone(row.data));
        applyTheme(); softRender();
        self.onState('ok');
        if (self.persist) afterOwnSync();
      });
    }, function () {});
  };

  function fetchRow(uid) {
    return client().from(TABLE).select('data, rev, updated_at, updated_by').eq('user_id', uid).maybeSingle()
      .then(function (res) { if (res.error) throw res.error; return res.data; });
  }

  // Re-render unless the person is mid-session or mid-typing.
  function softRender() {
    var a = document.activeElement;
    var typing = a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox'));
    if (App.route.v === 'session' || typing || document.querySelector('#modal-root .modal')) { App.renderTop(); return; }
    App.render();
  }

  var own = null;    // DocSync for the signed-in account
  var lens = null;   // DocSync for the account a tutor/admin is inside

  function ownSync() {
    if (!own || own.uid !== (user && user.id)) {
      own = new DocSync(user.id, { persist: true, isActive: function () { return !Store.lens(); }, onState: function (s) { if (!lens) setChip(s); } });
    }
    return own;
  }

  // Reconcile this device's copy with the cloud copy after sign-in / boot.
  function syncOnStart() {
    var o = ownSync();
    var owner = null;
    try { owner = localStorage.getItem(UIDKEY); } catch (e) {}
    setChip('sync');
    var at = o.seq;
    fetchRow(user.id).then(function (row) {
      if (Store.lens()) return;
      if (!row) {
        // first sign-in for this account: adopt this device's data unless it's someone else's
        if (owner && owner !== user.id) { Store.setDoc(null); App.render(); App.renderTop(); }
        o.rev = 0; o.push(); loadMe();
        return;
      }
      if (owner && owner !== user.id) {
        o.setDirtyFlag(false);
        Store.setDoc(Merge.clone(row.data));
      } else if (o.dirty() || o.seq !== at) {
        // unsynced changes here + whatever happened elsewhere → merge both
        Store.setDoc(Merge.clone(Merge.three(o.base, Store.data(), row.data)));
        o.remember(row.data, row.rev);
        o.seq++;
        o.push();
      } else {
        Store.setDoc(Merge.clone(row.data));
      }
      if (!o.dirty()) o.remember(row.data, row.rev);
      lastSync = row.updated_at;
      try { localStorage.setItem(UIDKEY, user.id); } catch (e) {}
      applyTheme(); App.render(); App.renderTop();
      if (!o.dirty()) setChip('ok');
      loadMe();
    }, function () { setChip(isDirty() ? 'warn' : 'err'); loadMe(); });
  }

  /* --- who am I (role) ----------------------------------------------------- */
  var ME = null;
  function loadMe() {
    if (!client() || !user) return;
    client().from('profiles').select('*').eq('user_id', user.id).maybeSingle().then(function (res) {
      ME = res.data || { user_id: user.id, role: 'user', display_name: '', email: user.email };
      App.renderTop();
      afterOwnSync();
      if (window.Teach && ME.role !== 'user' && ME.role !== 'student') Teach.prefetch && Teach.prefetch();
    }, function () {});
  }
  function afterOwnSync() { if (window.Classroom && ME) Classroom.refresh(); }

  /* --- sync entry points used by store.js / UI ----------------------------- */
  function onLocalSave() {
    if (mode === 'off') return;
    if (Store.lens()) return;          // lens saves go to the lens owner (see openLens)
    if (!user) { setDirty(true); if (mode !== 'on') setChip('warn'); return; }
    ownSync().onLocalSave();
  }
  function pushNow(cb) {
    if (!user) { if (cb) cb(false); return; }
    ownSync().push(cb);
  }
  function maybeRefresh(force) {
    if (lens) { lens.refresh(force); return; }
    if (own) own.refresh(force);
  }

  var lastFocusCheck = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (mode !== 'on') return;
      if (lens && lens.dirty()) lens.push();
      else if (own && own.dirty() && !Store.lens()) own.push();     // best-effort flush
    } else {
      if (Date.now() - lastFocusCheck > 8000) { lastFocusCheck = Date.now(); maybeRefresh(false); if (window.Classroom && ME && !Store.lens()) Classroom.refresh(); }
    }
  });
  // while visible, check for changes made elsewhere (e.g. your tutor added cards)
  setInterval(function () { if (document.visibilityState === 'visible') maybeRefresh(false); }, 45000);
  window.addEventListener('online', function () {
    if (mode === 'on') { if (lens && lens.dirty()) lens.push(); else if (isDirty()) pushNow(); }
    else if (mode === 'offline' || mode === 'gate-offline') init();
  });

  /* --- LENS · open someone else's Anchor as if you were them ---------------- */
  function openLens(uid, info) {
    info = info || {};
    return new Promise(function (resolve, reject) {
      if (!user || mode !== 'on') return reject(new Error('You need to be online.'));
      if (uid === user.id) return reject(new Error('That’s your own account.'));
      var go = function () {
        fetchRow(uid).then(function (row) {
          if (Store.lens()) closeLensNow();
          var doc = row ? row.data : Store.blankDoc();
          lens = new DocSync(uid, {
            persist: false,
            isActive: function () { var l = Store.lens(); return !!l && l.uid === uid; },
            onState: function (s) { setChip(s); }
          });
          lens.remember(Merge.clone(doc), row ? row.rev : 0);
          lastSync = row ? row.updated_at : null;
          Store.enterLens(Merge.clone(doc), {
            uid: uid, tutor: !!info.tutor,
            onSave: function () {
              if (!App.viewAs || !App.viewAs.edit) {
                Store.setDoc(Merge.clone(lens.base));           // read-only: undo instantly
                readOnlyNudge();
                return;
              }
              lens.onLocalSave();
            }
          });
          setChip('ok');
          resolve(row);
        }, reject);
      };
      // never leave your own changes unsynced while you're away from them
      if (isDirty() && own) own.push(function () { go(); }); else go();
    });
  }
  var nudgeAt = 0;
  function readOnlyNudge() {
    if (Date.now() - nudgeAt < 2500) return;
    nudgeAt = Date.now();
    FX.toast('Read-only view — nothing was changed. Unlock editing in the banner to make changes.', 'amber', 3200);
  }
  function closeLensNow() {
    Store.exitLens();
    lens = null;
    setChip(isDirty() ? 'warn' : 'ok');
  }
  function closeLens() {
    return new Promise(function (resolve) {
      if (!lens) { closeLensNow(); resolve(true); return; }
      var l = lens;
      var done = function (ok) { closeLensNow(); if (own) own.refresh(true); resolve(ok); };
      if (l.dirty()) l.push(done); else done(true);
    });
  }
  function lensState() { return lens ? { uid: lens.uid, dirty: lens.dirty(), rev: lens.rev } : null; }

  /* --- mutate any account's document safely (used by assignments) ---------- */
  function saveLoop(uid, base, local, rev, n) {
    return rpc('save_anchor', { p_user: uid, p_data: local, p_base_rev: rev || 0 }).then(function (res) {
      if (res.error) throw res.error;
      var d = res.data;
      if (d.ok) return d;
      if (n > 5) throw new Error('Too many conflicting saves — try again.');
      return saveLoop(uid, d.data, Merge.three(base, local, d.data), d.rev, n + 1);
    });
  }
  function mutateDoc(uid, fn) {
    var l = Store.lens();
    if ((l && l.uid === uid) || (!l && user && uid === user.id)) {
      // the document is already open here: change it in place and let its sync save it
      fn(Store.data());
      Store.save();
      return Promise.resolve({ ok: true, live: true });
    }
    return fetchRow(uid).then(function (row) {
      var base = row ? row.data : null;
      var local = Merge.clone(base) || Store.blankDoc();
      fn(local);
      return saveLoop(uid, base, local, row ? row.rev : 0, 0);
    });
  }

  /* --- admin edge function --------------------------------------------------- */
  function callAdmin(action, body) {
    return client().auth.getSession().then(function (res) {
      var token = res.data && res.data.session && res.data.session.access_token;
      if (!token) throw new Error('Not signed in');
      return fetch(cfg().SUPABASE_URL + '/functions/v1/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: cfg().SUPABASE_ANON_KEY },
        body: JSON.stringify(Object.assign({ action: action }, body || {}))
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.error) throw new Error(j.error || ('Request failed (' + r.status + ')'));
        return j;
      });
    });
  }

  /* --- auth -------------------------------------------------------------- */
  function friendly(err) {
    var m = (err && err.message) || 'Something went wrong — try again.';
    if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
    if (/email not confirmed/i.test(m)) return 'Your email isn’t confirmed yet — click the link we sent you (check spam), then try again.';
    if (/already registered/i.test(m)) return 'That email is already registered — sign in instead.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Too many attempts — wait a minute and try again.';
    if (/invalid/i.test(m) && /email/i.test(m)) return 'Supabase didn’t accept that email address — double-check the spelling.';
    if (/failed to fetch|network/i.test(m)) return 'Can’t reach the server — check your connection.';
    return m;
  }

  function gateErr(msg) { GATE.err = msg; GATE.busy = false; renderGate(); }

  function submit() {
    if (GATE.busy) return;
    var eEl = document.getElementById('authEmail'), pEl = document.getElementById('authPass');
    var email = ((eEl && eEl.value) || '').trim().toLowerCase();
    var pass = (pEl && pEl.value) || '';
    if (!validEmail(email)) return gateErr('That doesn’t look like an email address.');
    if (pass.length < 6) return gateErr('Password needs at least 6 characters.');
    if (GATE.tab === 'up') {
      var p2El = document.getElementById('authPass2');
      if (((p2El && p2El.value) || '') !== pass) return gateErr('Passwords don’t match.');
    }
    GATE.busy = true; GATE.err = ''; GATE.notice = ''; renderGate();
    ensureLib(function (ok) {
      if (!ok) return gateErr('You’re offline — connect to the internet to sign in.');
      var call = GATE.tab === 'up'
        ? client().auth.signUp({ email: email, password: pass, options: { emailRedirectTo: appUrl(),
            data: { display_name: (((document.getElementById('authName') || {}).value) || '').trim().slice(0, 60) } } })
        : client().auth.signInWithPassword({ email: email, password: pass });
      call.then(function (res) {
        if (res.error) return gateErr(friendly(res.error));
        var data = res.data || {};
        if (data.session) return onSignedIn(data.session.user);
        if (GATE.tab === 'up') {
          // Sign-up with "Confirm email" on: account exists, no session yet.
          // Supabase also lands here (with an identity-less user) when the
          // email is already registered, to avoid leaking who has an account.
          if (data.user && data.user.identities && data.user.identities.length === 0) {
            return gateErr('That email is already registered — sign in instead.');
          }
          GATE.busy = false; GATE.tab = 'in';
          GATE.notice = 'Account created ✓ — we’ve emailed you a confirmation link. Click it (check spam too) and you’ll be signed straight in.';
          renderGate();
          return;
        }
        gateErr('Couldn’t sign you in — try again.');
      }, function () { gateErr('Can’t reach the server — check your connection.'); });
    });
  }

  ACTIONS['auth-forgot'] = function () {
    if (GATE.busy) return;
    var eEl = document.getElementById('authEmail');
    var email = ((eEl && eEl.value) || '').trim().toLowerCase();
    if (!validEmail(email)) return gateErr('Type your email in the box above first, then hit “Forgot your password?” again.');
    GATE.busy = true; GATE.err = ''; GATE.notice = ''; renderGate();
    ensureLib(function (ok) {
      if (!ok) return gateErr('You’re offline — connect to the internet first.');
      client().auth.resetPasswordForEmail(email, { redirectTo: appUrl() }).then(function (res) {
        if (res.error) return gateErr(friendly(res.error));
        GATE.busy = false;
        GATE.notice = 'Reset link sent to ' + email + ' — open it and you’ll be brought back here to set a new password.';
        renderGate();
      }, function () { gateErr('Can’t reach the server — check your connection.'); });
    });
  };

  function showRecoveryForm() {
    Modal.open('<div class="m-title">Set a new password</div>'
      + '<div class="m-sub">The reset link signed you in — choose your new password now.</div>'
      + '<label class="auth-lbl" for="recPass">New password</label>'
      + '<input class="set-input auth-input" id="recPass" type="password" autocomplete="new-password" placeholder="6+ characters">'
      + '<label class="auth-lbl" for="recPass2">New password, again</label>'
      + '<input class="set-input auth-input" id="recPass2" type="password" autocomplete="new-password" placeholder="Same again">'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Later</button>'
      + '<button class="btn primary" data-a="auth-recover-ok">Save new password</button></div>');
  }

  ACTIONS['auth-recover-ok'] = function () {
    var p = (document.getElementById('recPass') || {}).value || '';
    var p2 = (document.getElementById('recPass2') || {}).value || '';
    if (p.length < 6) { FX.toast('Password needs at least 6 characters.', 'amber'); return; }
    if (p !== p2) { FX.toast('Passwords don’t match.', 'amber'); return; }
    client().auth.updateUser({ password: p }).then(function (res) {
      if (res.error) { FX.toast(friendly(res.error), 'amber', 3200); return; }
      Modal.close();
      FX.toast('Password updated ✓', 'green');
    }, function () { FX.toast('Can’t reach the server — try again.', 'amber'); });
  };

  function doSignOut() {
    var done = function () {
      if (Store.lens()) closeLensNow();
      App.viewAs = null;
      Store.clearLocal();
      setDirty(false);
      try { localStorage.removeItem(USERKEY); localStorage.removeItem(UIDKEY); localStorage.removeItem(BASEKEY); localStorage.removeItem(REVKEY); } catch (e) {}
      user = null; mode = 'gate'; own = null; ME = null;
      GATE.tab = 'in'; GATE.err = ''; GATE.notice = ''; GATE.busy = false;
      setChip('off');
      App.go({ v: 'home' });
    };
    if (sb) sb.auth.signOut().then(done, done); else done();
  }

  ACTIONS['cloud-signout'] = function () {
    if (isDirty() && mode === 'on') {
      pushNow(function (ok) {
        if (ok) return doSignOut();
        Modal.confirm('Latest changes haven’t synced', 'You seem to be offline. Signing out clears this device, so unsynced changes would be lost. Sign out anyway?', 'Sign out anyway', true, doSignOut);
      });
    } else if (isDirty()) {
      Modal.confirm('Latest changes haven’t synced', 'You’re offline. Signing out clears this device, so unsynced changes would be lost. Sign out anyway?', 'Sign out anyway', true, doSignOut);
    } else {
      doSignOut();
    }
  };

  ACTIONS['cloud-sync-now'] = function () {
    if (mode !== 'on') { FX.toast('You’re offline — changes are safe on this device and will sync when you reconnect.', 'amber', 3000); return; }
    var s2 = lens || own;
    if (s2 && s2.dirty()) s2.push(function (ok) { FX.toast(ok ? 'Synced ✓' : 'Sync failed — check your connection.', ok ? 'green' : 'amber'); });
    else { maybeRefresh(true); FX.toast('Up to date ✓', 'green'); }
  };

  ACTIONS['auth-submit'] = function () { submit(); };
  ACTIONS['auth-tab'] = function (el) {
    GATE.tab = el.getAttribute('data-t');
    GATE.err = '';
    renderGate();
  };
  ACTIONS['auth-retry'] = function () { location.reload(); };

  // Erase the cloud copy too (used by "Erase everything").
  function wipeCloud(cb) {
    if (mode !== 'on' || !client() || !user) return cb(true);
    client().from(TABLE).delete().eq('user_id', user.id).then(function (res) {
      cb(!res.error);
    }, function () { cb(false); });
  }

  /* --- UI: sync chip ------------------------------------------------------ */
  function setChip(state) {
    var chip = document.getElementById('syncChip');
    if (!chip) return;
    chip.hidden = (mode === 'off' || state === 'off');
    chip.className = 'sync-chip ' + state + (lens ? ' lens' : '');
    if (state === 'ok') { chip.innerHTML = '⚓ Synced'; chip.title = 'All changes saved to your account' + (lastSync ? ' · last sync ' + U.ago(lastSync) : ''); }
    else if (state === 'sync') { chip.innerHTML = '↻ Syncing…'; chip.title = 'Saving to your account…'; }
    else if (state === 'warn') { chip.innerHTML = '⚡ Offline'; chip.title = 'Changes are saved on this device and will sync when you’re back online'; }
    else if (state === 'err') { chip.innerHTML = '⚠ Sync error'; chip.title = 'Couldn’t reach the cloud — changes are safe on this device. Click for details.'; }
  }

  /* --- UI: auth gate ------------------------------------------------------ */
  function gated() { return mode === 'gate' || mode === 'gate-offline'; }

  function gateHtml() {
    if (mode === 'gate-offline') {
      return '<div class="auth-wrap"><div class="auth-card">'
        + '<div class="auth-title">You’re offline</div>'
        + '<div class="auth-sub">Anchor needs a connection to sign you in. Once you’re signed in, studying works offline and syncs when you reconnect.</div>'
        + '<button class="btn primary big" data-a="auth-retry">Try again</button>'
        + '</div></div>';
    }
    var up = GATE.tab === 'up';
    return '<div class="auth-wrap">'
      + '<div class="auth-hero"><span class="auth-anchor">⚓</span>'
      + '<div class="auth-title">Anchor</div>'
      + '<div class="auth-sub">Memory that holds. Sign in and your subjects, cards and progress follow you to any device — saved online, automatically.</div></div>'
      + '<div class="auth-card">'
      + '<div class="auth-tabs">'
      + '<button class="auth-tab' + (!up ? ' on' : '') + '" data-a="auth-tab" data-t="in">Sign in</button>'
      + '<button class="auth-tab' + (up ? ' on' : '') + '" data-a="auth-tab" data-t="up">Create account</button>'
      + '</div>'
      + (up ? '<label class="auth-lbl" for="authName">Your first name</label><input class="set-input auth-input" id="authName" autocomplete="given-name" placeholder="So your tutor knows it’s you">' : '')
      + '<label class="auth-lbl" for="authEmail">Email</label>'
      + '<input class="set-input auth-input" id="authEmail" type="email" autocomplete="email" spellcheck="false" placeholder="you@example.com">'
      + '<label class="auth-lbl" for="authPass">Password</label>'
      + '<input class="set-input auth-input" id="authPass" type="password" autocomplete="' + (up ? 'new-password' : 'current-password') + '" placeholder="' + (up ? '6+ characters' : '••••••••') + '">'
      + (up ? '<label class="auth-lbl" for="authPass2">Password, again</label><input class="set-input auth-input" id="authPass2" type="password" autocomplete="new-password" placeholder="Same again">' : '')
      + (GATE.err ? '<div class="auth-err">' + U.esc(GATE.err) + '</div>' : '')
      + (GATE.notice ? '<div class="auth-note">' + U.esc(GATE.notice) + '</div>' : '')
      + '<button class="btn primary big auth-go" data-a="auth-submit"' + (GATE.busy ? ' disabled' : '') + '>'
      + (GATE.busy ? 'Working…' : (up ? 'Create account ⚓' : 'Sign in ⚓')) + '</button>'
      + (up
        ? '<div class="auth-hint">We’ll email you a confirmation link — click it and you’re in. Your email is only used for signing in and password resets.</div>'
        : '<div class="auth-hint" style="text-align:center"><button class="linklike" data-a="auth-forgot">Forgot your password?</button></div>')
      + '</div></div>';
  }

  function renderGate() {
    document.body.classList.add('gated');
    var view = document.getElementById('view');
    var hadFocus = document.activeElement && document.activeElement.id;
    var keep = {};
    ['authName', 'authEmail', 'authPass', 'authPass2'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) keep[id] = el.value;
    });
    view.innerHTML = gateHtml();
    Object.keys(keep).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && keep[id]) el.value = keep[id];
    });
    var els = view.querySelectorAll('.auth-input');
    for (var i = 0; i < els.length; i++) {
      els[i].onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } };
    }
    var uEl = document.getElementById('authEmail');
    if (uEl && !GATE.busy) {
      var target = (hadFocus && document.getElementById(hadFocus)) || uEl;
      setTimeout(function () { target.focus(); }, 40);
    }
  }

  /* --- UI: account card (Data & settings page) ---------------------------- */
  function accountCard() {
    if (mode === 'off') {
      return '<div class="set-card"><div class="set-title">Account &amp; cloud sync</div>'
        + '<div class="set-desc">Cloud sync isn’t configured on this deployment, so data lives on this device only. '
        + 'The walkthrough in <b>docs/CLOUD-SETUP.md</b> turns on accounts + automatic online backup (free, ~15 minutes).</div></div>';
    }
    var uname = savedUser() || 'signed in';
    var body;
    if (mode === 'on') {
      body = '<div class="set-desc">Signed in as <b>' + U.esc(uname) + '</b>. Every change saves to your account automatically'
        + (lastSync ? ' · last sync ' + U.ago(lastSync) : '') + '. Sign in on any device to pick up where you left off.</div>';
    } else {
      body = '<div class="set-desc">Signed in as <b>' + U.esc(uname) + '</b> — currently offline. '
        + 'Changes are saved on this device and sync automatically when you reconnect.</div>';
    }
    return '<div class="set-card"><div class="set-title">Account &amp; cloud sync</div>' + body
      + (ME ? '<div class="set-row" style="gap:8px;align-items:center;margin:4px 0 12px"><label class="m-lbl" for="meName" style="margin:0">Your name</label>'
        + '<input class="set-input" id="meName" style="max-width:220px" value="' + U.esc(ME.display_name || '') + '" placeholder="First name">'
        + '<button class="btn" data-a="me-name-save">Save</button></div>' : '')
      + '<div class="m-actions" style="justify-content:flex-start;margin-top:0">'
      + '<button class="btn primary" data-a="cloud-sync-now">↻ Sync now</button>'
      + (mode === 'on' ? '<button class="btn" data-a="my-backups">' + U.icon('download') + 'Backups</button>' : '')
      + '<button class="btn" data-a="cloud-signout">Sign out</button></div>'
      + '<div class="set-desc" style="margin-top:10px;font-size:12px">Anchor keeps automatic daily backups of your account. If you study with a tutor, they can see and add to your Anchor.</div></div>';
  }

  ACTIONS['me-name-save'] = function () {
    var v = ((document.getElementById('meName') || {}).value || '').trim();
    rpc('update_my_profile', { p_display_name: v }).then(function (res) {
      if (res.error) { FX.toast('Couldn’t save — ' + res.error.message, 'amber'); return; }
      if (ME) ME.display_name = v;
      FX.toast('Saved ✓', 'green');
    });
  };
  ACTIONS['my-backups'] = function () {
    client().from('anchor_backups').select('id, taken_at, reason, kind, bytes').eq('user_id', user.id).order('taken_at', { ascending: false }).limit(30)
      .then(function (res) {
        var rows = res.data || [];
        Modal.open('<div class="m-title">Your backups</div><div class="m-sub">Restoring replaces your current Anchor with that version (your current version is backed up first, so it’s undoable).</div>'
          + '<div class="bk-list">' + (rows.length ? rows.map(function (b) {
            return '<div class="bk-row"><div><b>' + U.esc(new Date(b.taken_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) + '</b>'
              + '<div class="muted" style="font-size:12px">' + U.esc(b.reason || b.kind) + (b.bytes ? ' · ' + Math.round(b.bytes / 1024) + ' KB' : '') + '</div></div>'
              + '<button class="btn sm" data-a="my-backup-restore" data-id="' + b.id + '">Restore</button></div>';
          }).join('') : '<div class="muted">No backups yet — one is taken automatically each day you study.</div>') + '</div>'
          + '<div class="m-actions"><button class="btn" data-a="modal-close">Close</button></div>');
      });
  };
  ACTIONS['my-backup-restore'] = function (el) {
    var id = el.getAttribute('data-id');
    Modal.confirm('Restore this backup?', 'Your Anchor goes back to that version on every device. Your current version is backed up first.', 'Restore', true, function () {
      var go = function () {
        rpc('restore_backup', { p_backup: Number(id) }).then(function (res) {
          if (res.error) { FX.toast('Restore failed — ' + res.error.message, 'amber'); return; }
          setDirty(false);
          own.refresh(true);
          FX.toast('Restored ✓', 'green');
        });
      };
      if (isDirty()) pushNow(function () { go(); }); else go();
    });
  };

  window.Cloud = {
    init: init,
    client: function () { return client(); },
    user: function () { return user; },
    me: function () { return ME; },
    role: function () { return ME ? ME.role : null; },
    isAdmin: function () { return !!ME && ME.role === 'admin'; },
    isTutor: function () { return !!ME && (ME.role === 'tutor' || ME.role === 'admin'); },
    rpc: rpc,
    fetchRow: fetchRow,
    mutateDoc: mutateDoc,
    openLens: openLens,
    closeLens: closeLens,
    lensState: lensState,
    callAdmin: callAdmin,
    pushNow: pushNow,
    refresh: maybeRefresh,
    reloadMe: loadMe,
    onLocalSave: onLocalSave,
    gated: gated,
    renderGate: renderGate,
    accountCard: accountCard,
    wipeCloud: wipeCloud,
    isOn: function () { return mode === 'on'; },
    isConfigured: configured
  };
})();

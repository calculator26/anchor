/* ============================================================================
   Anchor · cloud.js — accounts + cloud sync (Supabase).
   Sign in with email + password; the whole Anchor state syncs as ONE
   JSON document per user (exactly what localStorage holds). localStorage
   stays the offline cache; the cloud copy is the source of truth on sign-in;
   after that every local save pushes up (debounced). Last write wins.
   Degrades gracefully: no config → local-only exactly as before;
   offline → keep studying locally, sync resumes when the network returns.
   Loads after store.js, before the UI modules.
   ========================================================================== */
(function () {
  'use strict';

  window.ACTIONS = window.ACTIONS || {};

  var LIB_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  var TABLE = 'anchor_data';
  var DIRTY = 'anchor_dirty';    // '1' → local changes not yet confirmed in the cloud
  var USERKEY = 'anchor_user';   // remembered sign-in email (for offline boots)
  var UIDKEY = 'anchor_uid';     // which account owns the local cache (shared-device guard)

  var sb = null, user = null;
  var mode = 'off';              // off | gate | gate-offline | offline | on
  var seq = 0;                   // bumps on every local save; guards push/pull races
  var timer = null, lastSync = null, lastRefresh = 0;
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

  // Reconcile local cache vs cloud copy after sign-in / boot.
  // Rule: unsynced local changes by the SAME account win (push them up);
  // otherwise the cloud copy is the source of truth (pull it down).
  function syncOnStart() {
    var owner = null;
    try { owner = localStorage.getItem(UIDKEY); } catch (e) {}
    if (isDirty() && owner === user.id) { pushNow(); return; }
    setChip('sync');
    var at = seq;
    client().from(TABLE).select('data, updated_at').eq('user_id', user.id).maybeSingle().then(function (res) {
      if (res.error) { setChip(isDirty() ? 'warn' : 'err'); return; }
      if (res.data && res.data.data) {
        if (seq !== at) { pushNow(); return; }        // user edited mid-pull — local wins
        Store.replaceAll(res.data.data);
        lastSync = res.data.updated_at;
        try { localStorage.setItem(UIDKEY, user.id); } catch (e) {}
        applyTheme(); App.render(); App.renderTop();
        setChip('ok');
      } else {
        // No cloud copy yet — first sign-in for this account.
        // Adopt this device's data unless it belongs to a different account.
        if (owner && owner !== user.id) { Store.replaceAll(null); App.render(); App.renderTop(); }
        pushNow();
      }
    }, function () { setChip(isDirty() ? 'warn' : 'err'); });
  }

  /* --- sync -------------------------------------------------------------- */
  // store.js calls this after every local save.
  function onLocalSave() {
    if (mode === 'off') return;
    seq++;
    setDirty(true);
    if (mode !== 'on') { setChip('warn'); return; }
    setChip('sync');
    clearTimeout(timer);
    timer = setTimeout(function () { pushNow(); }, 1200);
  }

  function pushNow(cb) {
    if (!client() || !user) { if (cb) cb(false); return; }
    clearTimeout(timer);
    var at = seq;
    var stamp = new Date().toISOString();
    setChip('sync');
    client().from(TABLE).upsert({ user_id: user.id, data: Store.data(), updated_at: stamp }).then(function (res) {
      if (res.error) { console.error('Anchor sync:', res.error.message); setChip('err'); if (cb) cb(false); return; }
      if (seq === at) { setDirty(false); setChip('ok'); }   // else a newer save is pending
      lastSync = stamp;
      try { localStorage.setItem(UIDKEY, user.id); } catch (e) {}
      if (cb) cb(true);
    }, function () { setChip('err'); if (cb) cb(false); });
  }

  // Multi-device freshness: when the tab regains focus with nothing unsynced,
  // quietly pull the latest cloud copy (another device may have studied).
  function maybeRefresh(force) {
    if (mode !== 'on' || isDirty() || !client() || !user) return;
    if (App.sess || App.route.v === 'session') return;      // never yank a live session
    var now = Date.now();
    if (!force && now - lastRefresh < 20000) return;
    lastRefresh = now;
    var at = seq;
    client().from(TABLE).select('data, updated_at').eq('user_id', user.id).maybeSingle().then(function (res) {
      if (res.error || !res.data || !res.data.data) return;
      if (seq !== at || isDirty()) return;
      if (res.data.updated_at === lastSync) { setChip('ok'); return; }
      Store.replaceAll(res.data.data);
      lastSync = res.data.updated_at;
      applyTheme(); App.render(); App.renderTop();
      setChip('ok');
    }, function () {});
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (mode === 'on' && isDirty()) pushNow();            // best-effort flush
    } else {
      maybeRefresh(false);
    }
  });
  window.addEventListener('online', function () {
    if (mode === 'on' && isDirty()) pushNow();
    else if (mode === 'offline' || mode === 'gate-offline') init();
  });

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
        ? client().auth.signUp({ email: email, password: pass, options: { emailRedirectTo: appUrl() } })
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
      Store.clearLocal();
      setDirty(false);
      try { localStorage.removeItem(USERKEY); localStorage.removeItem(UIDKEY); } catch (e) {}
      user = null; mode = 'gate';
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
    if (isDirty()) pushNow(function (ok) { FX.toast(ok ? 'Synced ✓' : 'Sync failed — check your connection.', ok ? 'green' : 'amber'); });
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
    chip.className = 'sync-chip ' + state;
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
    ['authEmail', 'authPass', 'authPass2'].forEach(function (id) {
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
      + '<div class="m-actions" style="justify-content:flex-start;margin-top:0">'
      + '<button class="btn primary" data-a="cloud-sync-now">↻ Sync now</button>'
      + '<button class="btn" data-a="cloud-signout">Sign out</button></div></div>';
  }

  window.Cloud = {
    init: init,
    onLocalSave: onLocalSave,
    gated: gated,
    renderGate: renderGate,
    accountCard: accountCard,
    wipeCloud: wipeCloud,
    isOn: function () { return mode === 'on'; },
    isConfigured: configured
  };
})();

/* ============================================================================
   Anchor · ui-extra.js — utilities, FX engine, modals, Chains + Essays,
   Stats, Data & settings. Loads before ui-main.js.
   ========================================================================== */
(function () {
  'use strict';

  window.ACTIONS = window.ACTIONS || {};

  /* ─── U · tiny utilities ─────────────────────────────────────────────── */
  var U = window.U = {
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },
    pct: function (n, d) { return d ? Math.round(n / d * 100) : 0; },
    fmtDate: function (iso) {
      if (!iso) return '';
      var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var d = new Date(iso.length === 10 ? iso + 'T12:00' : iso);
      return d.getDate() + ' ' + m[d.getMonth()];
    },
    daysUntil: function (iso) {
      if (!iso) return null;
      return Math.ceil((Date.parse(iso + 'T23:59:59') - Date.now()) / 864e5);
    },
    // human "x ago" for review timestamps
    ago: function (iso) {
      if (!iso) return 'never';
      var s = (Date.now() - Date.parse(iso)) / 1000;
      if (s < 90) return 'just now';
      var m = s / 60;
      if (m < 60) return Math.round(m) + 'm ago';
      var h = m / 60;
      if (h < 1.5) return '1h ago';
      if (h < 36) return Math.round(h) + 'h ago';
      var d = h / 24;
      if (d < 14) return Math.round(d) + 'd ago';
      if (d < 64) return Math.round(d / 7) + 'w ago';
      return Math.round(d / 30) + 'mo ago';
    },
    stClass: function (key) {
      var st = Store.data().state[key];
      if (!st || !st.conf) return '';
      return st.conf === 'g' ? 'cg' : st.conf === 'a' ? 'ca' : 'cr';
    },
    hold: function (key) {
      var st = Store.data().state[key];
      if (!st || !st.srs) return null;
      var r = FSRS.rNow(st.srs);
      return { r: r, pct: Math.round(r * 100), due: r <= Store.data().settings.retention, S: st.srs.S };
    },
    holdColor: function (r) {
      var ret = Store.data().settings.retention;
      return r > (1 + ret) / 2 ? 'var(--green)' : r > ret ? 'var(--amber)' : 'var(--red)';
    },
    modeLabel: function (mode) {
      return mode === 'def' ? 'Definition' : mode === 'key' ? 'Key facts' : 'Card';
    }
  };

  /* ─── FX · celebration engine (all recall-triggered, all brief) ──────── */
  var FX = window.FX = {
    toast: function (msg, cls, ms) {
      var box = document.getElementById('toasts');
      var t = document.createElement('div');
      t.className = 'toast ' + (cls || '');
      t.innerHTML = msg;
      box.appendChild(t);
      setTimeout(function () { t.classList.add('out'); }, ms || 2600);
      setTimeout(function () { t.remove(); }, (ms || 2600) + 350);
    },

    burst: function (x, y, n, palette) {
      var fx = document.getElementById('fx');
      var colors = palette || ['#34d399', '#2dd4bf', '#a7f3d0', '#f0b45b'];
      n = n || 16;
      for (var i = 0; i < n; i++) {
        var p = document.createElement('div');
        p.className = 'particle';
        var c = colors[Math.floor(Math.random() * colors.length)];
        p.style.background = c;
        p.style.left = x + 'px'; p.style.top = y + 'px';
        p.style.opacity = '1';
        p.style.transition = 'transform .75s cubic-bezier(.16,.84,.44,1), opacity .75s ease';
        fx.appendChild(p);
        var ang = Math.random() * Math.PI * 2, dist = 34 + Math.random() * 62;
        var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 26;
        (function (el, tx, ty) {
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            el.style.transform = 'translate(' + tx + 'px,' + ty + 'px) rotate(' + (Math.random() * 300 - 150) + 'deg) scale(' + (0.4 + Math.random() * 0.7) + ')';
            el.style.opacity = '0';
          }); });
        })(p, dx, dy);
        setTimeout(function (el) { el.remove(); }, 850, p);
      }
    },

    burstOn: function (el, n, palette) {
      if (!el) return;
      var r = el.getBoundingClientRect();
      FX.burst(r.left + r.width / 2, r.top + r.height / 2, n, palette);
    },

    confetti: function () {
      var fx = document.getElementById('fx');
      var colors = ['#34d399', '#2dd4bf', '#f0b45b', '#7a89f0', '#a7f3d0'];
      for (var i = 0; i < 70; i++) {
        var p = document.createElement('div');
        p.className = 'particle';
        p.style.background = colors[i % colors.length];
        p.style.width = (5 + Math.random() * 6) + 'px';
        p.style.height = (8 + Math.random() * 7) + 'px';
        p.style.left = (Math.random() * 100) + 'vw';
        p.style.top = '-20px';
        p.style.opacity = '1';
        var dur = 1.4 + Math.random() * 1.6;
        p.style.transition = 'transform ' + dur + 's cubic-bezier(.35,.1,.6,.9), opacity .5s ease ' + (dur - 0.45) + 's';
        fx.appendChild(p);
        (function (el) {
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            el.style.transform = 'translateY(105vh) rotate(' + (Math.random() * 720 - 360) + 'deg)';
            el.style.opacity = '0';
          }); });
        })(p);
        setTimeout(function (el) { el.remove(); }, dur * 1000 + 300, p);
      }
    },

    banner: function (icon, title, sub) {
      var b = document.createElement('div');
      b.className = 'banner-anchored';
      b.innerHTML = '<div class="ba-icon">' + icon + '</div><div class="ba-title">' + U.esc(title) + '</div>'
        + (sub ? '<div class="ba-sub">' + U.esc(sub) + '</div>' : '');
      document.body.appendChild(b);
      setTimeout(function () { b.remove(); }, 2500);
    },

    green: function (el) {
      if (el) {
        el.classList.remove('sweep'); void el.offsetWidth; el.classList.add('sweep');
      }
      if (Math.random() < 0.12) {
        FX.burstOn(el || document.body, 34, ['#2dd4bf', '#34d399', '#a7f3d0', '#7a89f0', '#f0b45b']);
      } else {
        FX.burstOn(el, 14);
      }
    }
  };

  /* ─── Modal ──────────────────────────────────────────────────────────── */
  var Modal = window.Modal = {
    open: function (html, after) {
      var root = document.getElementById('modal-root');
      root.innerHTML = '<div class="modal-back" data-a="modal-back"><div class="modal" data-stop="1">' + html + '</div></div>';
      var first = root.querySelector('input, textarea, select');
      if (first) setTimeout(function () { first.focus(); }, 50);
      if (after) after(root);
    },
    close: function () { document.getElementById('modal-root').innerHTML = ''; },
    confirm: function (title, sub, okLabel, danger, cb) {
      Modal.open(
        '<div class="m-title">' + U.esc(title) + '</div><div class="m-sub">' + U.esc(sub) + '</div>' +
        '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button>' +
        '<button class="btn ' + (danger ? 'warn' : 'primary') + '" data-a="modal-ok">' + U.esc(okLabel) + '</button></div>'
      );
      Modal._ok = cb;
    },
    _ok: null
  };
  ACTIONS['modal-back'] = function (el, ev) { if (ev.target === el) Modal.close(); };
  ACTIONS['modal-close'] = function () { Modal.close(); };
  ACTIONS['modal-ok'] = function () { var f = Modal._ok; Modal.close(); Modal._ok = null; if (f) f(); };

  /* ─── Study mode: Reveal vs Text — shared by Harbour boards, Chain boards
     and the session player. "Text mode" lets you produce the answer by typing
     or dictation, then reveal to compare side-by-side. It's the same idea as
     produce-before-reveal, stored in settings.typeFirst so one toggle drives
     inline cards and full sessions alike. ─────────────────────────────────── */
  window.textMode = function () { return !!Store.data().settings.typeFirst; };

  window.studyModeToggle = function () {
    var on = window.textMode();
    return '<div class="mode-toggle" role="group" aria-label="Study mode">'
      + '<button class="mode-opt' + (!on ? ' on' : '') + '" data-a="study-mode" data-m="0" title="Reveal, then say it aloud or on a whiteboard from memory">👁 Reveal</button>'
      + '<button class="mode-opt' + (on ? ' on' : '') + '" data-a="study-mode" data-m="1" title="Type or dictate your answer, then reveal to compare">⌨ Text</button>'
      + '</div>';
  };

  // The unrevealed state in text mode: a box you type or dictate into.
  window.typeZoneHTML = function (key) {
    return '<textarea class="type-zone inline" data-typed="' + key + '" placeholder="Type it — or dictate it — from memory. Then reveal to compare.">' + U.esc(App.getTyped(key)) + '</textarea>'
      + '<div class="type-actions">'
      + '<button class="btn primary" data-a="reveal" data-k="' + key + '">Reveal &amp; check</button>'
      + '<button class="btn subtle" data-a="reveal" data-k="' + key + '" data-skip="1">Just show me</button>'
      + '</div>';
  };

  // The revealed state in text mode: what you produced, above the real answer.
  window.producedHTML = function (key) {
    var t = App.getTyped(key);
    if (!t || !t.trim()) return '';
    return '<div class="ab-lbl">What you produced</div><div class="your-answer">' + U.esc(t) + '</div>'
      + '<div class="ab-lbl acc">The answer</div>';
  };

  ACTIONS['study-mode'] = function (el) {
    var on = el.getAttribute('data-m') === '1';
    if (window.textMode() === on) return;
    var ta = document.getElementById('sessTa');            // preserve a half-typed session answer
    if (ta && App.sess) App.sess.typed = ta.value;
    Store.data().settings.typeFirst = on;
    Store.save();
    App.render();
    FX.toast(on ? '⌨ Text mode — type or dictate, then reveal to compare'
                : '👁 Reveal mode — produce it in your head, then reveal', '', 2200);
  };

  /* ══════════════════════════════════════════════════════════════════════
     CHAINS · Mode B — essays group chains (one chain per paragraph)
     ════════════════════════════════════════════════════════════════════ */
  var V = window.V = {};

  function chainLinkStates(ch) {
    return ch.sentences.map(function (sn) {
      var k = 'c:' + ch.id + ':' + sn.id;
      var st = Store.data().state[k];
      var h = U.hold(k);
      var v = Store.isVerified(k);
      return {
        key: k, sent: sn,
        verified: v,
        started: !!(st && st.srs),
        due: v && !!(h && h.due)
      };
    });
  }
  function chainOrderState(ch) {
    var k = 'o:' + ch.id;
    var st = Store.data().state[k];
    var h = U.hold(k);
    var v = Store.isVerified(k);
    return { key: k, started: !!(st && st.srs), verified: v, due: v && !!(h && h.due), hold: h };
  }
  function chainForged(ch) {
    var links = chainLinkStates(ch);
    return chainOrderState(ch).verified && links.every(function (l) { return l.verified; });
  }
  window.chainForged = chainForged;

  function linksVisual(ch, small) {
    var html = '<div class="ch-links' + (small ? ' small' : '') + '">';
    chainLinkStates(ch).forEach(function (l) {
      var cls = l.verified ? (l.due ? 'due' : 'done') : (l.started ? 'part' : '');
      html += '<span class="lk ' + cls + '" title="' + U.esc(l.sent.kw) + '"></span>';
    });
    html += '</div>';
    return html;
  }

  function chainRow(ch) {
    var links = chainLinkStates(ch);
    var done = links.filter(function (l) { return l.verified; }).length;
    var dueN = links.filter(function (l) { return l.due; }).length + (chainOrderState(ch).due ? 1 : 0);
    return '<div class="chain-row">'
      + '<span class="cr-title">' + U.esc(ch.title) + (chainForged(ch) ? ' <span class="forged">⚓</span>' : '') + '</span>'
      + linksVisual(ch, true)
      + '<span class="ch-sub">' + done + '/' + links.length + '</span>'
      + (dueN ? '<span class="pill due">' + dueN + ' due</span>' : '')
      + '<span class="ch-actions"><button class="btn" data-a="chain-open" data-id="' + ch.id + '">Study</button>'
      + '<button class="tool" title="Delete chain" data-a="chain-del" data-id="' + ch.id + '">🗑</button></span>'
      + '</div>';
  }

  V.chains = function () {
    var D = Store.data();
    var html = '<div class="board-head"><div><div class="bh-title">Chains</div>'
      + '<div class="bh-sub">Essay &amp; sequence mastery — one keyword per sentence, master the order, then forge every link. Group a chain per paragraph under an essay.</div></div>'
      + '<div class="bh-actions"><button class="btn" data-a="essay-new">＋ New essay</button>'
      + '<button class="btn primary" data-a="chain-new">＋ New chain</button></div></div>';

    if (!D.chains.length && !D.essays.length) {
      html += '<div class="empty"><span class="big">⛓️</span>No chains yet.<br>Paste an essay paragraph and Anchor will help you master it sentence-by-sentence — the keyword method, built in.<br><br><button class="btn primary" data-a="chain-new">Build your first chain</button></div>';
      return html;
    }

    // essays with their paragraph chains
    D.essays.forEach(function (e) {
      var chains = D.chains.filter(function (c) { return c.essayId === e.id; });
      var subj = e.subjectId ? Store.subjectById(e.subjectId) : null;
      var forged = chains.filter(chainForged).length;
      html += '<div class="chain-card essay-card">'
        + '<div class="ch-top"><span class="ch-title">📝 ' + U.esc(e.title) + '</span>'
        + (subj ? '<span class="pill">' + U.esc(subj.name) + '</span>' : '')
        + (chains.length && forged === chains.length ? '<span class="forged">⚓ Essay forged</span>'
           : '<span class="ch-sub">' + forged + '/' + chains.length + ' paragraphs forged</span>')
        + '<span class="ch-actions">'
        + '<button class="btn" data-a="chain-new" data-essay="' + e.id + '">＋ Paragraph</button>'
        + '<button class="tool" title="Rename essay" data-a="essay-edit" data-id="' + e.id + '">✎</button>'
        + '<button class="tool" title="Delete essay (chains are kept)" data-a="essay-del" data-id="' + e.id + '">🗑</button></span></div>';
      if (!chains.length) html += '<div class="ch-sub" style="margin-top:8px">No paragraphs yet — add a chain for paragraph 1.</div>';
      chains.forEach(function (ch) { html += chainRow(ch); });
      html += '</div>';
    });

    // standalone chains
    var loose = D.chains.filter(function (c) { return !c.essayId; });
    if (loose.length) {
      if (D.essays.length) html += '<div class="sec-head">Standalone chains</div>';
      loose.forEach(function (ch) {
        var subj = ch.subjectId ? Store.subjectById(ch.subjectId) : null;
        html += '<div class="chain-card"><div class="ch-top"><span class="ch-title">' + U.esc(ch.title) + '</span>'
          + (subj ? '<span class="pill">' + U.esc(subj.name) + '</span>' : '')
          + (chainForged(ch) ? '<span class="forged">⚓ Forged</span>' : '')
          + '<span class="ch-actions"><button class="btn" data-a="chain-open" data-id="' + ch.id + '">Study</button>'
          + '<button class="tool" title="Delete chain" data-a="chain-del" data-id="' + ch.id + '">🗑</button></span></div>'
          + linksVisual(ch)
          + '</div>';
      });
    }
    return html;
  };

  ACTIONS['essay-new'] = function () {
    var subs = Store.data().subjects;
    Modal.open('<div class="m-title">New essay</div>'
      + '<div class="m-sub">An essay is just a folder for its paragraph chains — usually one chain per paragraph.</div>'
      + '<div class="m-row"><label class="m-lbl">Essay title</label><input class="m-input" id="mTitle" placeholder="e.g. Operations strategies essay"></div>'
      + '<div class="m-row"><label class="m-lbl">Subject (optional)</label><select class="m-select" id="mSubj"><option value="">— none —</option>'
      + subs.map(function (s) { return '<option value="' + s.id + '">' + U.esc(s.name) + '</option>'; }).join('') + '</select></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="essay-new-ok">Create essay</button></div>');
  };
  ACTIONS['essay-new-ok'] = function () {
    var t = document.getElementById('mTitle').value.trim();
    if (!t) return;
    Store.addEssay(t, document.getElementById('mSubj').value || null);
    Modal.close();
    FX.toast('Essay created — add a chain per paragraph 📝', 'green');
    App.render();
  };
  ACTIONS['essay-del'] = function (el) {
    var e = Store.essayById(el.getAttribute('data-id'));
    Modal.confirm('Delete essay “' + e.title + '”?', 'Its chains are kept — they just become standalone.', 'Delete essay', true, function () {
      Store.deleteEssay(e.id);
      App.render();
    });
  };
  ACTIONS['chain-del'] = function (el) {
    var id = el.getAttribute('data-id');
    var ch = Store.chainById(id);
    Modal.confirm('Delete “' + ch.title + '”?', 'The chain and its study history will be removed. This cannot be undone.', 'Delete chain', true, function () {
      Store.deleteChain(id);
      if (App.route.v === 'chain' && App.route.id === id) App.go({ v: 'chains' });
      else App.render();
    });
  };
  ACTIONS['chain-open'] = function (el) { App.go({ v: 'chain', id: el.getAttribute('data-id') }); };
  ACTIONS['chain-new'] = function (el) {
    CB = { title: '', subjectId: '', essayId: (el && el.getAttribute('data-essay')) || '', raw: '', sents: null };
    var e = CB.essayId ? Store.essayById(CB.essayId) : null;
    if (e && e.subjectId) CB.subjectId = e.subjectId;
    App.go({ v: 'chainBuild' });
  };

  /* --- Builder — paste, split, type a keyword per sentence ------------------ */
  var CB = { title: '', subjectId: '', essayId: '', raw: '', sents: null };

  function splitSentences(text) {
    var clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    var parts = clean.match(/[^.!?]+[.!?]+(?:['")\]]+)?|[^.!?]+$/g) || [clean];
    return parts.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 1; });
  }

  V.chainBuild = function () {
    var D = Store.data();
    var essay = CB.essayId ? Store.essayById(CB.essayId) : null;
    var html = '<button class="bh-back" data-a="chains">← Chains</button>'
      + '<div class="board-head"><div><div class="bh-title">New chain</div>'
      + '<div class="bh-sub">Paste a paragraph → type <b>one keyword you choose yourself</b> for each sentence (choosing is encoding). Then master the sequence, then the links.</div></div></div>';

    html += '<div class="set-card" style="margin-bottom:14px"><div class="set-row">'
      + '<div class="m-row" style="flex:2;min-width:220px;margin:0"><label class="m-lbl">Title</label>'
      + '<input class="m-input" id="cbTitle" placeholder="e.g. Paragraph 2 — technology" value="' + U.esc(CB.title) + '"></div>'
      + '<div class="m-row" style="flex:1;min-width:150px;margin:0"><label class="m-lbl">Essay (optional)</label>'
      + '<select class="m-select" id="cbEssay"><option value="">— standalone —</option>'
      + D.essays.map(function (e) { return '<option value="' + e.id + '"' + (CB.essayId === e.id ? ' selected' : '') + '>' + U.esc(e.title) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="m-row" style="flex:1;min-width:150px;margin:0"><label class="m-lbl">Subject</label>'
      + '<select class="m-select" id="cbSubj"><option value="">— none —</option>'
      + D.subjects.map(function (s) { return '<option value="' + s.id + '"' + (CB.subjectId === s.id ? ' selected' : '') + '>' + U.esc(s.name) + '</option>'; }).join('')
      + '</select></div></div>';

    if (!CB.sents) {
      html += '<div class="m-row"><label class="m-lbl">Paste your paragraph</label>'
        + '<textarea class="cb-ta" id="cbRaw" placeholder="Paste the paragraph exactly as you want to reproduce it…">' + U.esc(CB.raw) + '</textarea></div>'
        + '<div class="m-actions" style="justify-content:flex-start"><button class="btn primary" data-a="cb-split">Split into sentences →</button></div>';
      html += '</div>';
    } else {
      html += '</div>';
      CB.sents.forEach(function (sn, i) {
        html += '<div class="cb-sent"><div class="cb-num">SENTENCE ' + (i + 1)
          + ' <button class="linklike" data-a="cb-edit" data-i="' + i + '">edit</button>'
          + (i < CB.sents.length - 1 ? ' <button class="linklike" data-a="cb-merge" data-i="' + i + '">merge ↓</button>' : '')
          + ' <button class="linklike" style="color:var(--red)" data-a="cb-del" data-i="' + i + '">remove</button></div>'
          + '<div class="cb-text">' + U.esc(sn.text) + '</div>'
          + '<div class="cb-kwline"><span>Keyword ' + (i + 1) + ':</span>'
          + '<input class="m-input kw-in" data-i="' + i + '" maxlength="30" placeholder="one memorable word from (or about) this sentence" value="' + U.esc(sn.kw) + '">'
          + '</div></div>';
      });
      var setN = CB.sents.filter(function (s) { return s.kw && s.kw.trim(); }).length;
      var ready = CB.sents.length >= 2 && setN === CB.sents.length;
      html += '<div class="m-actions" style="justify-content:flex-start">'
        + '<button class="btn" data-a="cb-restart">← Start over</button>'
        + '<button class="btn primary" id="cbCreate" data-a="cb-create" ' + (ready ? '' : 'disabled') + '>Create chain (<span id="cbSetN">' + setN + '</span>/' + CB.sents.length + ' keywords)</button></div>';
    }
    return html;
  };

  function cbSync() {
    var t = document.getElementById('cbTitle'), s = document.getElementById('cbSubj'),
        e = document.getElementById('cbEssay'), r = document.getElementById('cbRaw');
    if (t) CB.title = t.value;
    if (s) CB.subjectId = s.value;
    if (e) CB.essayId = e.value;
    if (r) CB.raw = r.value;
    document.querySelectorAll('.kw-in').forEach(function (inp) {
      var i = +inp.getAttribute('data-i');
      if (CB.sents && CB.sents[i]) CB.sents[i].kw = inp.value.trim();
    });
  }

  // live keyword typing: keep state + button label fresh without re-rendering
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (!el.classList || !el.classList.contains('kw-in') || !CB.sents) return;
    var i = +el.getAttribute('data-i');
    if (CB.sents[i]) CB.sents[i].kw = el.value.trim();
    var setN = CB.sents.filter(function (s) { return s.kw; }).length;
    var nEl = document.getElementById('cbSetN');
    if (nEl) nEl.textContent = setN;
    var btn = document.getElementById('cbCreate');
    if (btn) btn.disabled = !(CB.sents.length >= 2 && setN === CB.sents.length);
  });

  ACTIONS['cb-split'] = function () {
    cbSync();
    var sents = splitSentences(CB.raw);
    if (sents.length < 2) { FX.toast('Need at least two sentences to build a chain.', 'amber'); return; }
    CB.sents = sents.map(function (s) { return { text: s, kw: '' }; });
    App.render();
  };
  ACTIONS['cb-restart'] = function () { cbSync(); CB.sents = null; App.render(); };
  ACTIONS['cb-edit'] = function (el) {
    cbSync();
    var i = +el.getAttribute('data-i');
    Modal.open('<div class="m-title">Edit sentence ' + (i + 1) + '</div>'
      + '<div class="m-row"><textarea class="m-ta" id="mSent">' + U.esc(CB.sents[i].text) + '</textarea></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="cb-edit-ok" data-i="' + i + '">Save</button></div>');
  };
  ACTIONS['cb-edit-ok'] = function (el) {
    var i = +el.getAttribute('data-i');
    var v = document.getElementById('mSent').value.trim();
    if (v) CB.sents[i].text = v;
    Modal.close(); App.render();
  };
  ACTIONS['cb-merge'] = function (el) {
    cbSync();
    var i = +el.getAttribute('data-i');
    CB.sents[i].text = CB.sents[i].text + ' ' + CB.sents[i + 1].text;
    if (!CB.sents[i].kw && CB.sents[i + 1].kw) CB.sents[i].kw = CB.sents[i + 1].kw;
    CB.sents.splice(i + 1, 1);
    App.render();
  };
  ACTIONS['cb-del'] = function (el) {
    cbSync();
    CB.sents.splice(+el.getAttribute('data-i'), 1);
    App.render();
  };
  ACTIONS['cb-create'] = function () {
    cbSync();
    var seen = {}, dupe = null;
    CB.sents.forEach(function (s) {
      var k = s.kw.toLowerCase();
      if (seen[k]) dupe = s.kw;
      seen[k] = 1;
    });
    if (dupe) { FX.toast('“' + dupe + '” is used twice — every keyword must be distinct so it can cue its own sentence.', 'amber', 3400); return; }
    var title = CB.title.trim() || 'Untitled chain';
    var sents = CB.sents.map(function (s, i) { return { id: 'sn' + (i + 1) + Store.uid(''), text: s.text, kw: s.kw }; });
    var ch = Store.addChain(CB.subjectId || null, CB.essayId || null, title, sents);
    CB = { title: '', subjectId: '', essayId: '', raw: '', sents: null };
    FX.toast('Chain created — ' + sents.length + ' links ⛓️', 'green');
    App.go({ v: 'chain', id: ch.id });
  };

  /* --- Chain board — works like the harbour: reveal, grade, earn the green --- */
  function linkCardHTML(ch, i) {
    var sn = ch.sentences[i];
    var key = 'c:' + ch.id + ':' + sn.id;
    var st = Store.data().state[key];
    var conf = st ? st.conf : null;
    var got = st ? st.got : 0;
    var hold = U.hold(key);
    var isDue = hold && hold.due;
    var revealed = App.isRev(key);
    var verified = Store.isVerified(key);
    var CRIT = Store.GREEN_CRITERION;

    var html = '<div class="item ' + U.stClass(key) + '" data-card="' + key + '">';

    html += '<div class="cell cell-term"><div class="term-top"><span class="num">' + (i + 1) + '</span>'
      + (isDue ? '<span class="due-pill">⚓ Review due</span>' : '')
      + (!verified && got > 0 && got < CRIT ? '<span class="pill" title="Successful recalls — ' + CRIT + ' anchors it">⚓ ' + got + '/' + CRIT + '</span>' : '')
      + '</div><div class="term">' + U.esc(sn.kw) + '</div>'
      + '<div class="ctx">link ' + (i + 1) + ' of ' + ch.sentences.length + '</div></div>';

    html += '<div class="cell cell-content"><div class="tools">'
      + (i > 0 ? '<button class="tool" title="Move up" data-a="link-up" data-ch="' + ch.id + '" data-sid="' + sn.id + '">↑</button>' : '')
      + (i < ch.sentences.length - 1 ? '<button class="tool" title="Move down" data-a="link-down" data-ch="' + ch.id + '" data-sid="' + sn.id + '">↓</button>' : '')
      + '<button class="tool" title="Edit keyword or sentence" data-a="link-edit" data-ch="' + ch.id + '" data-sid="' + sn.id + '">✎</button>'
      + '</div>';
    if (!revealed) {
      if (window.textMode()) html += window.typeZoneHTML(key);
      else html += '<div class="hidden-panel" data-a="reveal" data-k="' + key + '">👁 Reveal sentence — say it or whiteboard it first</div>';
    } else {
      html += (window.textMode() ? window.producedHTML(key) : '')
        + '<div class="c-text">' + U.esc(sn.text) + '</div>'
        + '<div class="after-row"><span class="grade-hint">Did you produce it?</span>'
        + '<button class="gbtn g1" data-a="grade" data-k="' + key + '" data-g="1">✗ Missed</button>'
        + '<button class="gbtn g2" data-a="grade" data-k="' + key + '" data-g="2">~ Shaky</button>'
        + '<button class="gbtn g3" data-a="grade" data-k="' + key + '" data-g="3">✓ Got it</button>'
        + '<button class="gbtn g4" data-a="grade" data-k="' + key + '" data-g="4">⚡ Instant</button>'
        + '<button class="hide-link" data-a="hide" data-k="' + key + '">Hide</button></div>';
    }
    html += '</div>';

    html += '<div class="cell cell-meta"><div class="meta-lbl">Confidence' + (verified ? ' <span style="color:var(--green)">⚓</span>' : '') + '</div>'
      + '<div class="conf-btns">'
      + '<button class="cbtn g' + (conf === 'g' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="g"><span class="cdot"></span>Know it' + (conf === 'g' && !verified && got < CRIT ? '<span class="unv">' + got + '/' + CRIT + '</span>' : '') + '</button>'
      + '<button class="cbtn a' + (conf === 'a' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="a"><span class="cdot"></span>Getting there</button>'
      + '<button class="cbtn r' + (conf === 'r' ? ' on' : '') + '" data-a="conf" data-k="' + key + '" data-c="r"><span class="cdot"></span>Not yet</button></div>';
    if (hold) {
      var col = U.holdColor(hold.r);
      html += '<div class="hold-line' + (isDue ? ' due' : '') + '">'
        + (isDue ? '⚓ Due — recall now ~' + hold.pct + '%' : 'Holding ' + hold.pct + '% · ~' + (hold.S < 1 ? '&lt;1' : Math.round(hold.S)) + 'd stability')
        + '</div><div class="hold-bar"><div class="hold-fill" style="width:' + hold.pct + '%;background:' + col + '"></div></div>';
    }
    html += '<div class="hold-line" style="color:var(--text3)">🕒 ' + (st && st.srs ? 'Last reviewed ' + U.ago(st.srs.last) : 'Never reviewed') + '</div>';
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

  V.chain = function (route) {
    var ch = Store.chainById(route.id);
    if (!ch) return '<div class="empty">Chain not found.</div>';
    var links = chainLinkStates(ch);
    var done = links.filter(function (l) { return l.verified; }).length;
    var dueLinks = links.filter(function (l) { return l.due; }).length;
    var ord = chainOrderState(ch);
    var subj = ch.subjectId ? Store.subjectById(ch.subjectId) : null;
    var essay = ch.essayId ? Store.essayById(ch.essayId) : null;

    var html = '<button class="bh-back" data-a="chains">← Chains</button>'
      + '<div class="board-head"><div><div class="bh-title">' + U.esc(ch.title) + '</div>'
      + '<div class="bh-sub">' + (essay ? '📝 ' + U.esc(essay.title) + ' · ' : '') + (subj ? U.esc(subj.name) + ' · ' : '') + ch.sentences.length + ' links'
      + (chainForged(ch) ? ' · <span style="color:var(--green);font-weight:800">⚓ forged — keep it polished</span>' : '') + '</div></div>'
      + '<div class="bh-actions"><button class="btn" data-a="chain-edit" data-id="' + ch.id + '">✎ Edit</button></div></div>';

    // harbour-style stat row for the chain
    var inprog = 0, fresh = 0;
    links.forEach(function (l) { if (!l.verified) { if (l.started) inprog++; else fresh++; } });
    var dueAll = dueLinks + (ord.due ? 1 : 0);
    function sc(n, lbl, color, sub, extra) {
      return '<div class="stat' + (extra || '') + '"' + (extra ? ' data-a="chain-drill" data-id="' + ch.id + '"' : '') + '><div class="n" style="color:' + color + '">' + n + '</div>'
        + '<div class="l">' + lbl + '</div><div class="sub">' + sub + '</div></div>';
    }
    html += '<div class="statrow">'
      + sc(done + '/' + links.length, 'Links anchored', 'var(--green)', '3+ successful recalls each')
      + sc(inprog, 'Getting there', 'var(--amber)', 'keep recalling — 3 anchors it')
      + sc(fresh, 'New', 'var(--text3)', 'not tested yet')
      + sc(ord.verified ? '⚓' : (ord.started ? '…' : '—'), 'Order', ord.verified ? 'var(--green)' : 'var(--text3)', ord.verified ? 'sequence anchored' : (ord.started ? 'in training' : 'not learned yet'))
      + sc(dueAll, 'Due for review', dueAll ? 'var(--amber)' : 'var(--text3)', dueAll ? 'tap to strengthen' : 'all holding strong', ' click' + (dueAll ? ' hot' : ''))
      + '</div>';

    html += '<div class="chain-card">' + linksVisual(ch)
      + '<div class="ch-sub">' + done + '/' + links.length + ' links forged'
      + (dueLinks ? ' · <span style="color:var(--amber);font-weight:700">' + dueLinks + ' fading — strengthen them</span>' : '') + '</div></div>';

    html += '<div class="stage-grid">';
    html += '<div class="stage"><div class="st-num">Stage 1 · Order</div><div class="st-name">Master the sequence</div>'
      + '<div class="st-desc">Lock in the keyword order first — it becomes the skeleton the whole paragraph hangs on.</div>'
      + '<div class="st-state" style="color:' + (ord.verified ? 'var(--green)' : 'var(--text3)') + '">'
      + (ord.verified ? '⚓ Anchored' + (ord.hold ? ' · holding ' + ord.hold.pct + '%' : '') : ord.started ? 'In training' : 'Not started') + (ord.due ? ' · <span style="color:var(--amber)">due</span>' : '') + '</div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap">'
      + '<button class="btn" data-a="game-arrange" data-id="' + ch.id + '">Arrange</button>'
      + '<button class="btn" data-a="game-nextlink" data-id="' + ch.id + '">Recall the chain</button></div></div>';

    html += '<div class="stage"><div class="st-num">Stage 2 · Links</div><div class="st-name">Keyword → sentence</div>'
      + '<div class="st-desc">Each keyword becomes a recall card: see the keyword, produce the full sentence.</div>'
      + '<div class="st-state" style="color:' + (done === links.length ? 'var(--green)' : 'var(--text3)') + '">' + done + '/' + links.length + ' anchored' + (dueLinks ? ' · <span style="color:var(--amber)">' + dueLinks + ' due</span>' : '') + '</div>'
      + '<button class="btn" data-a="chain-drill" data-id="' + ch.id + '">Drill links</button></div>';

    html += '<div class="stage"><div class="st-num">Stage 3 · Recital</div><div class="st-name">Write the lot</div>'
      + '<div class="st-desc">Free recall — reproduce the whole paragraph from memory, then check it sentence-by-sentence.</div>'
      + '<div class="st-state" style="color:var(--text3)">The highest-value retrieval there is</div>'
      + '<button class="btn primary" data-a="recital" data-id="' + ch.id + '">Full recital</button></div>';
    html += '</div>';

    html += '<div class="sec-head"><span>The links — test yourself, card by card</span>' + window.studyModeToggle() + '</div>';
    ch.sentences.forEach(function (sn, i) { html += linkCardHTML(ch, i); });
    return html;
  };

  /* --- Chain & link editing ---------------------------------------------------- */
  function findSent(chId, sid) {
    var ch = Store.chainById(chId);
    if (!ch) return null;
    var i = ch.sentences.findIndex(function (s) { return s.id === sid; });
    return i < 0 ? null : { ch: ch, i: i, sn: ch.sentences[i] };
  }
  ACTIONS['link-up'] = function (el) {
    var r = findSent(el.getAttribute('data-ch'), el.getAttribute('data-sid'));
    if (!r || r.i === 0) return;
    var a = r.ch.sentences;
    a[r.i] = a[r.i - 1]; a[r.i - 1] = r.sn;
    Store.save(); App.render();
  };
  ACTIONS['link-down'] = function (el) {
    var r = findSent(el.getAttribute('data-ch'), el.getAttribute('data-sid'));
    if (!r || r.i >= r.ch.sentences.length - 1) return;
    var a = r.ch.sentences;
    a[r.i] = a[r.i + 1]; a[r.i + 1] = r.sn;
    Store.save(); App.render();
  };
  ACTIONS['link-edit'] = function (el) {
    var r = findSent(el.getAttribute('data-ch'), el.getAttribute('data-sid'));
    if (!r) return;
    Modal.open('<div class="m-title">Edit link ' + (r.i + 1) + '</div>'
      + '<div class="m-row"><label class="m-lbl">Keyword (your retrieval cue)</label><input class="m-input" id="mKw" maxlength="30" value="' + U.esc(r.sn.kw) + '"></div>'
      + '<div class="m-row"><label class="m-lbl">Sentence</label><textarea class="m-ta" id="mSent">' + U.esc(r.sn.text) + '</textarea></div>'
      + '<div class="m-actions"><button class="btn warn" data-a="link-del" data-ch="' + r.ch.id + '" data-sid="' + r.sn.id + '" style="margin-right:auto">Delete link</button>'
      + '<button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="link-edit-ok" data-ch="' + r.ch.id + '" data-sid="' + r.sn.id + '">Save</button></div>');
  };
  ACTIONS['link-edit-ok'] = function (el) {
    var r = findSent(el.getAttribute('data-ch'), el.getAttribute('data-sid'));
    if (!r) return;
    var kw = (document.getElementById('mKw').value || '').trim();
    var text = (document.getElementById('mSent').value || '').trim();
    if (!kw || !text) { FX.toast('Keyword and sentence both need something in them.', 'amber'); return; }
    var dupe = r.ch.sentences.some(function (s, j) { return j !== r.i && s.kw.toLowerCase() === kw.toLowerCase(); });
    if (dupe) { FX.toast('“' + kw + '” is already a keyword in this chain — keep them distinct.', 'amber'); return; }
    r.sn.kw = kw; r.sn.text = text;
    Store.save(); Modal.close(); App.render();
  };
  ACTIONS['link-del'] = function (el) {
    var r = findSent(el.getAttribute('data-ch'), el.getAttribute('data-sid'));
    if (!r) return;
    Modal.confirm('Delete link ' + (r.i + 1) + ' (“' + r.sn.kw + '”)?', 'The sentence and its study history go with it.', 'Delete link', true, function () {
      delete Store.data().state['c:' + r.ch.id + ':' + r.sn.id];
      r.ch.sentences.splice(r.i, 1);
      Store.save(); App.render();
    });
  };
  ACTIONS['chain-edit'] = function (el) {
    var ch = Store.chainById(el.getAttribute('data-id'));
    if (!ch) return;
    var D = Store.data();
    Modal.open('<div class="m-title">Edit chain</div>'
      + '<div class="m-row"><label class="m-lbl">Title</label><input class="m-input" id="mTitle" value="' + U.esc(ch.title) + '"></div>'
      + '<div class="m-row"><label class="m-lbl">Essay</label><select class="m-select" id="mEssay"><option value="">— standalone —</option>'
      + D.essays.map(function (e) { return '<option value="' + e.id + '"' + (ch.essayId === e.id ? ' selected' : '') + '>' + U.esc(e.title) + '</option>'; }).join('') + '</select></div>'
      + '<div class="m-row"><label class="m-lbl">Subject</label><select class="m-select" id="mSubj"><option value="">— none —</option>'
      + D.subjects.map(function (s) { return '<option value="' + s.id + '"' + (ch.subjectId === s.id ? ' selected' : '') + '>' + U.esc(s.name) + '</option>'; }).join('') + '</select></div>'
      + '<div class="m-actions"><button class="btn warn" data-a="chain-del" data-id="' + ch.id + '" style="margin-right:auto">Delete chain</button>'
      + '<button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="chain-edit-ok" data-id="' + ch.id + '">Save</button></div>');
  };
  ACTIONS['chain-edit-ok'] = function (el) {
    var ch = Store.chainById(el.getAttribute('data-id'));
    if (!ch) return;
    var t = document.getElementById('mTitle').value.trim();
    if (t) ch.title = t;
    ch.essayId = document.getElementById('mEssay').value || null;
    ch.subjectId = document.getElementById('mSubj').value || null;
    Store.save(); Modal.close(); App.render();
  };
  ACTIONS['essay-edit'] = function (el) {
    var e = Store.essayById(el.getAttribute('data-id'));
    if (!e) return;
    var subs = Store.data().subjects;
    Modal.open('<div class="m-title">Edit essay</div>'
      + '<div class="m-row"><label class="m-lbl">Title</label><input class="m-input" id="mTitle" value="' + U.esc(e.title) + '"></div>'
      + '<div class="m-row"><label class="m-lbl">Subject</label><select class="m-select" id="mSubj"><option value="">— none —</option>'
      + subs.map(function (s) { return '<option value="' + s.id + '"' + (e.subjectId === s.id ? ' selected' : '') + '>' + U.esc(s.name) + '</option>'; }).join('') + '</select></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="essay-edit-ok" data-id="' + e.id + '">Save</button></div>');
  };
  ACTIONS['essay-edit-ok'] = function (el) {
    var e = Store.essayById(el.getAttribute('data-id'));
    if (!e) return;
    var t = document.getElementById('mTitle').value.trim();
    if (t) e.title = t;
    e.subjectId = document.getElementById('mSubj').value || null;
    Store.save(); Modal.close(); App.render();
  };

  ACTIONS['chain-drill'] = function (el) {
    var ch = Store.chainById(el.getAttribute('data-id'));
    var q = Store.chainFacets(ch).map(function (f) { return f.key; });
    q.sort(function (a, b) {
      var ha = U.hold(a), hb = U.hold(b);
      return (ha ? ha.r : 1.01) - (hb ? hb.r : 1.01);
    });
    App.startSession(q, { v: 'chain', id: ch.id }, 'Chain · ' + ch.title);
  };

  /* --- Arrange game ----------------------------------------------------------- */
  var AR = null; // {chId, pool:[idx], placed:[idx], errors}
  V.arrange = function (route) {
    var ch = Store.chainById(route.id);
    if (!AR || AR.chId !== ch.id) {
      var idx = ch.sentences.map(function (_, i) { return i; });
      for (var i = idx.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      AR = { chId: ch.id, pool: idx, placed: [], errors: 0 };
    }
    var html = '<button class="bh-back" data-a="chain-open" data-id="' + ch.id + '">← ' + U.esc(ch.title) + '</button>'
      + '<div class="game-zone"><div class="gz-title">Arrange the chain</div>'
      + '<div class="gz-sub">Tap the keywords in their correct order. Mistakes shake — and count.</div>';

    html += '<div class="kw-skeleton">';
    for (var s = 0; s < ch.sentences.length; s++) {
      if (s < AR.placed.length) html += '<span class="kchip kslot filled"><span class="kn">' + (s + 1) + '</span>' + U.esc(ch.sentences[AR.placed[s]].kw) + '</span>';
      else html += '<span class="kchip ghost kslot"><span class="kn">' + (s + 1) + '</span>·····</span>';
    }
    html += '</div><div style="border-top:1px solid var(--line);margin:16px 0"></div><div class="kw-skeleton">';
    AR.pool.forEach(function (si) {
      var used = AR.placed.indexOf(si) >= 0;
      html += '<button class="kchip' + (used ? ' used' : '') + '" data-a="arr-pick" data-si="' + si + '">' + U.esc(ch.sentences[si].kw) + '</button>';
    });
    html += '</div>';
    html += '<div class="m-hint" style="margin-top:14px">Errors this run: <b style="color:' + (AR.errors ? 'var(--red)' : 'var(--green)') + '">' + AR.errors + '</b></div>';
    html += '</div>';
    return html;
  };
  ACTIONS['game-arrange'] = function (el) { AR = null; App.go({ v: 'arrange', id: el.getAttribute('data-id') }); };
  ACTIONS['arr-pick'] = function (el) {
    var ch = Store.chainById(AR.chId);
    var si = +el.getAttribute('data-si');
    if (si === AR.placed.length) {
      AR.placed.push(si);
      if (AR.placed.length === ch.sentences.length) {
        var g = AR.errors === 0 ? 3 : (AR.errors <= 2 ? 2 : 1);
        var res = Store.applyGrade('o:' + ch.id, g);
        App.renderTop();
        var msg = AR.errors === 0 ? 'Perfect order ✓' : 'Chain complete — ' + AR.errors + ' slip' + (AR.errors > 1 ? 's' : '') + '. It’ll come back sooner.';
        FX.toast(msg, AR.errors === 0 ? 'green' : 'amber');
        if (res.wentGreen) { FX.confetti(); }
        AR = null;
        App.go({ v: 'chain', id: ch.id });
        App.checkChainForged(ch);
        return;
      }
      App.render();
    } else {
      AR.errors++;
      el.classList.add('wrongflash');
      setTimeout(function () { el.classList.remove('wrongflash'); }, 380);
      var errEl = document.querySelector('.game-zone .m-hint b');
      if (errEl) { errEl.textContent = AR.errors; errEl.style.color = 'var(--red)'; }
    }
  };

  /* --- Recall-the-chain game (nothing is given away) ---------------------------
     Round 0 asks for link 1 cold — exactly like the exam will. Each later
     round shows only what you have already produced yourself.               */
  var NL = null; // {chId, i, errors, hints}
  V.nextlink = function (route) {
    var ch = Store.chainById(route.id);
    if (!NL || NL.chId !== ch.id) NL = { chId: ch.id, i: 0, errors: 0, hints: 0 };
    var n = ch.sentences.length;
    var html = '<button class="bh-back" data-a="chain-open" data-id="' + ch.id + '">← ' + U.esc(ch.title) + '</button>'
      + '<div class="game-zone"><div class="gz-title">Recall the chain</div>'
      + '<div class="gz-sub">Walk the whole chain from memory, link by link — starting from nothing, like on exam day. (' + (NL.i + 1) + '/' + n + ')</div>';
    if (NL.i === 0) {
      html += '<div class="nl-prompt"><span style="color:var(--text3)">Start of the chain</span> <span class="arr">→</span> <span style="color:var(--text3)">?</span></div>';
    } else {
      html += '<div class="nl-prompt"><span class="kn" style="color:var(--text3)">' + NL.i + '.</span> ' + U.esc(ch.sentences[NL.i - 1].kw) + ' <span class="arr">→</span> <span style="color:var(--text3)">?</span></div>';
    }
    html += '<input class="nl-input" id="nlInput" autocomplete="off" placeholder="' + (NL.i === 0 ? 'What’s link 1?' : 'What follows?') + '">'
      + '<div class="sess-actions"><button class="btn primary" data-a="nl-check" data-id="' + ch.id + '">Check</button>'
      + '<button class="btn" data-a="nl-hint" data-id="' + ch.id + '">First letter</button>'
      + '<span class="m-hint">Errors: <b>' + NL.errors + '</b> · Hints: <b>' + NL.hints + '</b></span></div></div>';
    return html;
  };
  ACTIONS['game-nextlink'] = function (el) {
    NL = null;
    App.go({ v: 'nextlink', id: el.getAttribute('data-id') });
  };
  ACTIONS['nl-hint'] = function () {
    var ch = Store.chainById(NL.chId);
    var ans = ch.sentences[NL.i].kw;
    NL.hints++;
    var inp = document.getElementById('nlInput');
    inp.value = ans.charAt(0);
    inp.focus();
    FX.toast('Starts with “' + ans.charAt(0).toUpperCase() + '”', '', 1400);
    var hEl = document.querySelectorAll('.game-zone .m-hint b')[1];
    if (hEl) hEl.textContent = NL.hints;
  };
  ACTIONS['nl-check'] = function () {
    var ch = Store.chainById(NL.chId);
    var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var ans = norm(ch.sentences[NL.i].kw);
    var inp = document.getElementById('nlInput');
    var got = norm(inp.value);
    var ok = got && (got === ans || (got.length >= 4 && ans.indexOf(got) === 0));
    if (ok) {
      inp.classList.remove('bad'); inp.classList.add('ok');
      setTimeout(function () {
        NL.i++;
        if (NL.i >= ch.sentences.length) {
          var miss = NL.errors + Math.ceil(NL.hints / 2);
          var g = miss === 0 ? 3 : (miss <= 2 ? 2 : 1);
          var res = Store.applyGrade('o:' + NL.chId, g);
          App.renderTop();
          FX.toast(miss === 0 ? 'Flawless — the whole chain from a cold start ⚓' : 'Chain walked — ' + NL.errors + ' errors, ' + NL.hints + ' hints.', miss === 0 ? 'green' : 'amber');
          if (res.wentGreen) FX.confetti();
          var id = NL.chId; NL = null;
          App.go({ v: 'chain', id: id });
          App.checkChainForged(ch);
        } else App.render();
      }, 350);
    } else {
      NL.errors++;
      inp.classList.remove('ok'); inp.classList.add('bad');
      setTimeout(function () { inp.classList.remove('bad'); }, 400);
      var b = document.querySelector('.game-zone .m-hint b');
      if (b) b.textContent = NL.errors;
    }
  };

  /* --- Recital ----------------------------------------------------------------- */
  var RC = null; // {chId, submitted, text, showSkel, graded:{}}
  V.recital = function (route) {
    var ch = Store.chainById(route.id);
    if (!RC || RC.chId !== ch.id) RC = { chId: ch.id, submitted: false, text: '', showSkel: false, graded: {} };
    var html = '<button class="bh-back" data-a="chain-open" data-id="' + ch.id + '">← ' + U.esc(ch.title) + '</button>'
      + '<div class="game-zone"><div class="gz-title">Full recital</div>';

    if (!RC.submitted) {
      html += '<div class="gz-sub">Write the whole paragraph from memory — type it here, or do it on a whiteboard/paper first if that flows better. This is the money rep; free recall beats everything else.</div>';
      html += '<div style="margin-bottom:12px"><button class="btn" data-a="rec-skel">' + (RC.showSkel ? 'Hide' : 'Show') + ' keyword skeleton</button></div>';
      if (RC.showSkel) {
        html += '<div class="kw-skeleton">' + ch.sentences.map(function (sn, i) {
          return '<span class="kchip"><span class="kn">' + (i + 1) + '</span>' + U.esc(sn.kw) + '</span>';
        }).join('') + '</div>';
      }
      html += '<textarea class="cb-ta" id="recTa" style="min-height:220px" placeholder="From memory — go.">' + U.esc(RC.text) + '</textarea>'
        + '<div class="m-actions" style="justify-content:flex-start"><button class="btn primary" data-a="rec-check">Check against the original</button></div>';
    } else {
      html += '<div class="gz-sub">Compare sentence-by-sentence. Grade what you <b>wrote</b>, not what you meant.</div>';
      if (RC.text.trim()) html += '<div class="ab-lbl">What you wrote</div><div class="your-answer" style="margin-bottom:16px">' + U.esc(RC.text) + '</div>';
      html += '<div class="ab-lbl acc">The original, link by link</div>';
      ch.sentences.forEach(function (sn, i) {
        var k = 'c:' + ch.id + ':' + sn.id;
        var g = RC.graded[k];
        html += '<div class="rc-row' + (g ? ' graded' : '') + '"><div class="rc-kw">' + (i + 1) + ' · ' + U.esc(sn.kw) + '</div>'
          + '<div class="rc-text">' + U.esc(sn.text) + '</div>'
          + '<div class="rc-grades">'
          + [1, 2, 3, 4].map(function (gg) {
            var lbl = ['✗ Missed', '~ Shaky', '✓ Got it', '⚡ Instant'][gg - 1];
            return '<button class="gbtn g' + gg + (g === gg ? ' picked' : '') + '" data-a="rec-grade" data-k="' + k + '" data-g="' + gg + '">' + lbl + '</button>';
          }).join('') + '</div></div>';
      });
      var doneN = Object.keys(RC.graded).length;
      html += '<div class="m-actions" style="justify-content:flex-start">'
        + '<button class="btn primary" data-a="rec-done" ' + (doneN === ch.sentences.length ? '' : 'disabled') + '>Finish recital (' + doneN + '/' + ch.sentences.length + ' graded)</button></div>';
    }
    html += '</div>';
    return html;
  };
  ACTIONS['recital'] = function (el) { RC = null; App.go({ v: 'recital', id: el.getAttribute('data-id') }); };
  ACTIONS['rec-skel'] = function () {
    var ta = document.getElementById('recTa');
    if (ta) RC.text = ta.value;
    RC.showSkel = !RC.showSkel; App.render();
    var ta2 = document.getElementById('recTa');
    if (ta2) { ta2.focus(); ta2.selectionStart = ta2.value.length; }
  };
  ACTIONS['rec-check'] = function () {
    RC.text = (document.getElementById('recTa') || { value: '' }).value;
    RC.submitted = true;
    App.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  ACTIONS['rec-grade'] = function (el) {
    var k = el.getAttribute('data-k'), g = +el.getAttribute('data-g');
    if (RC.graded[k]) return;
    RC.graded[k] = g;
    var res = Store.applyGrade(k, g);
    App.renderTop();
    if (res.wentGreen) FX.burstOn(el, 12);
    App.render();
  };
  ACTIONS['rec-done'] = function () {
    var ch = Store.chainById(RC.chId);
    var gs = Object.keys(RC.graded).map(function (k) { return RC.graded[k]; });
    var good = gs.filter(function (g) { return g >= 3; }).length;
    FX.toast('Recital complete — ' + good + '/' + gs.length + ' sentences recalled.', good === gs.length ? 'green' : '');
    if (good === gs.length) FX.confetti();
    RC = null;
    App.go({ v: 'chain', id: ch.id });
    App.checkChainForged(ch);
  };

  /* ══════════════════════════════════════════════════════════════════════
     STATS — the honest dashboards
     ════════════════════════════════════════════════════════════════════ */
  V.stats = function (route) {
    var D = Store.data();
    var now = Date.now();
    var ret = D.settings.retention;
    var selId = route && route.s ? route.s : null;
    var selSubj = selId ? Store.subjectById(selId) : null;
    if (selId && !selSubj) selId = null;

    var subjects = selSubj ? [selSubj] : D.subjects;
    var chains = D.chains.filter(function (ch) { return selId ? ch.subjectId === selId : true; });

    var rows = [];
    subjects.forEach(function (subj) {
      Store.subjectFacets(subj).forEach(function (f) {
        var st = D.state[f.key];
        rows.push({ key: f.key, groupLbl: (selSubj ? f.tab.name : subj.name + ' · ' + f.tab.name), st: st, verified: Store.isVerified(f.key) });
      });
    });
    chains.forEach(function (ch) {
      var e = ch.essayId ? Store.essayById(ch.essayId) : null;
      Store.chainFacets(ch).forEach(function (f) {
        var st = D.state[f.key];
        rows.push({ key: f.key, groupLbl: 'Chains · ' + (e ? e.title : ch.title), st: st, verified: Store.isVerified(f.key) });
      });
    });

    var total = rows.length;
    var verified = rows.filter(function (r) { return r.verified; }).length;
    var withSrs = rows.filter(function (r) { return r.st && r.st.srs; });
    var meanR = withSrs.length ? withSrs.reduce(function (a, r) { return a + FSRS.rNow(r.st.srs, now); }, 0) / withSrs.length : null;
    var due = withSrs.filter(function (r) { return r.verified && FSRS.rNow(r.st.srs, now) <= ret; }).length;
    var banked = withSrs.reduce(function (a, r) { return a + r.st.srs.S; }, 0);
    var got = 0, miss = 0;
    rows.forEach(function (r) { if (r.st) { got += r.st.got; miss += r.st.miss; } });

    var html = '<div class="board-head"><div><div class="bh-title">Stats' + (selSubj ? ' · ' + U.esc(selSubj.name) : '') + '</div>'
      + '<div class="bh-sub">Honest numbers. “Recall right now” can go down — that’s the point.</div></div></div>';

    // per-subject filter
    html += '<div class="navcard"><div class="topic-pills">'
      + '<button class="tp-pill' + (!selId ? ' on' : '') + '" data-a="stats-subj" data-s="">All subjects</button>';
    D.subjects.forEach(function (s2) {
      html += '<button class="tp-pill' + (selId === s2.id ? ' on' : '') + '" data-a="stats-subj" data-s="' + s2.id + '">' + U.esc(s2.name) + '</button>';
    });
    html += '</div></div>';

    html += '<div class="statrow">'
      + statCard(total ? U.pct(verified, total) + '%' : '—', 'Anchored', 'var(--green)', verified + ' of ' + total + ' cards, 3+ recalls each')
      + statCard(meanR === null ? '—' : Math.round(meanR * 100) + '%', 'Recall right now', meanR === null ? 'var(--text3)' : U.holdColor(meanR), 'estimated live retrievability')
      + statCard(due, 'Ready to strengthen', due ? 'var(--amber)' : 'var(--text3)', 'anchored cards at/below your ' + Math.round(ret * 100) + '% target')
      + statCard(Math.round(banked), 'Memory-days banked', 'var(--accent)', 'total stability across cards')
      + statCard(got + miss ? U.pct(got, got + miss) + '%' : '—', 'Recall accuracy', 'var(--accent)', '✓ ' + got + ' · ✗ ' + miss + ' all-time')
      + '</div>';

    html += '<div class="sp-grid">';

    html += '<div class="sp-card wide"><div class="sp-title">Anchored across your syllabus</div>';
    var groups = {};
    rows.forEach(function (r) {
      var g = groups[r.groupLbl] || (groups[r.groupLbl] = { n: 0, v: 0, gu: 0, a: 0, rr: 0 });
      g.n++;
      if (r.verified) g.v++;
      else if (r.st && r.st.conf === 'g') g.gu++;
      else if (r.st && r.st.conf === 'a') g.a++;
      else if (r.st && r.st.conf === 'r') g.rr++;
    });
    Object.keys(groups).forEach(function (gk) {
      var g = groups[gk];
      html += '<div class="sp-row"><div class="sp-lbl">' + U.esc(gk) + '</div><div class="sp-bar">'
        + seg(g.v, g.n, 'var(--green)') + seg(g.gu, g.n, 'rgba(52,211,153,.35)') + seg(g.a, g.n, 'var(--amber)') + seg(g.rr, g.n, 'var(--red)')
        + '</div><div class="sp-pct">' + U.pct(g.v, g.n) + '%</div></div>';
    });
    html += '<div class="sp-legend"><span><span class="lg-dot" style="background:var(--green)"></span>Anchored (3+ recalls)</span>'
      + '<span><span class="lg-dot" style="background:rgba(52,211,153,.35)"></span>Tagged green, unproven</span>'
      + '<span><span class="lg-dot" style="background:var(--amber)"></span>Getting there</span>'
      + '<span><span class="lg-dot" style="background:var(--red)"></span>Not yet</span>'
      + '<span style="margin-left:auto">% = anchored share</span></div></div>';

    // forecast
    var fc = [];
    for (var d = 0; d < 14; d++) fc.push(0);
    withSrs.filter(function (r) { return r.verified; }).forEach(function (r) {
      var ctx = Store.resolveFacet(r.key);
      var exam = ctx && ctx.subject ? ctx.subject.examDate : null;
      var at = FSRS.dueAt(r.st.srs, ret, exam);
      var days = Math.floor((at - now) / 864e5);
      if (days < 0) days = 0;
      if (days < 14) fc[days]++;
    });
    var maxFc = Math.max.apply(null, fc.concat([1]));
    html += '<div class="sp-card"><div class="sp-title">Review pipeline — next 14 days</div><div class="fc-chart">';
    fc.forEach(function (n, i) {
      var dt = new Date(now + i * 864e5);
      html += '<div class="fc-col"><span class="fc-n">' + (n || '') + '</span>'
        + '<div class="fc-bar' + (i === 0 ? ' today' : '') + '" style="height:' + Math.max(3, Math.round(n / maxFc * 62)) + 'px"></div>'
        + '<span class="fc-lbl">' + (i === 0 ? 'now' : dt.getDate()) + '</span></div>';
    });
    html += '</div><div class="sp-legend"><span>Cards falling below your retention target each day</span></div></div>';

    // calibration
    var cal = { g: { n: 0, ok: 0 }, a: { n: 0, ok: 0 }, r: { n: 0, ok: 0 } };
    rows.forEach(function (r2) {
      if (!r2.st) return;
      r2.st.hist.forEach(function (h) {
        if (!h.c || !cal[h.c]) return;
        cal[h.c].n++;
        if (h.g >= 3) cal[h.c].ok++;
      });
    });
    html += '<div class="sp-card"><div class="sp-title">Calibration — do you know what you know?</div>';
    [['g', 'When you’d tagged it “Know it”', 'var(--green)'],
     ['a', 'When you’d tagged it “Getting there”', 'var(--amber)'],
     ['r', 'When you’d tagged it “Not yet”', 'var(--red)']].forEach(function (row) {
      var c = cal[row[0]];
      var p = c.n ? U.pct(c.ok, c.n) : null;
      html += '<div class="cal-row"><div class="cal-top"><span>' + row[1] + '</span><span>' + (p === null ? '—' : p + '% recalled') + (c.n ? ' <span style="color:var(--text3);font-weight:600">(' + c.n + ')</span>' : '') + '</span></div>'
        + '<div class="pbar"><div class="pbar-fill" style="width:' + (p || 0) + '%;background:' + row[2] + '"></div></div></div>';
    });
    var gP = cal.g.n ? U.pct(cal.g.ok, cal.g.n) : null;
    html += '<div class="cal-note">' + (gP === null ? 'Study a while and Anchor will show how accurate your self-judgement is — most students start overconfident.'
      : gP >= 85 ? 'Your green tags are trustworthy — well-calibrated.' : 'Your “Know it” tags succeed ' + gP + '% of the time — tag green a little more sparingly and test sooner.') + '</div></div>';

    // activity heatmap (12 weeks) — per-subject views rebuild it from card history
    html += '<div class="sp-card wide"><div class="sp-title">Activity — last 12 weeks' + (selSubj ? ' · this subject' : '') + '</div><div style="overflow-x:auto"><div class="hm-grid">';
    var actMap = null;
    if (selId) {
      actMap = {};
      rows.forEach(function (r) {
        if (!r.st) return;
        r.st.hist.forEach(function (h) {
          var dk = Store.todayISO(new Date(h.t));
          actMap[dk] = (actMap[dk] || 0) + 1;
        });
      });
    }
    var start = new Date(); start.setDate(start.getDate() - 83);
    var maxAct = 1;
    var actArr = [];
    for (var i2 = 0; i2 < 84; i2++) {
      var dd = new Date(start.getTime() + i2 * 864e5);
      var iso2 = Store.todayISO(dd);
      var n2 = actMap ? (actMap[iso2] || 0) : (D.act[iso2] ? D.act[iso2].n : 0);
      actArr.push(n2);
      if (n2 > maxAct) maxAct = n2;
    }
    actArr.forEach(function (n) {
      var lv = n === 0 ? 0 : Math.min(4, Math.ceil(n / maxAct * 4));
      html += '<div class="hm-cell" data-lv="' + lv + '" title="' + n + ' reviews"></div>';
    });
    html += '</div></div><div class="sp-legend"><span>Each cell is a day · darker = more real reviews</span></div></div>';

    html += '</div>';
    return html;

    function statCard(n, l, color, sub) {
      return '<div class="stat"><div class="n" style="color:' + color + '">' + n + '</div><div class="l">' + l + '</div><div class="sub">' + sub + '</div></div>';
    }
    function seg(count, tot, color) {
      if (!count) return '';
      return '<div class="sp-seg" style="width:' + (count / tot * 100) + '%;background:' + color + '"></div>';
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     DATA & SETTINGS
     ════════════════════════════════════════════════════════════════════ */
  function aiPromptText() {
    return [
      '# Anchor import format — instructions for an AI assistant',
      '',
      'You are converting my study notes into an import file for **Anchor**, my memorisation app.',
      '',
      '## Output rules',
      '',
      '1. Reply with ONE JSON code block and nothing else.',
      '2. Use exactly this shape:',
      '',
      '```json',
      '{',
      '  "anchorShare": 2,',
      '  "subject": {',
      '    "name": "Subject name",',
      '    "tagline": "short subtitle (optional)",',
      '    "dual": false,',
      '    "tabs": [',
      '      {',
      '        "name": "Tab name — one area of the syllabus",',
      '        "cards": [',
      '          {',
      '            "term": "Front of the card — the cue I will be shown",',
      '            "back": "Back of the card — exactly what I must recall",',
      '            "group": "Optional small heading that clusters nearby cards inside a tab"',
      '          }',
      '        ]',
      '      }',
      '    ]',
      '  }',
      '}',
      '```',
      '',
      '3. **dual mode:** if I ask for definition + key-facts style (suits subjects like HSC Business Studies), set `"dual": true` and give each card `"def"` and/or `"key"` fields INSTEAD of `"back"`.',
      '4. **Tabs mirror how the syllabus is examined** — e.g. "Finance — Role", "Finance — Influences". Aim for 4–16 tabs.',
      '5. Card fronts must work as retrieval cues on their own. Keep each back under ~80 words; use " · " separators or \\n line breaks for lists.',
      '6. Use `"group"` sparingly — only when a tab naturally splits into labelled clusters of cards.',
      '7. Cover ALL of my notes. Do not invent content that is not in them.',
      '8. Output valid JSON: escape quotes and newlines properly. Do not include comments or ids.',
      '',
      '## How to write cards that actually stick (memory science — follow strictly)',
      '',
      'These rules come from retrieval-practice research. Apply every one of them:',
      '',
      '- **One fact per card.** If a back would hold more than ~3 separable facts, split it into several cards.',
      '- **Fronts are specific cues, not topic labels.** Write "What does the current ratio measure, and what is its formula?" — never just "Current ratio". A good front forces exactly one answer out of memory.',
      '- **No yes/no questions.** Always ask for the thing itself.',
      '- **Rephrase, never copy.** Turn statements from my notes into questions or cues; the back is the shortest complete answer.',
      '- **Keep backs under ~40 words** on simple cards. Use " · " separators, max 4 points per card.',
      '- **Split long lists.** For a list of 5+ items: one overview card ("Name the six operations influences") plus one card per item carrying its detail.',
      '- **Fronts must be mutually distinguishable.** If two cards could swap answers, rewrite them with discriminating context.',
      '- **Keep concrete numbers, examples and case names** from my notes on the backs — specifics are retrieval hooks.',
      '- **In dual mode:** "def" is the precise exam-language definition; "key" is the examinable detail (advantages/disadvantages, formulas, statistics, examples, cases).',
      '',
      'After this message I will paste my notes. Convert them completely.'
    ].join('\n');
  }

  V.data = function () {
    var D = Store.data();
    var s = D.settings;
    var cloudOn = window.Cloud && Cloud.isOn();
    var html = '<div class="board-head"><div><div class="bh-title">Data &amp; settings</div>'
      + '<div class="bh-sub">' + (cloudOn
        ? 'Every change syncs to your account automatically. Exports still make good belt-and-braces backups.'
        : 'Your data lives on this device. Export regularly — it’s one tap.') + '</div></div></div>';

    html += '<div class="set-grid">';

    if (window.Cloud) html += Cloud.accountCard();

    html += '<div class="set-card"><div class="set-title">Study settings</div>'
      + '<div class="set-desc">The retention target is the recall probability at which a card comes due (research default: 90%). Three successful recalls anchor a card.</div>'
      + '<div class="set-row"><span class="set-lbl">Daily review goal</span><input class="set-input" id="setGoal" type="number" min="5" max="200" value="' + s.dailyGoal + '"></div>'
      + '<div class="set-row"><span class="set-lbl">Retention target</span><select class="set-input wide" id="setRet">'
      + [0.8, 0.85, 0.9, 0.95].map(function (r) { return '<option value="' + r + '"' + (Math.abs(s.retention - r) < 0.001 ? ' selected' : '') + '>' + Math.round(r * 100) + '%</option>'; }).join('')
      + '</select></div>'
      + '<div class="set-row"><span class="set-lbl">Text mode — type or dictate your answer, then reveal to compare (also toggleable on every board)</span><button class="switch' + (s.typeFirst ? ' on' : '') + '" data-a="set-typefirst" role="switch" aria-checked="' + s.typeFirst + '"></button></div>'
      + '<div class="set-row"><span class="set-lbl">Theme</span><button class="btn" data-a="theme">Toggle light / dark</button></div>'
      + '<div class="m-actions" style="justify-content:flex-start"><button class="btn primary" data-a="set-save">Save settings</button></div></div>';

    html += '<div class="set-card"><div class="set-title">Subjects — share &amp; exam dates</div>'
      + '<div class="set-desc">⇪ downloads a subject file you can send a mate (they import it from the Harbour). Exam dates compress scheduling as the day approaches.</div>';
    if (!D.subjects.length) html += '<div class="m-hint">No subjects yet.</div>';
    D.subjects.forEach(function (subj) {
      html += '<div class="set-row"><span class="set-lbl">' + U.esc(subj.name) + '</span>'
        + '<input class="set-input wide" type="date" data-exam="' + subj.id + '" value="' + (subj.examDate || '') + '">'
        + '<button class="tool" title="Share / export this subject" data-a="share-subj" data-id="' + subj.id + '">⇪</button>'
        + '<button class="tool" title="Delete subject" data-a="del-subj" data-id="' + subj.id + '">🗑</button></div>';
    });
    if (D.subjects.length) html += '<div class="m-actions" style="justify-content:flex-start"><button class="btn primary" data-a="set-exams">Save exam dates</button></div>';
    html += '</div>';

    html += '<div class="set-card"><div class="set-title">Build a subject with AI (outside Anchor)</div>'
      + '<div class="set-desc">Anchor has no AI inside — but your favourite AI can format your notes into a perfect import file. Copy this prompt, paste it into ChatGPT/Claude/Gemini with your notes, save the JSON it returns as a <b>.json</b> file, then import it below.</div>'
      + '<div class="m-actions" style="justify-content:flex-start;margin-top:0">'
      + '<button class="btn primary" data-a="ai-copy">📋 Copy AI prompt</button>'
      + '<button class="btn" data-a="ai-download">⬇ Download as .md</button></div></div>';

    html += '<div class="set-card"><div class="set-title">Backup &amp; import</div>'
      + '<div class="set-desc">Full backup includes progress. Import accepts backups, shared subjects, and AI-generated subject files.</div>'
      + '<div class="m-actions" style="justify-content:flex-start;margin-top:0">'
      + '<button class="btn primary" data-a="export-all">⬇ Export full backup</button>'
      + '<button class="btn" data-a="import">⬆ Import file</button></div></div>';

    html += '<div class="set-card"><div class="set-title">The science, in one breath</div>'
      + '<div class="set-desc">Anchor is built on the two study techniques rated “high utility” across all of educational psychology — practice testing and spaced practice — scheduled by FSRS, the open algorithm trained on 500M+ real reviews.</div>'
      + '<div class="sci-quote">Retrieval beats re-reading (g≈0.5–0.6, strongest for secondary students). Spacing beats cramming. Producing beats recognising. Self-chosen cues beat given ones. And green earned by three real recalls beats green you gave yourself.</div>'
      + '<div class="m-hint" style="margin-top:10px">🖊 Pro move: keep a mini-whiteboard next to you and produce every answer on it before revealing — full free recall, zero typing friction, and wiping it clean feels great.</div>'
      + '<div class="m-hint">Full write-up with citations lives in <b>docs/RESEARCH.md</b> in the project.</div></div>';

    html += '<div class="set-card"><div class="set-title" style="color:var(--red)">Danger zone</div>'
      + '<div class="set-desc">These cannot be undone. Export a backup first.</div>'
      + '<div class="m-actions" style="justify-content:flex-start">'
      + '<button class="btn warn" data-a="reset-progress">Reset all progress</button>'
      + '<button class="btn warn" data-a="wipe-all">Erase everything</button></div></div>';

    html += '</div>';
    return html;
  };

  ACTIONS['set-typefirst'] = function (el) {
    var s = Store.data().settings;
    s.typeFirst = !s.typeFirst;
    Store.save();
    el.classList.toggle('on', s.typeFirst);
  };
  ACTIONS['set-save'] = function () {
    var s = Store.data().settings;
    var g = parseInt(document.getElementById('setGoal').value, 10);
    if (g >= 1 && g <= 500) s.dailyGoal = g;
    s.retention = parseFloat(document.getElementById('setRet').value) || 0.9;
    Store.save();
    App.renderTop();
    FX.toast('Settings saved ✓', 'green');
  };
  ACTIONS['set-exams'] = function () {
    document.querySelectorAll('[data-exam]').forEach(function (inp) {
      var subj = Store.subjectById(inp.getAttribute('data-exam'));
      if (subj) subj.examDate = inp.value || null;
    });
    Store.save();
    FX.toast('Exam dates saved ✓', 'green');
  };
  ACTIONS['del-subj'] = function (el) {
    var subj = Store.subjectById(el.getAttribute('data-id'));
    Modal.confirm('Delete “' + subj.name + '”?', 'All its tabs, cards, chains and study history will be permanently removed.', 'Delete subject', true, function () {
      Store.deleteSubject(subj.id);
      if (App.route.v === 'subject') App.go({ v: 'home' });
      else App.render();
      FX.toast('Subject deleted.', '');
    });
  };

  function download(name, text, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  ACTIONS['ai-copy'] = function (el) {
    var txt = aiPromptText();
    function done() { FX.toast('AI prompt copied — paste it into any AI with your notes 📋', 'green', 3000); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { download('anchor-ai-prompt.md', txt, 'text/markdown'); });
    } else {
      download('anchor-ai-prompt.md', txt, 'text/markdown');
    }
  };
  ACTIONS['ai-download'] = function () {
    download('anchor-ai-prompt.md', aiPromptText(), 'text/markdown');
    FX.toast('Prompt downloaded ✓', 'green');
  };

  ACTIONS['export-all'] = function () {
    download('anchor-backup-' + Store.todayISO() + '.json', Store.exportAll());
    FX.toast('Backup downloaded ✓', 'green');
  };
  ACTIONS['share-subj'] = function (el) {
    var id = el.getAttribute('data-id');
    var subj = Store.subjectById(id);
    Modal.open('<div class="m-title">Share “' + U.esc(subj.name) + '”</div>'
      + '<div class="m-sub">Downloads a file your mate imports from the Harbour (or Data page). “Content only” is the one to send.</div>'
      + '<div class="m-actions" style="justify-content:flex-start">'
      + '<button class="btn primary" data-a="share-subj-go" data-id="' + id + '" data-p="0">Content only</button>'
      + '<button class="btn" data-a="share-subj-go" data-id="' + id + '" data-p="1">Content + my progress</button></div>');
  };
  ACTIONS['share-subj-go'] = function (el) {
    var id = el.getAttribute('data-id'), p = el.getAttribute('data-p') === '1';
    var subj = Store.subjectById(id);
    download('anchor-' + subj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + (p ? '-with-progress' : '') + '.json', Store.exportSubject(id, p));
    Modal.close();
    FX.toast('Subject file downloaded — send it over ⇪', 'green');
  };
  ACTIONS['import'] = function () {
    Modal.close();
    var f = document.getElementById('importFile');
    f.onchange = function () {
      if (!f.files || !f.files[0]) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var res = Store.importData(reader.result);
          FX.toast(res.kind === 'full' ? 'Backup restored ✓' : '“' + res.name + '” imported — ' + res.cards + ' cards ✓', 'green', 3000);
          App.renderTop(); App.render();
        } catch (e) {
          FX.toast('That doesn’t look like an Anchor file — check it’s the JSON the AI produced.', 'amber', 3400);
        }
      };
      reader.readAsText(f.files[0]);
      f.value = '';
    };
    f.click();
  };
  ACTIONS['reset-progress'] = function () {
    Modal.confirm('Reset ALL progress?', 'Every confidence tag, review schedule and stat goes back to zero. Your subjects, cards and chains are kept.', 'Reset progress', true, function () {
      Store.resetProgress();
      App.renderTop(); App.render();
      FX.toast('Progress reset.', '');
    });
  };
  ACTIONS['wipe-all'] = function () {
    var cloudOn = window.Cloud && Cloud.isOn();
    Modal.confirm('Erase EVERYTHING?',
      'Subjects, chains, progress — all of it, gone from this device' + (cloudOn ? ' and from your cloud account' : '') + '.',
      'Erase everything', true, function () {
      var wipeLocal = function () {
        localStorage.removeItem('anchor_v1');
        localStorage.removeItem('anchor_dirty');
        location.reload();
      };
      if (cloudOn) {
        Cloud.wipeCloud(function (ok) {
          if (ok) wipeLocal();
          else FX.toast('Couldn’t erase the cloud copy — are you offline? Nothing was deleted.', 'amber', 3400);
        });
      } else wipeLocal();
    });
  };
})();

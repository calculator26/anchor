/* ============================================================================
   Anchor · ui-extra.js — utilities, FX engine, modals, Chains, Stats, Data.
   Loads before ui-main.js. Registers handlers into the shared ACTIONS map;
   references to App resolve at call time (after boot).
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
    stClass: function (key) {
      var st = Store.data().state[key];
      if (!st || !st.conf) return '';
      return st.conf === 'g' ? 'cg' : st.conf === 'a' ? 'ca' : 'cr';
    },
    // Live memory-hold info for a facet: {r 0..1, pctTxt, due, S}
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
    modeLabel: function (mode) { return mode === 'def' ? 'Definition' : 'Key facts'; }
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

    // Variable-reward wrapper for a facet going verified-green (12% bonus variant)
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

  /* ══════════════════════════════════════════════════════════════════════
     CHAINS · Mode B — sequential mastery
     ════════════════════════════════════════════════════════════════════ */
  var V = window.V = {};

  function chainLinkStates(ch) {
    return ch.sentences.map(function (sn) {
      var k = 'c:' + ch.id + ':' + sn.id;
      var st = Store.data().state[k];
      var h = U.hold(k);
      return {
        key: k, sent: sn,
        verified: Store.isVerified(k),
        started: !!(st && st.srs),
        due: h ? h.due : false
      };
    });
  }
  function chainOrderState(ch) {
    var k = 'o:' + ch.id;
    var st = Store.data().state[k];
    var h = U.hold(k);
    return { key: k, started: !!(st && st.srs), verified: Store.isVerified(k), due: h ? h.due : false, hold: h };
  }
  function chainForged(ch) {
    var links = chainLinkStates(ch);
    return chainOrderState(ch).verified && links.every(function (l) { return l.verified; });
  }
  window.chainForged = chainForged;

  function linksVisual(ch) {
    var html = '<div class="ch-links">';
    chainLinkStates(ch).forEach(function (l) {
      var cls = l.verified ? (l.due ? 'due' : 'done') : (l.started ? 'part' : '');
      html += '<span class="lk ' + cls + '" title="' + U.esc(l.sent.kw) + '"></span>';
    });
    html += '</div>';
    return html;
  }

  V.chains = function () {
    var chains = Store.data().chains;
    var html = '<div class="board-head"><div><div class="bh-title">Chains</div>'
      + '<div class="bh-sub">Essay &amp; sequence mastery — one keyword per sentence, master the order, then forge every link.</div></div>'
      + '<div class="bh-actions"><button class="btn primary" data-a="chain-new">+ New chain</button></div></div>';

    if (!chains.length) {
      html += '<div class="empty"><span class="big">⛓️</span>No chains yet.<br>Paste an essay paragraph and Anchor will help you master it sentence-by-sentence — the keyword method, built in.<br><br><button class="btn primary" data-a="chain-new">Build your first chain</button></div>';
      return html;
    }
    chains.forEach(function (ch) {
      var links = chainLinkStates(ch);
      var done = links.filter(function (l) { return l.verified; }).length;
      var ord = chainOrderState(ch);
      var subj = ch.subjectId ? Store.subjectById(ch.subjectId) : null;
      var dueN = links.filter(function (l) { return l.due; }).length + (ord.due ? 1 : 0);
      html += '<div class="chain-card">'
        + '<div class="ch-top"><span class="ch-title">' + U.esc(ch.title) + '</span>'
        + (subj ? '<span class="pill">' + U.esc(subj.name) + '</span>' : '')
        + (chainForged(ch) ? '<span class="forged">⚓ Forged</span>' : '')
        + (dueN ? '<span class="pill due">' + dueN + ' due</span>' : '')
        + '<span class="ch-actions"><button class="btn" data-a="chain-open" data-id="' + ch.id + '">Study</button>'
        + '<button class="tool" title="Delete chain" data-a="chain-del" data-id="' + ch.id + '">🗑</button></span></div>'
        + linksVisual(ch)
        + '<div class="ch-sub">' + ch.sentences.length + ' links · ' + done + ' forged · order '
        + (ord.verified ? 'anchored' + (ord.hold ? ' — holding ' + ord.hold.pct + '%' : '') : (ord.started ? 'in training' : 'not learned yet')) + '</div>'
        + '</div>';
    });
    return html;
  };

  ACTIONS['chain-del'] = function (el) {
    var id = el.getAttribute('data-id');
    var ch = Store.chainById(id);
    Modal.confirm('Delete “' + ch.title + '”?', 'The chain and its study history will be removed. This cannot be undone.', 'Delete chain', true, function () {
      Store.deleteChain(id);
      App.render();
    });
  };
  ACTIONS['chain-open'] = function (el) { App.go({ v: 'chain', id: el.getAttribute('data-id') }); };
  ACTIONS['chain-new'] = function () { App.go({ v: 'chainBuild' }); };

  /* --- Builder ------------------------------------------------------------ */
  var CB = { title: '', subjectId: '', raw: '', sents: null }; // sents: [{text, kw}]

  function splitSentences(text) {
    var clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    var parts = clean.match(/[^.!?]+[.!?]+(?:['")\]]+)?|[^.!?]+$/g) || [clean];
    return parts.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 1; });
  }

  V.chainBuild = function () {
    var subs = Store.data().subjects;
    var html = '<button class="bh-back" data-a="chains">← Chains</button>'
      + '<div class="board-head"><div><div class="bh-title">New chain</div>'
      + '<div class="bh-sub">Paste a paragraph → give every sentence <b>one keyword you choose yourself</b> (choosing is encoding). Then master the sequence, then the links.</div></div></div>';

    html += '<div class="set-card" style="margin-bottom:14px"><div class="set-row">'
      + '<div class="m-row" style="flex:2;min-width:220px;margin:0"><label class="m-lbl">Title</label>'
      + '<input class="m-input" id="cbTitle" placeholder="e.g. Operations essay — technology paragraph" value="' + U.esc(CB.title) + '"></div>'
      + '<div class="m-row" style="flex:1;min-width:170px;margin:0"><label class="m-lbl">Subject</label>'
      + '<select class="m-select" id="cbSubj">' + '<option value="">— none —</option>'
      + subs.map(function (s) { return '<option value="' + s.id + '"' + (CB.subjectId === s.id ? ' selected' : '') + '>' + U.esc(s.name) + '</option>'; }).join('')
      + '</select></div></div>';

    if (!CB.sents) {
      html += '<div class="m-row"><label class="m-lbl">Paste your paragraph</label>'
        + '<textarea class="cb-ta" id="cbRaw" placeholder="Paste the paragraph or short essay you need to memorise, exactly as you want to reproduce it…">' + U.esc(CB.raw) + '</textarea></div>'
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
          + '<div class="cb-kwline">Keyword: ' + (sn.kw
            ? '<span class="kchip">' + U.esc(sn.kw) + '</span> <button class="linklike" data-a="cb-kw-clear" data-i="' + i + '">change</button>'
            : '<span style="color:var(--text3)">tap a word ↓ or</span> <button class="linklike" data-a="cb-kw-custom" data-i="' + i + '">type your own</button>') + '</div>';
        if (!sn.kw) {
          html += '<div style="margin-top:7px">';
          var seen = {};
          sn.text.split(/[^A-Za-z0-9’'-]+/).forEach(function (w) {
            var t = w.trim();
            if (t.length < 3 || seen[t.toLowerCase()]) return;
            seen[t.toLowerCase()] = 1;
            html += '<button class="wchip" data-a="cb-kw" data-i="' + i + '" data-w="' + U.esc(t) + '">' + U.esc(t) + '</button>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
      var ready = CB.sents.length >= 2 && CB.sents.every(function (s) { return s.kw; });
      html += '<div class="m-actions" style="justify-content:flex-start">'
        + '<button class="btn" data-a="cb-restart">← Start over</button>'
        + '<button class="btn primary" data-a="cb-create" ' + (ready ? '' : 'disabled') + '>Create chain (' + CB.sents.length + ' links)</button></div>';
    }
    return html;
  };

  function cbSync() {
    var t = document.getElementById('cbTitle'), s = document.getElementById('cbSubj'), r = document.getElementById('cbRaw');
    if (t) CB.title = t.value;
    if (s) CB.subjectId = s.value;
    if (r) CB.raw = r.value;
  }
  ACTIONS['cb-split'] = function () {
    cbSync();
    var sents = splitSentences(CB.raw);
    if (sents.length < 2) { FX.toast('Need at least two sentences to build a chain.', 'amber'); return; }
    CB.sents = sents.map(function (s) { return { text: s, kw: '' }; });
    App.render();
  };
  ACTIONS['cb-restart'] = function () { cbSync(); CB.sents = null; App.render(); };
  ACTIONS['cb-kw'] = function (el) {
    cbSync();
    var i = +el.getAttribute('data-i'), w = el.getAttribute('data-w');
    var dupe = CB.sents.some(function (s, j) { return j !== i && s.kw && s.kw.toLowerCase() === w.toLowerCase(); });
    if (dupe) { FX.toast('“' + w + '” is already a keyword in this chain — pick something distinct.', 'amber'); return; }
    CB.sents[i].kw = w;
    App.render();
  };
  ACTIONS['cb-kw-clear'] = function (el) { cbSync(); CB.sents[+el.getAttribute('data-i')].kw = ''; App.render(); };
  ACTIONS['cb-kw-custom'] = function (el) {
    cbSync();
    var i = +el.getAttribute('data-i');
    Modal.open('<div class="m-title">Your keyword for sentence ' + (i + 1) + '</div>'
      + '<div class="m-sub">' + U.esc(CB.sents[i].text) + '</div>'
      + '<div class="m-row"><input class="m-input" id="mKw" placeholder="One memorable word"></div>'
      + '<div class="m-actions"><button class="btn" data-a="modal-close">Cancel</button>'
      + '<button class="btn primary" data-a="cb-kw-custom-ok" data-i="' + i + '">Set keyword</button></div>');
  };
  ACTIONS['cb-kw-custom-ok'] = function (el) {
    var i = +el.getAttribute('data-i');
    var v = (document.getElementById('mKw').value || '').trim().split(/\s+/)[0] || '';
    if (!v) return;
    CB.sents[i].kw = v;
    Modal.close(); App.render();
  };
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
    var title = CB.title.trim() || 'Untitled chain';
    var sents = CB.sents.map(function (s, i) { return { id: 'sn' + (i + 1) + Store.uid(''), text: s.text, kw: s.kw }; });
    var ch = Store.addChain(CB.subjectId || null, title, sents);
    CB.title = ''; CB.raw = ''; CB.sents = null; CB.subjectId = '';
    FX.toast('Chain created — ' + sents.length + ' links ⛓️', 'green');
    App.go({ v: 'chain', id: ch.id });
  };

  /* --- Chain board ---------------------------------------------------------- */
  V.chain = function (route) {
    var ch = Store.chainById(route.id);
    if (!ch) return '<div class="empty">Chain not found.</div>';
    var links = chainLinkStates(ch);
    var done = links.filter(function (l) { return l.verified; }).length;
    var dueLinks = links.filter(function (l) { return l.due; }).length;
    var ord = chainOrderState(ch);
    var subj = ch.subjectId ? Store.subjectById(ch.subjectId) : null;

    var html = '<button class="bh-back" data-a="chains">← Chains</button>'
      + '<div class="board-head"><div><div class="bh-title">' + U.esc(ch.title) + '</div>'
      + '<div class="bh-sub">' + (subj ? U.esc(subj.name) + ' · ' : '') + ch.sentences.length + ' links'
      + (chainForged(ch) ? ' · <span style="color:var(--green);font-weight:800">⚓ forged — keep it polished</span>' : '') + '</div></div></div>';

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
      + '<button class="btn" data-a="game-nextlink" data-id="' + ch.id + '">Next link</button></div></div>';

    html += '<div class="stage"><div class="st-num">Stage 2 · Links</div><div class="st-name">Keyword → sentence</div>'
      + '<div class="st-desc">Each keyword becomes a recall card: see the keyword, produce the full sentence.</div>'
      + '<div class="st-state" style="color:' + (done === links.length ? 'var(--green)' : 'var(--text3)') + '">' + done + '/' + links.length + ' anchored' + (dueLinks ? ' · <span style="color:var(--amber)">' + dueLinks + ' due</span>' : '') + '</div>'
      + '<button class="btn" data-a="chain-drill" data-id="' + ch.id + '">Drill links</button></div>';

    html += '<div class="stage"><div class="st-num">Stage 3 · Recital</div><div class="st-name">Write the lot</div>'
      + '<div class="st-desc">Free recall — reproduce the whole paragraph from memory, then check it sentence-by-sentence.</div>'
      + '<div class="st-state" style="color:var(--text3)">The highest-value retrieval there is</div>'
      + '<button class="btn primary" data-a="recital" data-id="' + ch.id + '">Full recital</button></div>';
    html += '</div>';

    html += '<div class="sec-head">The chain</div><div class="game-zone">';
    ch.sentences.forEach(function (sn, i) {
      var st = links[i];
      var kwHtml = '<b style="color:var(--accent)">' + U.esc(sn.kw) + '</b>';
      var rx = null;
      try { rx = new RegExp('\\b(' + sn.kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'i'); } catch (e) {}
      var textHtml = U.esc(sn.text);
      if (rx && rx.test(sn.text)) textHtml = U.esc(sn.text).replace(rx, '<b style="color:var(--accent)">$1</b>');
      else textHtml = kwHtml + ' — ' + textHtml;
      html += '<div class="rec-orig"><div class="cb-num">' + (i + 1) + ' · ' + U.esc(sn.kw.toUpperCase())
        + (st.verified ? ' <span style="color:var(--green)">⚓</span>' : '') + '</div>'
        + '<div class="cb-text">' + textHtml + '</div></div>';
    });
    html += '</div>';
    return html;
  };

  ACTIONS['chain-drill'] = function (el) {
    var ch = Store.chainById(el.getAttribute('data-id'));
    var q = Store.chainFacets(ch).map(function (f) { return f.key; });
    // due-first ordering
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
    if (si === AR.placed.length) {         // correct: the si-th sentence is next
      AR.placed.push(si);
      if (AR.placed.length === ch.sentences.length) {
        var g = AR.errors === 0 ? 3 : (AR.errors <= 2 ? 2 : 1);
        var res = Store.applyGrade('o:' + ch.id, g);
        App.renderTop();
        var msg = AR.errors === 0 ? 'Perfect order! Sequence anchored.' : 'Chain complete — ' + AR.errors + ' slip' + (AR.errors > 1 ? 's' : '') + '. It’ll come back sooner.';
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

  /* --- Next-link game ------------------------------------------------------------ */
  var NL = null; // {chId, order:[transitions], i, errors, hintUsed}
  V.nextlink = function (route) {
    var ch = Store.chainById(route.id);
    if (!NL || NL.chId !== ch.id) {
      var tr = [];
      for (var i = 0; i < ch.sentences.length - 1; i++) tr.push(i);
      NL = { chId: ch.id, order: tr, i: 0, errors: 0, hints: 0 };
    }
    var t = NL.order[NL.i];
    var html = '<button class="bh-back" data-a="chain-open" data-id="' + ch.id + '">← ' + U.esc(ch.title) + '</button>'
      + '<div class="game-zone"><div class="gz-title">Next link</div>'
      + '<div class="gz-sub">What follows? Type the next keyword in the chain. (' + (NL.i + 1) + '/' + NL.order.length + ')</div>'
      + '<div class="nl-prompt"><span class="kn" style="color:var(--text3)">' + (t + 1) + '.</span> ' + U.esc(ch.sentences[t].kw) + ' <span class="arr">→</span> <span style="color:var(--text3)">?</span></div>'
      + '<input class="nl-input" id="nlInput" autocomplete="off" placeholder="Next keyword…">'
      + '<div class="sess-actions"><button class="btn primary" data-a="nl-check" data-id="' + ch.id + '">Check</button>'
      + '<button class="btn" data-a="nl-hint" data-id="' + ch.id + '">First letter</button>'
      + '<span class="m-hint">Errors: <b>' + NL.errors + '</b> · Hints: <b>' + NL.hints + '</b></span></div></div>';
    return html;
  };
  ACTIONS['game-nextlink'] = function (el) {
    var ch = Store.chainById(el.getAttribute('data-id'));
    if (ch.sentences.length < 2) return;
    NL = null;
    App.go({ v: 'nextlink', id: ch.id });
  };
  ACTIONS['nl-hint'] = function () {
    var ch = Store.chainById(NL.chId);
    var ans = ch.sentences[NL.order[NL.i] + 1].kw;
    NL.hints++;
    var inp = document.getElementById('nlInput');
    inp.value = ans.charAt(0);
    inp.focus();
    FX.toast('Starts with “' + ans.charAt(0).toUpperCase() + '”', '', 1400);
  };
  ACTIONS['nl-check'] = function () {
    var ch = Store.chainById(NL.chId);
    var ans = ch.sentences[NL.order[NL.i] + 1].kw.toLowerCase().replace(/[^a-z0-9]/g, '');
    var inp = document.getElementById('nlInput');
    var got = (inp.value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    var ok = got === ans || (got.length >= 4 && ans.indexOf(got) === 0);
    if (ok) {
      inp.classList.remove('bad'); inp.classList.add('ok');
      setTimeout(function () {
        NL.i++;
        if (NL.i >= NL.order.length) {
          var miss = NL.errors + Math.ceil(NL.hints / 2);
          var g = miss === 0 ? 3 : (miss <= 2 ? 2 : 1);
          var res = Store.applyGrade('o:' + NL.chId, g);
          App.renderTop();
          FX.toast(miss === 0 ? 'Flawless — every link recalled ⚓' : 'Chain walked — ' + NL.errors + ' errors, ' + NL.hints + ' hints.', miss === 0 ? 'green' : 'amber');
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
  var RC = null; // {chId, submitted:false, text, showSkel, graded:{}}
  V.recital = function (route) {
    var ch = Store.chainById(route.id);
    if (!RC || RC.chId !== ch.id) RC = { chId: ch.id, submitted: false, text: '', showSkel: false, graded: {} };
    var html = '<button class="bh-back" data-a="chain-open" data-id="' + ch.id + '">← ' + U.esc(ch.title) + '</button>'
      + '<div class="game-zone"><div class="gz-title">Full recital</div>';

    if (!RC.submitted) {
      html += '<div class="gz-sub">Write the whole paragraph from memory. This is the money rep — free recall beats everything else.</div>';
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
  V.stats = function () {
    var D = Store.data();
    var now = Date.now();
    var ret = D.settings.retention;

    // gather every facet with content
    var rows = []; // {key, subj, topic, verified, conf, srs}
    D.subjects.forEach(function (subj) {
      Store.subjectFacets(subj).forEach(function (f) {
        var st = D.state[f.key];
        rows.push({ key: f.key, subjName: subj.name, topicName: f.topic.name, st: st, verified: Store.isVerified(f.key) });
      });
    });
    D.chains.forEach(function (ch) {
      Store.chainFacets(ch).forEach(function (f) {
        var st = D.state[f.key];
        rows.push({ key: f.key, subjName: 'Chains', topicName: ch.title, st: st, verified: Store.isVerified(f.key) });
      });
    });

    var total = rows.length;
    var verified = rows.filter(function (r) { return r.verified; }).length;
    var withSrs = rows.filter(function (r) { return r.st && r.st.srs; });
    var meanR = withSrs.length ? withSrs.reduce(function (a, r) { return a + FSRS.rNow(r.st.srs, now); }, 0) / withSrs.length : null;
    var due = withSrs.filter(function (r) { return FSRS.rNow(r.st.srs, now) <= ret; }).length;
    var banked = withSrs.reduce(function (a, r) { return a + r.st.srs.S; }, 0);
    var got = 0, miss = 0;
    rows.forEach(function (r) { if (r.st) { got += r.st.got; miss += r.st.miss; } });

    var html = '<div class="board-head"><div><div class="bh-title">Stats</div>'
      + '<div class="bh-sub">Honest numbers. “Recall right now” can go down — that’s the point.</div></div></div>';

    html += '<div class="statrow">'
      + statCard(total ? U.pct(verified, total) + '%' : '—', 'Anchored', 'var(--green)', verified + ' of ' + total + ' facets recall-verified')
      + statCard(meanR === null ? '—' : Math.round(meanR * 100) + '%', 'Recall right now', meanR === null ? 'var(--text3)' : U.holdColor(meanR), 'estimated live retrievability')
      + statCard(due, 'Ready to strengthen', due ? 'var(--amber)' : 'var(--text3)', 'at or below your ' + Math.round(ret * 100) + '% target')
      + statCard(Math.round(banked), 'Memory-days banked', 'var(--accent)', 'total stability across facets')
      + statCard(got + miss ? U.pct(got, got + miss) + '%' : '—', 'Recall accuracy', 'var(--accent)', '✓ ' + got + ' · ✗ ' + miss + ' all-time')
      + '</div>';

    html += '<div class="sp-grid">';

    // per subject/topic verified bars
    html += '<div class="sp-card wide"><div class="sp-title">Anchored across your syllabus</div>';
    var groups = {};
    rows.forEach(function (r) {
      var gk = r.subjName + ' · ' + r.topicName;
      var g = groups[gk] || (groups[gk] = { n: 0, v: 0, gu: 0, a: 0, rr: 0 });
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
    html += '<div class="sp-legend"><span><span class="lg-dot" style="background:var(--green)"></span>Anchored (verified)</span>'
      + '<span><span class="lg-dot" style="background:rgba(52,211,153,.35)"></span>Tagged green, untested</span>'
      + '<span><span class="lg-dot" style="background:var(--amber)"></span>Getting there</span>'
      + '<span><span class="lg-dot" style="background:var(--red)"></span>Not yet</span>'
      + '<span style="margin-left:auto">% = verified share</span></div></div>';

    // forecast
    var fc = [];
    for (var d = 0; d < 14; d++) fc.push(0);
    withSrs.forEach(function (r) {
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

    // activity heatmap (12 weeks)
    html += '<div class="sp-card wide"><div class="sp-title">Activity — last 12 weeks</div><div style="overflow-x:auto"><div class="hm-grid">';
    var start = new Date(); start.setDate(start.getDate() - 83);
    var maxAct = 1;
    var actArr = [];
    for (var i2 = 0; i2 < 84; i2++) {
      var dd = new Date(start.getTime() + i2 * 864e5);
      var a = D.act[Store.todayISO(dd)];
      actArr.push(a ? a.n : 0);
      if (a && a.n > maxAct) maxAct = a.n;
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
  V.data = function () {
    var D = Store.data();
    var s = D.settings;
    var html = '<div class="board-head"><div><div class="bh-title">Data &amp; settings</div>'
      + '<div class="bh-sub">Your data lives on this device. Export regularly — it’s one tap.</div></div></div>';

    html += '<div class="set-grid">';

    html += '<div class="set-card"><div class="set-title">Study settings</div>'
      + '<div class="set-desc">The retention target is the recall probability at which a card comes due (research default: 90%).</div>'
      + '<div class="set-row"><span class="set-lbl">Daily review goal</span><input class="set-input" id="setGoal" type="number" min="5" max="200" value="' + s.dailyGoal + '"></div>'
      + '<div class="set-row"><span class="set-lbl">Retention target</span><select class="set-input wide" id="setRet">'
      + [0.8, 0.85, 0.9, 0.95].map(function (r) { return '<option value="' + r + '"' + (Math.abs(s.retention - r) < 0.001 ? ' selected' : '') + '>' + Math.round(r * 100) + '%</option>'; }).join('')
      + '</select></div>'
      + '<div class="set-row"><span class="set-lbl">Produce-before-reveal (type first) in sessions</span><button class="switch' + (s.typeFirst ? ' on' : '') + '" data-a="set-typefirst" role="switch" aria-checked="' + s.typeFirst + '"></button></div>'
      + '<div class="set-row"><span class="set-lbl">Theme</span><button class="btn" data-a="theme">Toggle light / dark</button></div>'
      + '<div class="m-actions" style="justify-content:flex-start"><button class="btn primary" data-a="set-save">Save settings</button></div></div>';

    html += '<div class="set-card"><div class="set-title">Subjects &amp; exam dates</div>'
      + '<div class="set-desc">Set each exam date — Anchor compresses review scheduling as it approaches and never schedules past it.</div>';
    if (!D.subjects.length) html += '<div class="m-hint">No subjects yet.</div>';
    D.subjects.forEach(function (subj) {
      html += '<div class="set-row"><span class="set-lbl">' + U.esc(subj.name) + '</span>'
        + '<input class="set-input wide" type="date" data-exam="' + subj.id + '" value="' + (subj.examDate || '') + '">'
        + '<button class="tool" title="Share / export this subject" data-a="share-subj" data-id="' + subj.id + '">⇪</button>'
        + '<button class="tool" title="Delete subject" data-a="del-subj" data-id="' + subj.id + '">🗑</button></div>';
    });
    if (D.subjects.length) html += '<div class="m-actions" style="justify-content:flex-start"><button class="btn primary" data-a="set-exams">Save exam dates</button></div>';
    html += '</div>';

    html += '<div class="set-card"><div class="set-title">Backup &amp; sharing</div>'
      + '<div class="set-desc">Full backup includes progress. Subject share exports content only — perfect for sending a mate your syllabus.</div>'
      + '<div class="m-actions" style="justify-content:flex-start;margin-top:0">'
      + '<button class="btn primary" data-a="export-all">⬇ Export full backup</button>'
      + '<button class="btn" data-a="import">⬆ Import file</button></div>'
      + '<input type="file" id="importFile" accept=".json,application/json" style="display:none">'
      + '<div class="m-hint" id="lastBackupHint"></div></div>';

    html += '<div class="set-card"><div class="set-title">The science, in one breath</div>'
      + '<div class="set-desc">Anchor is built on the two study techniques rated “high utility” across all of educational psychology — practice testing and spaced practice — scheduled by FSRS, the open algorithm trained on 500M+ real reviews.</div>'
      + '<div class="sci-quote">Retrieval beats re-reading (g≈0.5–0.6, strongest for secondary students). Spacing beats cramming. Producing beats recognising. Self-chosen cues beat given ones. And green you earned by recall beats green you gave yourself.</div>'
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
    Modal.confirm('Delete “' + subj.name + '”?', 'All its topics, items, chains and study history will be permanently removed.', 'Delete subject', true, function () {
      Store.deleteSubject(subj.id);
      App.render();
      FX.toast('Subject deleted.', '');
    });
  };
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  ACTIONS['export-all'] = function () {
    download('anchor-backup-' + Store.todayISO() + '.json', Store.exportAll());
    FX.toast('Backup downloaded ✓', 'green');
  };
  ACTIONS['share-subj'] = function (el) {
    var id = el.getAttribute('data-id');
    var subj = Store.subjectById(id);
    Modal.open('<div class="m-title">Share “' + U.esc(subj.name) + '”</div>'
      + '<div class="m-sub">Choose what to include. “Content only” is what you send a mate.</div>'
      + '<div class="m-actions" style="justify-content:flex-start">'
      + '<button class="btn primary" data-a="share-subj-go" data-id="' + id + '" data-p="0">Content only</button>'
      + '<button class="btn" data-a="share-subj-go" data-id="' + id + '" data-p="1">Content + my progress</button></div>');
  };
  ACTIONS['share-subj-go'] = function (el) {
    var id = el.getAttribute('data-id'), p = el.getAttribute('data-p') === '1';
    var subj = Store.subjectById(id);
    download('anchor-' + subj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + (p ? '-with-progress' : '') + '.json', Store.exportSubject(id, p));
    Modal.close();
    FX.toast('Share file downloaded ✓', 'green');
  };
  ACTIONS['import'] = function () {
    var f = document.getElementById('importFile');
    f.onchange = function () {
      if (!f.files || !f.files[0]) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var res = Store.importData(reader.result);
          FX.toast(res.kind === 'full' ? 'Backup restored ✓' : '“' + res.name + '” imported ✓', 'green');
          App.renderTop(); App.render();
        } catch (e) {
          FX.toast('That doesn’t look like an Anchor file.', 'amber');
        }
      };
      reader.readAsText(f.files[0]);
      f.value = '';
    };
    f.click();
  };
  ACTIONS['reset-progress'] = function () {
    Modal.confirm('Reset ALL progress?', 'Every confidence tag, review schedule and stat goes back to zero. Your subjects, items and chains are kept.', 'Reset progress', true, function () {
      Store.resetProgress();
      App.renderTop(); App.render();
      FX.toast('Progress reset.', '');
    });
  };
  ACTIONS['wipe-all'] = function () {
    Modal.confirm('Erase EVERYTHING?', 'Subjects, chains, progress — all of it, gone from this device.', 'Erase everything', true, function () {
      localStorage.removeItem('anchor_v1');
      location.reload();
    });
  };
})();

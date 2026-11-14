/* ============================================================================
   Anchor · merge.js — three-way merge of two edited copies of one account.

   Why: an account is one JSON document. Two writers (your phone + laptop, or
   a student studying while their tutor adds cards) each start from the same
   saved copy (`base`) and change it. The server refuses a save built on a
   stale copy; the client then merges   base → local   and   base → remote
   so neither side's work is lost, and saves again.

   Rules, in order:
   - Only one side changed something → take that side.
   - Both changed the same object → merge it field by field.
   - Lists of things with ids (subjects, tabs, cards, chains, sentences…) →
     merge item by item; additions from both sides survive; a deletion only
     wins if the other side didn't edit that item meanwhile.
   - Study progress for one card changed on both sides → the most recent
     review wins (whole facet, so FSRS state stays self-consistent).
   - Daily activity counts changed on both sides → the larger count wins.
   - Anything else that truly collides → the local edit wins.
   Key order is irrelevant (Postgres jsonb reorders keys), so equality here
   is structural, never JSON.stringify.
   ========================================================================== */
(function () {
  'use strict';

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  function deq(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!deq(a[i], b[i])) return false;
      return true;
    }
    var ka = Object.keys(a), kb = Object.keys(b);
    var na = 0, nb = 0, k;
    for (k = 0; k < ka.length; k++) if (a[ka[k]] !== undefined) na++;
    for (k = 0; k < kb.length; k++) if (b[kb[k]] !== undefined) nb++;
    if (na !== nb) return false;
    for (k = 0; k < ka.length; k++) {
      if (a[ka[k]] === undefined) continue;
      if (!Object.prototype.hasOwnProperty.call(b, ka[k]) || !deq(a[ka[k]], b[ka[k]])) return false;
    }
    return true;
  }

  function hasIds(arr) {
    if (!Array.isArray(arr)) return false;
    for (var i = 0; i < arr.length; i++) {
      if (!isObj(arr[i]) || typeof arr[i].id !== 'string') return false;
    }
    return true;
  }
  function idArrays(b, l, r) {
    if (!Array.isArray(l) || !Array.isArray(r)) return false;
    if (!l.length && !r.length) return false;
    return hasIds(l) && hasIds(r) && (b === undefined || b === null || hasIds(b));
  }

  /* --- domain-specific resolvers ------------------------------------------ */
  function lastReview(st) {
    if (!isObj(st)) return '';
    var h = Array.isArray(st.hist) && st.hist.length ? st.hist[st.hist.length - 1].t || '' : '';
    var s = st.srs && st.srs.last ? st.srs.last : '';
    return h > s ? h : s;
  }
  function resolve(path, b, l, r) {
    // state.{facetKey} — newest review wins, whole facet
    if (path.length === 2 && path[0] === 'state') {
      if (!isObj(l)) return r;            // deleted (reset) on one side, studied on the other → keep study
      if (!isObj(r)) return l;
      return lastReview(r) > lastReview(l) ? r : l;
    }
    // act.{YYYY-MM-DD} — keep the biggest day
    if (path.length === 2 && path[0] === 'act') {
      if (!isObj(l)) return r;
      if (!isObj(r)) return l;
      return {
        n: Math.max(l.n || 0, r.n || 0), got: Math.max(l.got || 0, r.got || 0),
        miss: Math.max(l.miss || 0, r.miss || 0), greens: Math.max(l.greens || 0, r.greens || 0),
        goalHit: !!(l.goalHit || r.goalHit)
      };
    }
    // meta.milestones — union (celebrations shouldn't replay)
    if (path.length === 2 && path[0] === 'meta' && path[1] === 'milestones') {
      var out = (Array.isArray(l) ? l : []).slice();
      (Array.isArray(r) ? r : []).forEach(function (m) { if (out.indexOf(m) < 0) out.push(m); });
      return out;
    }
    return undefined;
  }

  /* --- generic merge -------------------------------------------------------- */
  function mergeVal(b, l, r, path) {
    if (deq(l, r)) return l;
    if (deq(b, l)) return r;
    if (deq(b, r)) return l;
    var custom = resolve(path, b, l, r);
    if (custom !== undefined) return custom;
    // one side deleted, the other edited → keep the edit
    if (l === undefined) return r;
    if (r === undefined) return l;
    if (isObj(l) && isObj(r)) return mergeObj(isObj(b) ? b : {}, l, r, path);
    if (idArrays(b, l, r)) return mergeIdArray(Array.isArray(b) ? b : [], l, r, path);
    return l;
  }

  function mergeObj(b, l, r, path) {
    var out = {}, seen = {};
    function each(k) {
      if (seen[k]) return;
      seen[k] = true;
      var v = mergeVal(b[k], l[k], r[k], path.concat(k));
      if (v !== undefined) out[k] = v;
    }
    Object.keys(l).forEach(each);
    Object.keys(r).forEach(each);
    Object.keys(b).forEach(each);
    return out;
  }

  function byId(arr) {
    var m = {};
    arr.forEach(function (x) { m[x.id] = x; });
    return m;
  }
  function ids(arr) { return arr.map(function (x) { return x.id; }); }

  function mergeIdArray(b, l, r, path) {
    var bm = byId(b), lm = byId(l), rm = byId(r);
    // ordering: if local kept the base order, adopt the remote order (it may
    // have been re-sorted there); otherwise local's re-ordering wins.
    var lIds = ids(l), rIds = ids(r);
    var bKept = ids(b).filter(function (id) { return lm[id]; });
    var lSameOrder = deq(lIds.filter(function (id) { return bm[id]; }), bKept);
    var primary = lSameOrder ? rIds : lIds, secondary = lSameOrder ? lIds : rIds;
    var order = primary.slice();
    secondary.forEach(function (id, i) {
      if (order.indexOf(id) >= 0) return;
      // insert after the nearest preceding neighbour that exists in `order`
      var at = order.length;
      for (var j = i - 1; j >= 0; j--) {
        var p = order.indexOf(secondary[j]);
        if (p >= 0) { at = p + 1; break; }
      }
      order.splice(at, 0, id);
    });
    Object.keys(bm).forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
    var out = [];
    order.forEach(function (id) {
      var v = mergeVal(bm[id], lm[id], rm[id], path.concat(id));
      if (v !== undefined) out.push(v);
    });
    return out;
  }

  function three(base, local, remote) {
    if (!isObj(remote)) return local;
    if (!isObj(local)) return remote;
    return mergeVal(isObj(base) ? base : {}, local, remote, []);
  }

  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  var api = { three: three, deq: deq, clone: clone };
  if (typeof window !== 'undefined') window.Merge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

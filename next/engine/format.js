/* ══════════════════════════════════════════════════════════════════════════
   JB Finance — engine/format.js
   Money + date formatting helpers. Dual-mode: works in the browser (attaches
   to window.JBF) and in Node (module.exports) so the same code is unit-tested.
   ════════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.JBF = global.JBF || {};
    Object.assign(global.JBF, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {

  /* round2 — currency-safe rounding to 2 decimals.
     Avoids float drift (e.g. 0.1 + 0.2) accumulating across many sums. */
  function round2(n) {
    const v = Number(n) || 0;
    return Math.round((v + Number.EPSILON) * 100) / 100;
  }

  /* sum — float-safe summation of an array via a selector. */
  function sum(arr, sel) {
    const pick = typeof sel === 'function' ? sel : (x) => x;
    return round2((arr || []).reduce((s, x) => s + (Number(pick(x)) || 0), 0));
  }

  const fmt = (n) =>
    Math.abs(round2(n)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtAmt = (n) => '₹' + fmt(n);

  /* Compact Indian formatting: 1.2L, 3.4Cr — for hero/summary tiles. */
  function fmtCompact(n) {
    const a = Math.abs(Number(n) || 0);
    if (a >= 1e7) return '₹' + round2(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + 'Cr';
    if (a >= 1e5) return '₹' + round2(n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + 'L';
    return fmtAmt(n);
  }

  const fmtDate = (d) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  const fmtDateFull = (d) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const fmtTime = (d) =>
    new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return { round2, sum, fmt, fmtAmt, fmtCompact, fmtDate, fmtDateFull, fmtTime };
});

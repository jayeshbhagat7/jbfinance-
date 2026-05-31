/* ══════════════════════════════════════════════════════════════════════════
   JB Finance — engine/site.js
   computeSiteLedger: reproduces the real "TALLY" construction-site imprest sheet
   (per-site, per-handler funds received / spent / closing + category breakdown).
   Computed from BUSINESS EVENTS (Site expenses + Site Transfers), which avoids
   the legacy Site-Cash sign ambiguity. Locked by next/tests/site.test.js using
   the real WWC May-2026 figures. Dual-mode (browser global + Node require).
   ════════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./format.js'));
  } else {
    global.JBF = global.JBF || {};
    Object.assign(global.JBF, factory(global.JBF));
  }
})(typeof self !== 'undefined' ? self : this, function (fmtmod) {

  const round2 = fmtmod.round2;

  /* computeSiteLedger(txns, { site, openings })
       site     : site_name to report on (e.g. 'WWC'); falsy = all site rows
       openings : { [user]: number } per-handler opening balances (optional)

     Convention (matches the user's Tally sheet + the app's double-entry path):
       funds received by a handler  → handler.received  (+)
       handler spends on site       → handler.spent     (−)
       handler returns to financier → handler.given     (−)
       closing = opening + received − spent − given
  */
  function computeSiteLedger(txns, opts) {
    opts = opts || {};
    const site = opts.site;
    const openings = opts.openings || {};

    const rows = (txns || []).filter((t) =>
      t.status !== 'voided' &&
      (t.domain === 'Site' || t.tower === 'SITE') &&
      (!site || t.site_name === site)
    );

    const users = {};
    const U = (name) => {
      const key = name || 'Unassigned';
      if (!users[key]) users[key] = { received: 0, spent: 0, given: 0 };
      return users[key];
    };
    Object.keys(openings).forEach((u) => U(u)); // seed handlers that have an opening

    const categoryTotals = {};
    let totalSpent = 0, totalReceived = 0, totalReturned = 0;

    rows.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'Expense' || t.type === 'UA Expense') {
        U(t.site_user || t.party_name).spent += amt;
        const cat = t.category || 'Misc';
        categoryTotals[cat] = round2((categoryTotals[cat] || 0) + amt);
        totalSpent += amt;
      } else if (t.type === 'Site Transfer') {
        const isReturn = t.direction === 'received' || (!t.direction && t.to_account && !t.from_account);
        if (isReturn) {
          U(t.party_name || t.site_user).given += amt; // returned to financier
          totalReturned += amt;
        } else {
          U(t.party_name || t.site_user).received += amt; // funded to handler
          totalReceived += amt;
        }
      }
    });

    const userList = Object.entries(users).map(([name, d]) => ({
      name,
      opening: round2(openings[name] || 0),
      received: round2(d.received),
      spent: round2(d.spent),
      given: round2(d.given),
      closing: round2((openings[name] || 0) + d.received - d.spent - d.given),
    })).sort((a, b) => a.name.localeCompare(b.name));

    const categories = Object.entries(categoryTotals)
      .map(([category, total]) => ({ category, total: round2(total) }))
      .sort((a, b) => b.total - a.total);

    return {
      site: site || 'ALL',
      totalReceived: round2(totalReceived),
      totalSpent: round2(totalSpent),
      totalReturned: round2(totalReturned),
      categories,
      users: userList,
      netPosition: round2(userList.reduce((s, u) => s + u.closing, 0)),
      txnCount: rows.length,
    };
  }

  /* List distinct site names present in the data. */
  function listSites(txns) {
    const set = new Set();
    (txns || []).forEach((t) => { if ((t.domain === 'Site' || t.tower === 'SITE') && t.site_name) set.add(t.site_name); });
    return Array.from(set).sort();
  }

  return { computeSiteLedger, listSites };
});

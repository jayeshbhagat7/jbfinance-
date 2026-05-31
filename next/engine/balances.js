/* ══════════════════════════════════════════════════════════════════════════
   JB Finance — engine/balances.js
   computeBalances + computeProvisions ported VERBATIM from v2.1 (no behavioural
   change — locked by tests). Adds derived, currency-safe summary helpers:
   computeLiquid, computeTotalCC, computeUdhariOut, computeBooksHealth.
   Dual-mode (browser global + Node require).
   ════════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ledger-master.js'), require('./format.js'));
  } else {
    global.JBF = global.JBF || {};
    Object.assign(global.JBF, factory(global.JBF, global.JBF));
  }
})(typeof self !== 'undefined' ? self : this, function (lm, fmtmod) {

  const PROVISION_VIRTUAL_TYPES = lm.PROVISION_VIRTUAL_TYPES;
  const getLedgerGroup = lm.getLedgerGroup;
  const round2 = fmtmod.round2;

  /* ── computeBalances — Strict Tally Trial Balance Engine (verbatim port) ── */
  function computeBalances(opening, txns, allBanks, allCC) {
    const bal = {};
    Object.entries(opening || {}).forEach(([acc, val]) => {
      bal[acc] = (typeof val === 'object' && val !== null) ? (val.amount || 0) : (val || 0);
    });

    const isTrackedAccount = (name) => {
      if (!name) return false;
      if (allBanks.includes(name) || allCC.includes(name) || name === 'Site Cash') return true;
      if (name.startsWith('Site Cash:')) return true;
      return false;
    };

    const afterOpening = (acc, txnDate) => {
      const lookupKey = (acc && acc.startsWith('Site Cash:')) ? 'Site Cash' : acc;
      const val = opening[lookupKey];
      if (!val || typeof val !== 'object' || !val.opening_date) return true;
      return txnDate >= val.opening_date;
    };

    const applyDr = (acc, amt, txnDate, skipRollup) => {
      if (!isTrackedAccount(acc)) return;
      if (!afterOpening(acc, txnDate)) return;
      bal[acc] = (bal[acc] || 0) + amt;
      if (!skipRollup && acc && acc.startsWith('Site Cash:')) {
        bal['Site Cash'] = (bal['Site Cash'] || 0) + amt;
      }
    };

    const applyCr = (acc, amt, txnDate, skipRollup) => {
      if (!isTrackedAccount(acc)) return;
      if (!afterOpening(acc, txnDate)) return;
      bal[acc] = (bal[acc] || 0) - amt;
      if (!skipRollup && acc && acc.startsWith('Site Cash:')) {
        bal['Site Cash'] = (bal['Site Cash'] || 0) - amt;
      }
    };

    txns.filter((t) => t.status !== 'voided').forEach((t) => {
      const txnDate = (t.created_at || '').slice(0, 10);
      const amt = parseFloat(t.amount) || 0;
      const type = t.type;

      if (PROVISION_VIRTUAL_TYPES.includes(type)) return;

      /* PATH A: new double-entry rows */
      if (t.dr_ledger && t.cr_ledger) {
        const drIsSub = t.dr_ledger.startsWith('Site Cash:');
        const crIsSub = t.cr_ledger.startsWith('Site Cash:');
        const drIsParent = t.dr_ledger === 'Site Cash';
        const crIsParent = t.cr_ledger === 'Site Cash';
        applyDr(t.dr_ledger, amt, txnDate, drIsSub && crIsParent);
        applyCr(t.cr_ledger, amt, txnDate, crIsSub && drIsParent);
        return;
      }

      /* PATH B: legacy rows handled by type */
      const from = t.from_account, to = t.to_account;
      const after = (acc) => afterOpening(acc, txnDate);

      if (type === 'Site Receivable') {
        if (after('Cash')) bal['Cash'] = (bal['Cash'] || 0) + amt;
        return;
      }

      if (type === 'Site Settlement') return;

      if (type === 'Site Transfer') {
        const dir = t.direction;
        const personalAccounts = [...(allBanks || []).filter((b) => b !== 'Site Cash'), ...(allCC || [])];
        const siteName = t.site_name && t.site_name.trim();
        const subKey = siteName ? ('Site Cash:' + siteName) : null;

        const isGiven = dir === 'given' || (!dir && !to && from && from !== 'Site Cash');
        const isReceived = dir === 'received' || (!dir && to);

        if (isGiven) {
          const fromIsPersonal = from && personalAccounts.includes(from);
          const fromIsSiteCash = from === 'Site Cash';
          if (fromIsPersonal && after(from)) {
            bal[from] = (bal[from] || 0) - amt;
            bal['Site Cash'] = (bal['Site Cash'] || 0) - amt;
            if (subKey) bal[subKey] = (bal[subKey] || 0) - amt;
          } else if (fromIsSiteCash) {
            bal['Site Cash'] = (bal['Site Cash'] || 0) - amt;
            if (subKey) bal[subKey] = (bal[subKey] || 0) - amt;
          }
        } else if (isReceived) {
          const toIsPersonal = to && personalAccounts.includes(to);
          const toIsSiteCash = to === 'Site Cash';
          if (toIsPersonal && after(to)) {
            bal[to] = (bal[to] || 0) + amt;
            bal['Site Cash'] = (bal['Site Cash'] || 0) + amt;
            if (subKey) bal[subKey] = (bal[subKey] || 0) + amt;
          } else if (toIsSiteCash) {
            bal['Site Cash'] = (bal['Site Cash'] || 0) + amt;
            if (subKey) bal[subKey] = (bal[subKey] || 0) + amt;
          }
        }
        return;
      }

      if (type === 'Expense' || type === 'UA Expense') {
        if (from && after(from)) bal[from] = (bal[from] || 0) - amt;
        const isSiteTagged = (t.tower === 'SITE' || t.domain === 'Site');
        const pathAHandledSite = t.cr_ledger && (t.cr_ledger === 'Site Cash' || t.cr_ledger.startsWith('Site Cash:'));
        if (isSiteTagged && from && !pathAHandledSite) {
          const siteName = t.site_name && t.site_name.trim();
          const personalAccounts = [...(allBanks || []).filter((b) => b !== 'Site Cash'), ...(allCC || [])];
          if (from === 'Site Cash' || personalAccounts.includes(from)) {
            bal['Site Cash'] = (bal['Site Cash'] || 0) - amt;
            if (siteName) bal['Site Cash:' + siteName] = (bal['Site Cash:' + siteName] || 0) - amt;
          }
        }
        return;
      }

      if (type === 'Income' || type === 'UA Received') {
        if (to && after(to)) bal[to] = (bal[to] || 0) + amt;
        if ((t.tower === 'SITE' || t.domain === 'Site') && to && to !== 'Site Cash') {
          const personalAccounts = [...(allBanks || []).filter((b) => b !== 'Site Cash'), ...(allCC || [])];
          if (personalAccounts.includes(to)) {
            const siteName = t.site_name && t.site_name.trim();
            bal['Site Cash'] = (bal['Site Cash'] || 0) + amt;
            if (siteName) bal['Site Cash:' + siteName] = (bal['Site Cash:' + siteName] || 0) + amt;
          }
        }
        return;
      }

      if (['Bank→Bank', 'Bank→CC', 'Bank→Cash', 'Cash→Bank', 'CC→Bank'].includes(type)) {
        if (from && after(from)) bal[from] = (bal[from] || 0) - amt;
        if (to && after(to)) bal[to] = (bal[to] || 0) + amt;
        if ((t.tower === 'SITE' || t.domain === 'Site') && from && from !== 'Site Cash') {
          const personalAccounts = [...(allBanks || []).filter((b) => b !== 'Site Cash'), ...(allCC || [])];
          if (personalAccounts.includes(from)) {
            const siteName = t.site_name && t.site_name.trim();
            bal['Site Cash'] = (bal['Site Cash'] || 0) - amt;
            if (siteName) bal['Site Cash:' + siteName] = (bal['Site Cash:' + siteName] || 0) - amt;
          }
        }
        return;
      }
    });

    return bal;
  }

  /* ── computeProvisions — Decoupled Virtual Envelope Engine (verbatim port) ── */
  function computeProvisions(recurring, txns) {
    const activeTxns = txns.filter((t) => t.status !== 'voided');
    return recurring.filter((r) => r.is_provision && r.active !== false).map((prov) => {
      const provTxns = activeTxns.filter((t) => PROVISION_VIRTUAL_TYPES.includes(t.type) && (t.category === prov.name || (t.particulars && t.particulars.includes('[ENV:' + prov.id + ']'))));
      const accrues = provTxns.filter((t) => t.type === 'Provision_Accrue').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      const flushes = provTxns.filter((t) => t.type === 'Provision_Flush').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      const borrows = provTxns.filter((t) => t.type === 'Provision_Withdraw').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      const repays = provTxns.filter((t) => t.type === 'Provision_Repay').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      const A = parseFloat(prov.target_amount) || 0;
      const B = Math.max(0, (parseFloat(prov.already_saved) || 0) + accrues - flushes);
      const D = Math.max(0, borrows - repays);
      const C = Math.max(0, B - D);
      const pct = A > 0 ? Math.min(Math.round(C / A * 100), 100) : 0;
      return { prov, A, B, C, D, accrues, flushes, borrows, repays, provTxns, pct };
    });
  }

  /* ── Derived summaries (currency-safe) ── */

  /* Liquid = sum of bank/cash balances, excluding the virtual Site Cash ledger. */
  function computeLiquid(balances, allBanks) {
    return round2((allBanks || [])
      .filter((a) => a !== 'Site Cash')
      .reduce((s, a) => s + (balances[a] || 0), 0));
  }

  /* Total CC outstanding = sum of positive liabilities (stored negative). */
  function computeTotalCC(balances, allCC) {
    return round2((allCC || [])
      .reduce((s, a) => s + Math.max(0, -(balances[a] || 0)), 0));
  }

  /* Net udhari outstanding (given − received). */
  function computeUdhariOut(udhari) {
    const given = (udhari || []).filter((u) => u.direction === 'given').reduce((s, u) => s + (Number(u.amount) || 0), 0);
    const recv = (udhari || []).filter((u) => u.direction === 'received').reduce((s, u) => s + (Number(u.amount) || 0), 0);
    return round2(given - recv);
  }

  /* ── computeBooksHealth — trial-balance / migration health check ──     For every non-voided double-entry row, debit == credit by construction, so
     the books are balanced iff every row carries dr_ledger + cr_ledger. This
     surfaces un-posted (legacy) rows that the balance engine treats heuristically. */
  function computeBooksHealth(txns) {
    let deRows = 0, legacyRows = 0, totalDr = 0, totalCr = 0;
    (txns || []).filter((t) => t.status !== 'voided').forEach((t) => {
      const amt = parseFloat(t.amount) || 0;
      if (t.dr_ledger && t.cr_ledger) {
        deRows++; totalDr += amt; totalCr += amt;
      } else {
        legacyRows++;
      }
    });
    totalDr = round2(totalDr);
    totalCr = round2(totalCr);
    return {
      deRows,
      legacyRows,
      totalDr,
      totalCr,
      diff: round2(totalDr - totalCr),
      balanced: round2(totalDr - totalCr) === 0,
      fullyPosted: legacyRows === 0,
    };
  }

  /* ── computeLedgerGroups — Tally-style position grouped by ledger group ──
     ENHANCEMENT: finally puts the LEDGER_MASTER group/nature taxonomy to work
     (getLedgerGroup previously had no caller). Groups every physical account
     balance by its Tally group, and derives Assets / Liabilities / Net Worth.
     Per-site sub-ledgers ("Site Cash:X") are skipped — they roll up into the
     parent "Site Cash", so counting both would double the figure. */
  function computeLedgerGroups(balances, allBanks, allCC) {
    const groups = {};
    Object.keys(balances || {}).forEach((name) => {
      if (name.startsWith('Site Cash:')) return; // avoid double-count vs parent
      const bal = round2(balances[name] || 0);
      if (bal === 0) return;
      const g = getLedgerGroup(name, allBanks, allCC);
      if (!groups[g.group]) groups[g.group] = { group: g.group, nature: g.nature, accounts: [], total: 0 };
      groups[g.group].accounts.push({ name, balance: bal });
      groups[g.group].total = round2(groups[g.group].total + bal);
    });
    const list = Object.values(groups).sort((a, b) => a.group.localeCompare(b.group));
    const assetTotal = round2(list.filter((g) => g.nature === 'asset').reduce((s, g) => s + g.total, 0));
    const liabilityTotal = round2(list.filter((g) => g.nature === 'liability').reduce((s, g) => s + Math.abs(g.total), 0));
    return { groups: list, assetTotal, liabilityTotal, netWorth: round2(assetTotal - liabilityTotal) };
  }

  return {
    computeBalances,
    computeProvisions,
    computeLiquid,
    computeTotalCC,
    computeUdhariOut,
    computeBooksHealth,
    computeLedgerGroups,
  };
});

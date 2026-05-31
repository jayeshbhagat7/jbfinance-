/* ══════════════════════════════════════════════════════════════════════════
   JB Finance — engine/ledger-master.js
   The Tally double-entry posting engine. LEDGER_MASTER + getLedgerGroup +
   tallyMiddleware are ported VERBATIM from v2.1 (logic unchanged) so postings
   are byte-for-byte identical. Locked by tests/engine.test.js.
   Dual-mode (browser global + Node require).
   ════════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.JBF = global.JBF || {};
    Object.assign(global.JBF, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {

  /* Virtual provision types — these NEVER touch physical balances. */
  const PROVISION_VIRTUAL_TYPES = ['Provision_Accrue', 'Provision_Withdraw', 'Provision_Repay', 'Provision_Flush'];

  const LEDGER_MASTER = {
    /* ── BANK ACCOUNTS ── */
    'Cash': { group: 'Cash-in-Hand', nature: 'asset' },
    'KB': { group: 'Bank Accounts', nature: 'asset' },
    'UB': { group: 'Bank Accounts', nature: 'asset' },
    'YB': { group: 'Bank Accounts', nature: 'asset' },
    'Site Cash': { group: 'Loans & Advances (Asset)', nature: 'asset' },
    'Personal Cash': { group: 'Cash-in-Hand', nature: 'asset' },
    'Site Cash Pool': { group: 'Cash-in-Hand (Site)', nature: 'asset' },

    /* ── CREDIT CARDS ── */
    'SBI CC': { group: 'Credit Card', nature: 'liability' },
    'HDFC CC': { group: 'Credit Card', nature: 'liability' },
    'RBL CC': { group: 'Credit Card', nature: 'liability' },
    'AXIS CC': { group: 'Credit Card', nature: 'liability' },

    /* ── EXPENSE CATEGORIES — Direct ── */
    'Fuel': { group: 'Direct Expenses', nature: 'expense' },
    'Food': { group: 'Direct Expenses', nature: 'expense' },
    'Grocery': { group: 'Direct Expenses', nature: 'expense' },
    'Household': { group: 'Direct Expenses', nature: 'expense' },
    'Electricity': { group: 'Direct Expenses', nature: 'expense' },
    'PNG Gas': { group: 'Direct Expenses', nature: 'expense' },
    'Mobile Recharge': { group: 'Direct Expenses', nature: 'expense' },
    'Child Education': { group: 'Direct Expenses', nature: 'expense' },
    'School Fees': { group: 'Direct Expenses', nature: 'expense' },
    'Tuition': { group: 'Direct Expenses', nature: 'expense' },
    'Mediclaim': { group: 'Direct Expenses', nature: 'expense' },
    'Society Maintenance': { group: 'Direct Expenses', nature: 'expense' },

    /* ── EXPENSE CATEGORIES — Indirect ── */
    'Insurance': { group: 'Indirect Expenses', nature: 'expense' },
    'LIC Premium': { group: 'Indirect Expenses', nature: 'expense' },
    'Term Insurance': { group: 'Indirect Expenses', nature: 'expense' },
    'Car Insurance': { group: 'Indirect Expenses', nature: 'expense' },
    'Nexon Insurance': { group: 'Indirect Expenses', nature: 'expense' },
    'Nexon EMI': { group: 'Indirect Expenses', nature: 'expense' },
    'Nexon Fuel': { group: 'Indirect Expenses', nature: 'expense' },
    'Nexon Service': { group: 'Indirect Expenses', nature: 'expense' },
    'Nexon Misc': { group: 'Indirect Expenses', nature: 'expense' },
    'Car Nexon': { group: 'Indirect Expenses', nature: 'expense' },
    'Maintenance': { group: 'Indirect Expenses', nature: 'expense' },
    'Travelling': { group: 'Indirect Expenses', nature: 'expense' },
    'Lifestyle': { group: 'Indirect Expenses', nature: 'expense' },
    'Social': { group: 'Indirect Expenses', nature: 'expense' },
    'Donation': { group: 'Indirect Expenses', nature: 'expense' },
    'Investment': { group: 'Indirect Expenses', nature: 'expense' },
    'Zerodha': { group: 'Indirect Expenses', nature: 'expense' },
    'SGB Gold': { group: 'Indirect Expenses', nature: 'expense' },
    'Misc': { group: 'Indirect Expenses', nature: 'expense' },
    'Suspense (Uncategorized)': { group: 'Suspense Account', nature: 'expense' },
    'UA Expense': { group: 'Direct Expenses', nature: 'expense' },

    /* Udhari — asset when given, liability when received */
    'UDHARI': { group: 'Loans & Advances (Asset)', nature: 'asset' },

    /* ── INCOME CATEGORIES ── */
    'Salary': { group: 'Direct Income', nature: 'income' },
    'LPG Collection': { group: 'Direct Income', nature: 'income' },
    'UA Received': { group: 'Direct Income', nature: 'income' },
    'Rental Income': { group: 'Indirect Income', nature: 'income' },
    'Dividend': { group: 'Indirect Income', nature: 'income' },
    'Interest': { group: 'Indirect Income', nature: 'income' },
    'Rewards / Cashback': { group: 'Indirect Income', nature: 'income' },
    'UDHARI Return': { group: 'Loans & Advances (Asset)', nature: 'asset' },
    'Other Income': { group: 'Indirect Income', nature: 'income' },
  };

  /* getLedgerGroup — resolve ledger group for any account/category. */
  function getLedgerGroup(name, allBanks, allCC) {
    if (LEDGER_MASTER[name]) return LEDGER_MASTER[name];
    if (name && name.startsWith('Site Cash:')) return { group: 'Loans & Advances (Asset)', nature: 'asset' };
    if (allBanks && allBanks.includes(name)) {
      return name === 'Cash' ? { group: 'Cash-in-Hand', nature: 'asset' }
                             : { group: 'Bank Accounts', nature: 'asset' };
    }
    if (allCC && allCC.includes(name)) return { group: 'Credit Card', nature: 'liability' };
    return { group: 'Indirect Expenses', nature: 'expense' }; // safe fallback
  }

  /* tallyMiddleware — resolve dr_ledger + cr_ledger from a UI payload.
     Ported verbatim from v2.1. */
  function tallyMiddleware(payload, allBanks, allCC) {
    const { type, category, from_account, to_account, domain, site_name, tower } = payload;

    const siteLedger = (site_name && site_name.trim())
      ? ('Site Cash:' + site_name.trim())
      : 'Site Cash';

    switch (type) {
      case 'Expense':
      case 'UA Expense':
        return { dr_ledger: category || 'Indirect Expenses', cr_ledger: from_account || 'Cash' };

      case 'Income':
      case 'UA Received':
        return { dr_ledger: to_account || 'Cash', cr_ledger: category || 'Other Income' };

      case 'Bank→Bank':
      case 'Bank→Cash':
      case 'Cash→Bank':
        return { dr_ledger: to_account, cr_ledger: from_account };

      case 'Bank→CC':
        return { dr_ledger: to_account, cr_ledger: from_account };

      case 'CC→Bank':
        return { dr_ledger: to_account, cr_ledger: from_account };

      case 'Site Transfer': {
        const from = from_account || '';
        const to = to_account || '';
        if (payload.direction === 'given') {
          return { dr_ledger: siteLedger, cr_ledger: from || 'Cash' };
        }
        if (payload.direction === 'received') {
          return { dr_ledger: to || 'Cash', cr_ledger: siteLedger };
        }
        const fromIsPersonalBank = from && from !== 'Site Cash' && allBanks && allBanks.includes(from);
        const fromIsCC = from && allCC && allCC.includes(from);
        const fromIsCash = from === 'Cash';
        const toIsPersonalBank = to && to !== 'Site Cash' && allBanks && allBanks.includes(to);
        if (fromIsPersonalBank || fromIsCC || fromIsCash) {
          return { dr_ledger: siteLedger, cr_ledger: from };
        } else if (toIsPersonalBank || to === 'Cash' || to === 'Site Cash') {
          return { dr_ledger: to || 'Cash', cr_ledger: siteLedger };
        } else {
          return { dr_ledger: siteLedger, cr_ledger: from || 'Cash' };
        }
      }

      case 'Udhari': {
        const isGiven = (category || '').toLowerCase() === 'given' || from_account;
        return isGiven
          ? { dr_ledger: 'UDHARI', cr_ledger: from_account || 'Cash' }
          : { dr_ledger: to_account || 'Cash', cr_ledger: 'UDHARI' };
      }

      case 'Provision_Accrue':
        return { dr_ledger: 'Provision Fund — ' + (category || 'General'), cr_ledger: from_account || 'Cash' };

      case 'Provision_Flush':
        return { dr_ledger: category || 'Indirect Expenses', cr_ledger: 'Provision Fund — ' + (category || 'General') };

      case 'Provision_Withdraw':
        return { dr_ledger: category || 'Indirect Expenses', cr_ledger: 'Provision Fund — ' + (category || 'General') };

      case 'Provision_Repay':
        return { dr_ledger: 'Provision Fund — ' + (category || 'General'), cr_ledger: from_account || 'Cash' };

      default:
        return {
          dr_ledger: category || from_account || 'Suspense Account',
          cr_ledger: from_account || to_account || 'Cash',
        };
    }
  }

  return { PROVISION_VIRTUAL_TYPES, LEDGER_MASTER, getLedgerGroup, tallyMiddleware };
});

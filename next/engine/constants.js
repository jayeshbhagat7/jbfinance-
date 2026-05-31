/* ══════════════════════════════════════════════════════════════════════════
   JB Finance — engine/constants.js
   Seed accounts + category taxonomy. Ported verbatim from the v2.1 app so the
   chart of accounts is identical. Dual-mode (browser global + Node require).
   ════════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.JBF = global.JBF || {};
    Object.assign(global.JBF, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const SEED_BANKS = ['Cash', 'KB', 'UB', 'YB'];
  const SEED_CC = ['SBI CC', 'HDFC CC', 'RBL CC', 'AXIS CC'];

  const CATEGORIES = [
    { id: 'Fuel', emoji: '⛽', color: 'amber', parent: null }, { id: 'Food', emoji: '🍱', color: 'green', parent: null },
    { id: 'Household', emoji: '🏠', color: 'blue', parent: null }, { id: 'Grocery', emoji: '🛒', color: 'blue', parent: 'Household' },
    { id: 'Electricity', emoji: '💡', color: 'blue', parent: 'Household' }, { id: 'PNG Gas', emoji: '🔥', color: 'blue', parent: 'Household' },
    { id: 'Child Education', emoji: '📚', color: 'blue', parent: null }, { id: 'School Fees', emoji: '🎒', color: 'blue', parent: 'Child Education' },
    { id: 'Tuition', emoji: '✏️', color: 'blue', parent: 'Child Education' },
    { id: 'Insurance', emoji: '🛡', color: 'green', parent: null, it: '80C' }, { id: 'LIC Premium', emoji: '🛡', color: 'green', parent: 'Insurance', it: '80C' },
    { id: 'Term Insurance', emoji: '🛡', color: 'green', parent: 'Insurance', it: '80C' }, { id: 'Car Insurance', emoji: '🚗', color: 'green', parent: 'Insurance', it: '80C' },
    { id: 'Mediclaim', emoji: '💊', color: 'green', parent: null, it: '80D' },
    { id: 'Investment', emoji: '📈', color: 'green', parent: null }, { id: 'Zerodha', emoji: '📈', color: 'green', parent: 'Investment' }, { id: 'SGB Gold', emoji: '🥇', color: 'green', parent: 'Investment' },
    { id: 'Maintenance', emoji: '🔧', color: 'amber', parent: null }, { id: 'Car Nexon', emoji: '🚙', color: 'amber', parent: null },
    { id: 'Nexon Fuel', emoji: '⛽', color: 'amber', parent: 'Car Nexon' }, { id: 'Nexon Service', emoji: '🔧', color: 'amber', parent: 'Car Nexon' },
    { id: 'Nexon EMI', emoji: '🚙', color: 'amber', parent: 'Car Nexon' }, { id: 'Nexon Insurance', emoji: '🛡', color: 'amber', parent: 'Car Nexon', it: '80C' },
    { id: 'Nexon Misc', emoji: '🚙', color: 'amber', parent: 'Car Nexon' }, { id: 'Travelling', emoji: '🚗', color: 'amber', parent: null },
    { id: 'Lifestyle', emoji: '🛍', color: 'red', parent: null }, { id: 'Social', emoji: '🤝', color: 'amber', parent: null },
    { id: 'Donation', emoji: '🙏', color: 'green', parent: null, it: '80G' }, { id: 'Mobile Recharge', emoji: '📱', color: 'blue', parent: null },
    { id: 'UDHARI', emoji: '↗', color: 'amber', parent: null }, { id: 'Society Maintenance', emoji: '🏘', color: 'amber', parent: null },
    { id: 'UA Expense', emoji: '🏗', color: 'amber', parent: null, ua: true }, { id: 'Misc', emoji: '•', color: 'none', parent: null },
    { id: 'Suspense (Uncategorized)', emoji: '🔍', color: 'amber', parent: null },
  ];

  const INCOME_CATEGORIES = [
    { id: 'Salary', emoji: '💼', color: 'green', parent: null },
    { id: 'Dividend', emoji: '📊', color: 'green', parent: null },
    { id: 'Interest', emoji: '🏦', color: 'green', parent: null },
    { id: 'UDHARI Return', emoji: '↩', color: 'amber', parent: null },
    { id: 'LPG Collection', emoji: '🔴', color: 'amber', parent: null },
    { id: 'Rewards / Cashback', emoji: '🎁', color: 'green', parent: null },
    { id: 'UA Received', emoji: '🏗', color: 'amber', parent: null },
    { id: 'Rental Income', emoji: '🏠', color: 'green', parent: null },
    { id: 'Other Income', emoji: '💰', color: 'green', parent: null },
  ];

  return { SEED_BANKS, SEED_CC, CATEGORIES, INCOME_CATEGORIES };
});

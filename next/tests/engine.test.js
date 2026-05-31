/* ══════════════════════════════════════════════════════════════════════════
   JB Finance — engine unit tests (node --test, zero dependencies)
   Locks the ported double-entry engine so the revamp cannot silently change
   how money is posted or balances are derived.
       Run:  node --test next/tests/
   ════════════════════════════════════════════════════════════════════════════ */
const test = require('node:test');
const assert = require('node:assert/strict');

const { tallyMiddleware, getLedgerGroup, LEDGER_MASTER } = require('../engine/ledger-master.js');
const {
  computeBalances, computeProvisions,
  computeLiquid, computeTotalCC, computeUdhariOut, computeBooksHealth, computeLedgerGroups,
} = require('../engine/balances.js');
const { round2, sum, fmt, fmtAmt } = require('../engine/format.js');

const BANKS = ['Cash', 'KB', 'UB', 'YB'];
const CC = ['SBI CC', 'HDFC CC', 'RBL CC', 'AXIS CC'];
const D = (s) => s + 'T06:30:00.000Z'; // helper: a dated created_at

/* ─────────────────────────── format ─────────────────────────── */
test('round2 eliminates float drift', () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2('not a number'), 0);
});

test('sum is float-safe with a selector', () => {
  assert.equal(sum([{ a: 0.1 }, { a: 0.2 }], (x) => x.a), 0.3);
  assert.equal(sum([1, 2, 3]), 6);
});

test('fmt / fmtAmt format Indian currency, absolute value', () => {
  assert.equal(fmt(-1234.5), '1,234.50');
  assert.equal(fmtAmt(1000), '₹1,000.00');
});

/* ─────────────────────── tallyMiddleware ─────────────────────── */
test('tallyMiddleware: Expense → Dr category, Cr source', () => {
  const de = tallyMiddleware({ type: 'Expense', category: 'Fuel', from_account: 'KB' }, BANKS, CC);
  assert.deepEqual(de, { dr_ledger: 'Fuel', cr_ledger: 'KB' });
});

test('tallyMiddleware: Income → Dr account, Cr income head', () => {
  const de = tallyMiddleware({ type: 'Income', category: 'Salary', to_account: 'UB' }, BANKS, CC);
  assert.deepEqual(de, { dr_ledger: 'UB', cr_ledger: 'Salary' });
});

test('tallyMiddleware: Bank→CC pays card (Dr CC, Cr Bank)', () => {
  const de = tallyMiddleware({ type: 'Bank→CC', from_account: 'KB', to_account: 'SBI CC' }, BANKS, CC);
  assert.deepEqual(de, { dr_ledger: 'SBI CC', cr_ledger: 'KB' });
});

test('tallyMiddleware: Site Transfer given/received uses site sub-ledger', () => {
  const given = tallyMiddleware({ type: 'Site Transfer', direction: 'given', from_account: 'KB', site_name: 'D5' }, BANKS, CC);
  assert.deepEqual(given, { dr_ledger: 'Site Cash:D5', cr_ledger: 'KB' });
  const recv = tallyMiddleware({ type: 'Site Transfer', direction: 'received', to_account: 'UB', site_name: 'D5' }, BANKS, CC);
  assert.deepEqual(recv, { dr_ledger: 'UB', cr_ledger: 'Site Cash:D5' });
});

test('tallyMiddleware: Site Transfer legacy (no direction) infers from accounts', () => {
  const legacy = tallyMiddleware({ type: 'Site Transfer', from_account: 'KB' }, BANKS, CC);
  assert.deepEqual(legacy, { dr_ledger: 'Site Cash', cr_ledger: 'KB' });
});

test('tallyMiddleware: Udhari given vs received', () => {
  assert.deepEqual(
    tallyMiddleware({ type: 'Udhari', from_account: 'Cash' }, BANKS, CC),
    { dr_ledger: 'UDHARI', cr_ledger: 'Cash' });
  assert.deepEqual(
    tallyMiddleware({ type: 'Udhari', category: 'received', to_account: 'KB' }, BANKS, CC),
    { dr_ledger: 'KB', cr_ledger: 'UDHARI' });
});

test('tallyMiddleware: provision envelope postings', () => {
  assert.deepEqual(
    tallyMiddleware({ type: 'Provision_Accrue', category: 'Emergency', from_account: 'KB' }, BANKS, CC),
    { dr_ledger: 'Provision Fund — Emergency', cr_ledger: 'KB' });
  assert.deepEqual(
    tallyMiddleware({ type: 'Provision_Flush', category: 'Emergency' }, BANKS, CC),
    { dr_ledger: 'Emergency', cr_ledger: 'Provision Fund — Emergency' });
});

test('tallyMiddleware: unknown type falls back to suspense-ish', () => {
  const de = tallyMiddleware({ type: 'Weird', from_account: 'KB' }, BANKS, CC);
  assert.equal(de.cr_ledger, 'KB');
});

/* ─────────────────────── getLedgerGroup ─────────────────────── */
test('getLedgerGroup resolves master, sub-ledger, custom + fallback', () => {
  assert.equal(getLedgerGroup('SBI CC', BANKS, CC).nature, 'liability');
  assert.equal(getLedgerGroup('Site Cash:D7', BANKS, CC).group, 'Loans & Advances (Asset)');
  assert.deepEqual(getLedgerGroup('MyBank', ['MyBank'], CC), { group: 'Bank Accounts', nature: 'asset' });
  assert.equal(getLedgerGroup('Totally Unknown', BANKS, CC).group, 'Indirect Expenses');
});

/* ─────────────────────── computeBalances ─────────────────────── */
test('computeBalances seeds opening balances (number + object form)', () => {
  const bal = computeBalances({ KB: 1000, UB: { amount: 500, opening_date: '2025-01-01' } }, [], BANKS, CC);
  assert.equal(bal.KB, 1000);
  assert.equal(bal.UB, 500);
});

test('computeBalances: DE expense reduces bank, voided ignored', () => {
  const txns = [
    { type: 'Expense', amount: 200, dr_ledger: 'Fuel', cr_ledger: 'KB', created_at: D('2025-02-01'), status: 'complete' },
    { type: 'Expense', amount: 999, dr_ledger: 'Fuel', cr_ledger: 'KB', created_at: D('2025-02-02'), status: 'voided' },
  ];
  const bal = computeBalances({ KB: 1000 }, txns, BANKS, CC);
  assert.equal(bal.KB, 800);
});

test('computeBalances: CC liability is stored negative; payment reduces it', () => {
  const spend = [{ type: 'Expense', amount: 500, dr_ledger: 'Food', cr_ledger: 'SBI CC', created_at: D('2025-02-01') }];
  let bal = computeBalances({}, spend, BANKS, CC);
  assert.equal(bal['SBI CC'], -500);
  const pay = [{ type: 'Bank→CC', amount: 300, dr_ledger: 'SBI CC', cr_ledger: 'KB', created_at: D('2025-02-03') }];
  bal = computeBalances({ KB: 1000, 'SBI CC': -500 }, pay, BANKS, CC);
  assert.equal(bal['SBI CC'], -200);
  assert.equal(bal.KB, 700);
});

test('computeBalances: opening_date guard excludes earlier txns', () => {
  const txns = [
    { type: 'Expense', amount: 100, dr_ledger: 'Fuel', cr_ledger: 'KB', created_at: D('2024-12-31') },
    { type: 'Expense', amount: 100, dr_ledger: 'Fuel', cr_ledger: 'KB', created_at: D('2025-01-15') },
  ];
  const bal = computeBalances({ KB: { amount: 1000, opening_date: '2025-01-01' } }, txns, BANKS, CC);
  assert.equal(bal.KB, 900); // only the 2025-01-15 txn counts
});

test('computeBalances: virtual provision types never move cash', () => {
  const txns = [{ type: 'Provision_Accrue', amount: 5000, dr_ledger: 'Provision Fund — X', cr_ledger: 'KB', created_at: D('2025-02-01') }];
  const bal = computeBalances({ KB: 1000 }, txns, BANKS, CC);
  assert.equal(bal.KB, 1000);
});

test('computeBalances: site sub-ledger rolls up into Site Cash parent', () => {
  const txns = [{ type: 'Site Transfer', direction: 'given', amount: 1000, dr_ledger: 'Site Cash:D5', cr_ledger: 'KB', site_name: 'D5', created_at: D('2025-02-01') }];
  const bal = computeBalances({ KB: 5000 }, txns, BANKS, CC);
  assert.equal(bal.KB, 4000);
  assert.equal(bal['Site Cash:D5'], 1000);
  assert.equal(bal['Site Cash'], 1000); // rolled up
});

test('computeBalances: legacy site transfer (no DE fields) given from bank', () => {
  const txns = [{ type: 'Site Transfer', direction: 'given', amount: 800, from_account: 'KB', site_name: 'D5', created_at: D('2025-02-01') }];
  const bal = computeBalances({ KB: 5000 }, txns, BANKS, CC);
  assert.equal(bal.KB, 4200);
  assert.equal(bal['Site Cash'], -800); // negative = site owes you
});

/* ─────────────────────── computeProvisions ─────────────────────── */
test('computeProvisions: A/B/C/D + pct math', () => {
  const recurring = [{ id: 'p1', name: 'Emergency', is_provision: true, active: true, target_amount: 10000, already_saved: 2000 }];
  const txns = [
    { type: 'Provision_Accrue', amount: 3000, category: 'Emergency', particulars: '[ENV:p1] x' },
    { type: 'Provision_Flush', amount: 1000, category: 'Emergency', particulars: '[ENV:p1] y' },
    { type: 'Provision_Withdraw', amount: 500, category: 'Emergency', particulars: '[ENV:p1] z' },
  ];
  const [ps] = computeProvisions(recurring, txns);
  assert.equal(ps.A, 10000);
  assert.equal(ps.B, 4000); // 2000 + 3000 - 1000
  assert.equal(ps.D, 500);  // 500 - 0
  assert.equal(ps.C, 3500); // 4000 - 500
  assert.equal(ps.pct, 35);
});

/* ─────────────────────── derived summaries ─────────────────────── */
test('computeLiquid excludes Site Cash; computeTotalCC sums positive liabilities', () => {
  const balances = { Cash: 1000, KB: 2000.005, UB: 500, 'Site Cash': -3000, 'SBI CC': -1500, 'HDFC CC': 200 };
  assert.equal(computeLiquid(balances, [...BANKS, 'Site Cash']), 3500.01);
  assert.equal(computeTotalCC(balances, CC), 1500); // HDFC positive => not a liability
});

test('computeUdhariOut nets given − received', () => {
  const udhari = [
    { direction: 'given', amount: 1000 }, { direction: 'given', amount: 500 },
    { direction: 'received', amount: 300 },
  ];
  assert.equal(computeUdhariOut(udhari), 1200);
});

test('computeBooksHealth: balanced when fully double-entry posted', () => {
  const txns = [
    { type: 'Expense', amount: 100, dr_ledger: 'Fuel', cr_ledger: 'KB' },
    { type: 'Income', amount: 50, dr_ledger: 'KB', cr_ledger: 'Salary' },
    { type: 'Expense', amount: 999, dr_ledger: 'X', cr_ledger: 'Y', status: 'voided' },
  ];
  const h = computeBooksHealth(txns);
  assert.equal(h.deRows, 2);
  assert.equal(h.legacyRows, 0);
  assert.equal(h.balanced, true);
  assert.equal(h.fullyPosted, true);
  assert.equal(h.totalDr, h.totalCr);
});

test('computeBooksHealth: flags legacy (un-posted) rows', () => {
  const txns = [
    { type: 'Expense', amount: 100, dr_ledger: 'Fuel', cr_ledger: 'KB' },
    { type: 'Expense', amount: 70, from_account: 'KB' }, // legacy, no DE fields
  ];
  const h = computeBooksHealth(txns);
  assert.equal(h.deRows, 1);
  assert.equal(h.legacyRows, 1);
  assert.equal(h.fullyPosted, false);
});

/* ───────── computeLedgerGroups (Tally taxonomy enhancement) ───────── */
test('computeLedgerGroups: groups by Tally group, derives net worth', () => {
  const balances = {
    Cash: 1000, KB: 4000, UB: 2000,
    'Site Cash': -3000, 'Site Cash:D5': -3000, // sub-ledger must NOT double-count
    'SBI CC': -1500,
  };
  const r = computeLedgerGroups(balances, [...BANKS, 'Site Cash'], CC);
  const byGroup = Object.fromEntries(r.groups.map((g) => [g.group, g]));
  assert.equal(byGroup['Bank Accounts'].total, 6000);   // KB + UB
  assert.equal(byGroup['Cash-in-Hand'].total, 1000);    // Cash
  assert.equal(byGroup['Loans & Advances (Asset)'].total, -3000); // Site Cash parent only
  assert.equal(byGroup['Credit Card'].nature, 'liability');
  // Assets = 6000 + 1000 + (-3000) = 4000 ; Liabilities = 1500 ; Net = 2500
  assert.equal(r.assetTotal, 4000);
  assert.equal(r.liabilityTotal, 1500);
  assert.equal(r.netWorth, 2500);
});

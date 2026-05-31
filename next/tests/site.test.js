/* ══════════════════════════════════════════════════════════════════════════
   Golden test: computeSiteLedger reproduces the REAL WWC May-2026 Tally sheet.
   These numbers come straight from the user's spreadsheet — if the engine ever
   drifts from how the business actually accounts, this test fails.
   ════════════════════════════════════════════════════════════════════════════ */
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSiteLedger, listSites } = require('../engine/site.js');

/* Validated category totals (sum = 140,878) */
const CATS = {
  KHARCHI: 109490, Travelling: 9630, Misc: 8134, Medical: 6455,
  Hardware: 2756, Fuel: 1950, Stationary: 1482, Food: 981,
};
const OPENINGS = { JAYESH: -66092, SIKHU: 2191, PP: 602, MILTON: 609 };

function buildWWC() {
  const txns = [];
  // Funding received by Jayesh: 145,000 from PH + 450 from Sohail = 145,450
  txns.push({ type: 'Site Transfer', direction: 'given', amount: 145000, party_name: 'JAYESH', site_name: 'WWC', domain: 'Site', from_account: 'Cash' });
  txns.push({ type: 'Site Transfer', direction: 'given', amount: 450, party_name: 'JAYESH', site_name: 'WWC', domain: 'Site', from_account: 'Cash' });
  // One expense row per category (engine sums regardless of row count)
  Object.entries(CATS).forEach(([category, amount]) =>
    txns.push({ type: 'Expense', amount, category, site_user: 'JAYESH', site_name: 'WWC', domain: 'Site', from_account: 'Site Cash' }));
  // Noise that must be ignored
  txns.push({ type: 'Expense', amount: 99999, category: 'KHARCHI', site_user: 'JAYESH', site_name: 'WWC', domain: 'Site', status: 'voided' });
  txns.push({ type: 'Expense', amount: 5000, category: 'Food', site_name: 'OTHER', domain: 'Site' });
  txns.push({ type: 'Expense', amount: 250, category: 'Fuel', from_account: 'KB', domain: 'Personal' });
  return txns;
}

test('site ledger: totals match the real sheet (received 145,450 / spent 140,878)', () => {
  const r = computeSiteLedger(buildWWC(), { site: 'WWC', openings: OPENINGS });
  assert.equal(r.totalReceived, 145450);
  assert.equal(r.totalSpent, 140878);
});

test('site ledger: category breakdown matches, KHARCHI is the largest head', () => {
  const r = computeSiteLedger(buildWWC(), { site: 'WWC', openings: OPENINGS });
  const map = Object.fromEntries(r.categories.map((c) => [c.category, c.total]));
  for (const [cat, amt] of Object.entries(CATS)) assert.equal(map[cat], amt, cat);
  assert.equal(r.categories[0].category, 'KHARCHI');
  assert.equal(r.categories.reduce((s, c) => s + c.total, 0), 140878);
});

test('site ledger: per-handler closing balances reproduce the sheet', () => {
  const r = computeSiteLedger(buildWWC(), { site: 'WWC', openings: OPENINGS });
  const u = Object.fromEntries(r.users.map((x) => [x.name, x]));
  assert.equal(u.JAYESH.received, 145450);
  assert.equal(u.JAYESH.spent, 140878);
  assert.equal(u.JAYESH.closing, -61520);   // -66092 + 145450 - 140878
  assert.equal(u.SIKHU.closing, 2191);
  assert.equal(u.PP.closing, 602);
  assert.equal(u.MILTON.closing, 609);
});

test('site ledger: net position equals the sheet balance (-58,118)', () => {
  const r = computeSiteLedger(buildWWC(), { site: 'WWC', openings: OPENINGS });
  assert.equal(r.netPosition, -58118);
});

test('site ledger: a returned transfer reduces the handler closing', () => {
  const txns = [
    { type: 'Site Transfer', direction: 'given', amount: 1000, party_name: 'PP', site_name: 'WWC', domain: 'Site' },
    { type: 'Site Transfer', direction: 'received', amount: 400, party_name: 'PP', site_name: 'WWC', domain: 'Site' },
  ];
  const r = computeSiteLedger(txns, { site: 'WWC', openings: { PP: 0 } });
  const pp = r.users.find((x) => x.name === 'PP');
  assert.equal(pp.received, 1000);
  assert.equal(pp.given, 400);
  assert.equal(pp.closing, 600);
});

test('listSites returns distinct site names', () => {
  assert.deepEqual(listSites(buildWWC()), ['OTHER', 'WWC']);
});

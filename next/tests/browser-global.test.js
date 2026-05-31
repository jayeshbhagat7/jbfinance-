/* Verifies the engine's BROWSER path (UMD else-branch attaching to a global)
   — the exact mechanism next/index.html relies on — by running the plain
   <script> files in a vm sandbox that has `self` but no CommonJS `module`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserEngine() {
  const dir = path.join(__dirname, '..', 'engine');
  const files = ['format.js', 'constants.js', 'ledger-master.js', 'balances.js'];
  const sandbox = {};
  sandbox.self = sandbox;            // browser-like global
  sandbox.window = sandbox;          // not used, but realistic
  const ctx = vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(dir, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return sandbox.JBF;
}

test('engine assembles on a browser global (window.JBF) in load order', () => {
  const JBF = loadBrowserEngine();
  for (const fn of ['tallyMiddleware', 'computeBalances', 'computeProvisions', 'computeLiquid', 'computeLedgerGroups', 'computeBooksHealth', 'fmtAmt', 'round2', 'SEED_BANKS', 'CATEGORIES']) {
    assert.ok(JBF[fn] !== undefined, 'missing JBF.' + fn);
  }
});

test('browser-global engine computes a real balance end-to-end', () => {
  const JBF = loadBrowserEngine();
  const txns = [{ type: 'Expense', amount: 250, dr_ledger: 'Fuel', cr_ledger: 'KB', created_at: '2025-02-01T06:30:00.000Z' }];
  const bal = JBF.computeBalances({ KB: 1000 }, txns, JBF.SEED_BANKS, JBF.SEED_CC);
  assert.equal(bal.KB, 750);
  assert.equal(JBF.fmtAmt(750), '₹750.00');
});

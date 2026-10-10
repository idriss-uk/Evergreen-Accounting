'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');

function loadIntegrity() {
  const sandbox = { crypto: webcrypto, TextEncoder, Date, console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const source = fs.readFileSync(path.join(__dirname, '../js/core/integrity.js'), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: 'integrity.js' });
  return sandbox;
}

function sample() {
  return {
    invoices: [{ id: 'I1', type: 'Invoice', totalNet: 100, totalVat: 20, totalGross: 120 }],
    bills: [],
    expenses: [{
      id: 'E1', merchant: 'Shop', date: '2026-10-10', netAmount: 20,
      vatAmount: 4, grossAmount: 24, attachment: 'data:image/png;base64,AAAA'
    }],
    payments: [],
    bankTransactions: [],
    customers: [],
    suppliers: [],
    vatReturns: [],
    cisRecords: [],
    ledgerEntries: []
  };
}

test('checksum-protected backup round-trips all records and receipt attachments', async () => {
  const integrity = loadIntegrity().EvergreenIntegrity;
  const original = sample();
  const backup = await integrity.createBackup(original);
  assert.equal(backup.format, 'evergreen-accounting-backup');
  assert.match(backup.checksum, /^[0-9a-f]{64}$/);
  const restored = await integrity.readBackup(JSON.stringify(backup, null, 2));
  assert.equal(restored.verified, true);
  assert.equal(restored.legacy, false);
  assert.equal(JSON.stringify(restored.state), JSON.stringify(original));
  assert.equal(restored.state.expenses[0].attachment, original.expenses[0].attachment);
});

test('backup modification and corrupt checksums are rejected before restore', async () => {
  const integrity = loadIntegrity().EvergreenIntegrity;
  const backup = await integrity.createBackup(sample());
  backup.state.invoices[0].totalGross = 888;
  await assert.rejects(integrity.readBackup(JSON.stringify(backup)), /checksum/i);
});

test('legacy backups remain readable but are clearly unverified', async () => {
  const integrity = loadIntegrity().EvergreenIntegrity;
  const restored = await integrity.readBackup(JSON.stringify(sample()));
  assert.equal(restored.verified, false);
  assert.equal(restored.legacy, true);
});

test('incomplete backups referencing missing receipts are rejected', async () => {
  const integrity = loadIntegrity().EvergreenIntegrity;
  const broken = sample();
  broken.expenses[0].attachment = null;
  broken.expenses[0].attachmentRef = 'expense:E1';
  await assert.rejects(integrity.readBackup(JSON.stringify(broken)), /receipt/i);
  await assert.rejects(integrity.createBackup(broken), /receipt/i);
});

test('accounting health detects duplicate IDs, monetary mismatches and unbalanced journals', () => {
  const integrity = loadIntegrity().EvergreenIntegrity;
  const broken = sample();
  broken.invoices.push({ id: 'I1', type: 'Invoice', totalNet: 100, totalVat: 10, totalGross: 120 });
  broken.ledgerEntries.push({ id: 'J1', lines: [
    { account: '4000 Sales', debit: 0, credit: 50 },
    { account: '1100 Debtors', debit: 40, credit: 0 }
  ] });
  const result = integrity.audit(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errorCount >= 2);
  assert.ok(result.warningCount >= 1);
  assert.ok(result.issues.some(issue => issue.code === 'unbalanced-journal'));
  assert.ok(result.issues.some(issue => issue.code === 'duplicate-id'));
});

test('trial balance and balance sheet diagnostics do not mutate business state', () => {
  const ctx = loadIntegrity();
  ctx.EvergreenReports = {
    trialBalance: () => ({ totalDebit: 100, totalCredit: 99 }),
    balanceSheet: () => ({ difference: 1 })
  };
  const state = sample();
  const before = JSON.stringify(state);
  const report = ctx.EvergreenIntegrity.audit(state);
  assert.ok(report.issues.some(issue => issue.code === 'trial-balance-mismatch'));
  assert.ok(report.issues.some(issue => issue.code === 'balance-sheet-mismatch'));
  assert.equal(JSON.stringify(state), before);
});

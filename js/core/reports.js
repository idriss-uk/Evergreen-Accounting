(() => {
  'use strict';

  const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const isoDate = (value) => String(value || '').slice(0, 10);

  function inRange(date, from, to) {
    const value = isoDate(date);
    if (!value) return false;
    return (!from || value >= from) && (!to || value <= to);
  }

  function key(type, id) {
    return `${type || ''}::${id || ''}`;
  }

  function buildCanonicalLedger(state) {
    const ledger = window.EvergreenLedger;
    if (!ledger) throw new Error('Evergreen ledger engine is unavailable');

    const entries = (state.ledgerEntries || []).map((entry) => JSON.parse(JSON.stringify(entry)));
    const covered = new Set(entries.map((entry) => key(entry.sourceType, entry.sourceId)));

    const addDocument = (type, doc) => {
      const sourceKey = key(type, doc.id);
      if (covered.has(sourceKey)) return;
      entries.push(ledger.fromDocument(type, doc));
      covered.add(sourceKey);
    };

    (state.invoices || []).forEach((doc) => addDocument(doc.type, doc));
    (state.bills || []).forEach((doc) => addDocument(doc.type, doc));
    (state.expenses || []).forEach((doc) => addDocument('Expense', doc));

    (state.payments || []).forEach((payment) => {
      const sourceKey = key('Payment', payment.id);
      if (covered.has(sourceKey)) return;
      entries.push(ledger.fromPayment(payment));
      covered.add(sourceKey);
    });

    const explicitPaymentDocs = new Set((state.payments || []).map((payment) => payment.documentId));
    const addLegacyPaidSettlement = (documentType, doc) => {
      if (doc.status !== 'Paid' || explicitPaymentDocs.has(doc.id)) return;

      const migrationId = `MIGRATED-PAYMENT-${doc.id}`;
      const sourceKey = key('Payment', migrationId);
      if (covered.has(sourceKey)) return;

      const bankMatch = (state.bankTransactions || []).find((tx) => tx.matchedId === doc.id && tx.status === 'Matched');
      entries.push(ledger.fromPayment({
        id: migrationId,
        documentType,
        documentId: doc.id,
        amount: money(doc.totalGross),
        date: bankMatch?.date || doc.date,
        method: bankMatch ? 'Bank Reconciliation' : 'Migrated Paid Status',
        reference: doc.invNo || doc.billNo || doc.id,
        direction: documentType === 'Invoice' ? 'incoming' : 'outgoing'
      }));
      covered.add(sourceKey);
    };

    (state.invoices || []).filter((doc) => doc.type === 'Invoice').forEach((doc) => addLegacyPaidSettlement('Invoice', doc));
    (state.bills || []).filter((doc) => doc.type === 'Bill').forEach((doc) => addLegacyPaidSettlement('Bill', doc));

    return entries.sort((a, b) => {
      const byDate = isoDate(a.date).localeCompare(isoDate(b.date));
      return byDate || String(a.id).localeCompare(String(b.id));
    });
  }

  function trialBalance(state, { from = '', to = '' } = {}) {
    const accounts = new Map();

    buildCanonicalLedger(state)
      .filter((entry) => inRange(entry.date, from, to))
      .forEach((entry) => {
        (entry.lines || []).forEach((line) => {
          const row = accounts.get(line.account) || { account: line.account, debit: 0, credit: 0 };
          row.debit = money(row.debit + money(line.debit));
          row.credit = money(row.credit + money(line.credit));
          accounts.set(line.account, row);
        });
      });

    const rows = [...accounts.values()]
      .map((row) => ({ ...row, balance: money(row.debit - row.credit) }))
      .sort((a, b) => a.account.localeCompare(b.account));

    return {
      rows,
      totalDebit: money(rows.reduce((sum, row) => sum + row.debit, 0)),
      totalCredit: money(rows.reduce((sum, row) => sum + row.credit, 0))
    };
  }

  function accountCode(account) {
    const match = String(account || '').match(/^(\d+)/);
    return match ? Number(match[1]) : 9999;
  }

  function profitAndLoss(state, { from = '', to = '' } = {}) {
    const tb = trialBalance(state, { from, to });
    const revenue = [];
    const expenses = [];

    tb.rows.forEach((row) => {
      const code = accountCode(row.account);
      if (code >= 4000 && code < 5000) revenue.push({ ...row, amount: money(row.credit - row.debit) });
      if (code >= 5000 && code < 7000) expenses.push({ ...row, amount: money(row.debit - row.credit) });
    });

    const totalRevenue = money(revenue.reduce((sum, row) => sum + row.amount, 0));
    const totalExpenses = money(expenses.reduce((sum, row) => sum + row.amount, 0));

    return {
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netProfit: money(totalRevenue - totalExpenses)
    };
  }

  function balanceSheet(state, { to = '' } = {}) {
    const tb = trialBalance(state, { to });
    const assets = [];
    const liabilities = [];
    const equityAccounts = [];

    tb.rows.forEach((row) => {
      const code = accountCode(row.account);
      if (code >= 1000 && code < 2000) assets.push({ ...row, amount: money(row.debit - row.credit) });
      if (code >= 2000 && code < 3000) liabilities.push({ ...row, amount: money(row.credit - row.debit) });
      if (code >= 3000 && code < 4000) equityAccounts.push({ ...row, amount: money(row.credit - row.debit) });
    });

    const pnl = profitAndLoss(state, { to });
    const currentEarnings = pnl.netProfit;
    const totalAssets = money(assets.reduce((sum, row) => sum + row.amount, 0));
    const totalLiabilities = money(liabilities.reduce((sum, row) => sum + row.amount, 0));
    const statedEquity = money(equityAccounts.reduce((sum, row) => sum + row.amount, 0));
    const totalEquity = money(statedEquity + currentEarnings);

    return {
      assets,
      liabilities,
      equityAccounts,
      currentEarnings,
      totalAssets,
      totalLiabilities,
      totalEquity,
      difference: money(totalAssets - totalLiabilities - totalEquity)
    };
  }

  function generalLedger(state, { from = '', to = '' } = {}) {
    const rows = [];

    buildCanonicalLedger(state)
      .filter((entry) => inRange(entry.date, from, to))
      .forEach((entry) => {
        (entry.lines || []).forEach((line) => {
          rows.push({
            date: entry.date,
            journalId: entry.id,
            sourceType: entry.sourceType || '',
            sourceId: entry.sourceId || '',
            description: entry.description || '',
            account: line.account,
            memo: line.memo || '',
            debit: money(line.debit),
            credit: money(line.credit)
          });
        });
      });

    return { rows };
  }

  function ageDays(date, asOf) {
    const start = new Date(`${isoDate(date)}T00:00:00`);
    const end = new Date(`${isoDate(asOf)}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    return Math.max(0, Math.floor((end - start) / 86400000));
  }

  function bucket(days) {
    if (days <= 0) return 'Current';
    if (days <= 30) return '1-30';
    if (days <= 60) return '31-60';
    if (days <= 90) return '61-90';
    return '90+';
  }

  function ageingSummary(rows) {
    const buckets = { Current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    rows.forEach((row) => {
      buckets[row.bucket] = money((buckets[row.bucket] || 0) + row.outstanding);
    });
    return {
      rows,
      buckets,
      total: money(rows.reduce((sum, row) => sum + row.outstanding, 0))
    };
  }

  function agedReceivables(state, { to = '' } = {}) {
    const asOf = to || new Date().toISOString().slice(0, 10);
    const rows = (state.invoices || [])
      .filter((doc) => doc.type === 'Invoice' && (!doc.date || doc.date <= asOf))
      .map((doc) => {
        const outstanding = window.EvergreenPayments
          ? window.EvergreenPayments.outstandingAmount(state, 'Invoice', doc.id)
          : (doc.status === 'Paid' ? 0 : money(doc.totalGross));
        const days = ageDays(doc.dueDate || doc.date, asOf);
        return {
          reference: doc.invNo || doc.id,
          party: doc.customer || '',
          dueDate: doc.dueDate || doc.date,
          days,
          bucket: bucket(days),
          outstanding: money(outstanding)
        };
      })
      .filter((row) => row.outstanding > 0)
      .sort((a, b) => b.days - a.days);

    return ageingSummary(rows);
  }

  function agedPayables(state, { to = '' } = {}) {
    const asOf = to || new Date().toISOString().slice(0, 10);
    const rows = (state.bills || [])
      .filter((doc) => doc.type === 'Bill' && (!doc.date || doc.date <= asOf))
      .map((doc) => {
        const outstanding = window.EvergreenPayments
          ? window.EvergreenPayments.outstandingAmount(state, 'Bill', doc.id)
          : (doc.status === 'Paid' ? 0 : money(doc.totalGross));
        const days = ageDays(doc.dueDate || doc.date, asOf);
        return {
          reference: doc.billNo || doc.id,
          party: doc.supplier || '',
          dueDate: doc.dueDate || doc.date,
          days,
          bucket: bucket(days),
          outstanding: money(outstanding)
        };
      })
      .filter((row) => row.outstanding > 0)
      .sort((a, b) => b.days - a.days);

    return ageingSummary(rows);
  }

  function cashFlow(state, { from = '', to = '' } = {}) {
    const rows = (state.bankTransactions || [])
      .filter((tx) => inRange(tx.date, from, to))
      .map((tx) => ({
        date: tx.date,
        description: tx.description || '',
        amount: money(tx.amount),
        status: tx.status || 'Unmatched'
      }))
      .sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));

    buildCanonicalLedger(state).filter((entry) => inRange(entry.date, from, to)).forEach((entry) => {
      const amount = money((entry.lines || []).filter((line) => line.account === window.EvergreenLedger.ACCOUNTS.CASH)
        .reduce((sum, line) => sum + money(line.debit) - money(line.credit), 0));
      if (amount) rows.push({date:entry.date, description:`Cash · ${entry.description || ''}`, amount, status:'Recorded Cash'});
    });
    rows.sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
    const inflows = money(rows.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0));
    const outflows = money(Math.abs(rows.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0)));

    return {
      rows,
      inflows,
      outflows,
      netCashFlow: money(inflows - outflows)
    };
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function rowsToCsv(headers, rows) {
    return [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => row.map(csvEscape).join(','))
    ].join('\n');
  }

  window.EvergreenReports = Object.freeze({
    buildCanonicalLedger,
    trialBalance,
    profitAndLoss,
    balanceSheet,
    generalLedger,
    agedReceivables,
    agedPayables,
    cashFlow,
    rowsToCsv
  });
})();

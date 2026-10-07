(() => {
  'use strict';

  let activeReport = 'profitLoss';

  const gbp = (value) => new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(Number(value) || 0);

  function ensurePeriodDefaults() {
    const from = document.getElementById('reportFrom');
    const to = document.getElementById('reportTo');
    if (!from || !to) return;

    const today = new Date();
    if (!from.value) from.value = `${today.getFullYear()}-01-01`;
    if (!to.value) to.value = today.toISOString().slice(0, 10);
  }

  function period() {
    ensurePeriodDefaults();
    return {
      from: document.getElementById('reportFrom')?.value || '',
      to: document.getElementById('reportTo')?.value || ''
    };
  }

  function table(headers, rows, footer = '') {
    const body = rows.length
      ? rows.join('')
      : `<tr><td colspan="${headers.length}" class="p-6 text-center text-slate-400">No records for this period.</td></tr>`;

    return `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-semibold uppercase">
            <tr>${headers.map((header) => `<th class="p-3">${header}</th>`).join('')}</tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">${body}</tbody>
          ${footer}
        </table>
      </div>`;
  }

  function summaryCards(items) {
    return `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-${Math.min(items.length, 4)} gap-3 mb-5">${items.map((item) => `
      <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/30 p-4">
        <div class="text-[10px] uppercase tracking-wide text-slate-500">${item.label}</div>
        <div class="text-xl font-bold mt-1 ${item.className || ''}">${item.value}</div>
      </div>`).join('')}</div>`;
  }

  function renderProfitLoss() {
    const report = EvergreenReports.profitAndLoss(appState, period());
    const rows = [
      ...report.revenue.map((row) => `<tr><td class="p-3">${row.account}</td><td class="p-3 text-right font-mono text-emerald-600">${gbp(row.amount)}</td></tr>`),
      ...report.expenses.map((row) => `<tr><td class="p-3">${row.account}</td><td class="p-3 text-right font-mono text-rose-600">(${gbp(row.amount)})</td></tr>`)
    ];

    return summaryCards([
      { label: 'Revenue', value: gbp(report.totalRevenue), className: 'text-emerald-600' },
      { label: 'Expenses', value: gbp(report.totalExpenses), className: 'text-rose-600' },
      { label: 'Net Profit', value: gbp(report.netProfit), className: report.netProfit >= 0 ? 'text-brand-700 dark:text-brand-300' : 'text-rose-600' }
    ]) + table(
      ['Account', 'Amount'],
      rows,
      `<tfoot><tr class="font-bold bg-brand-50 dark:bg-brand-900/20"><td class="p-3">Net Profit / (Loss)</td><td class="p-3 text-right font-mono">${gbp(report.netProfit)}</td></tr></tfoot>`
    );
  }

  function renderBalanceSheet() {
    const report = EvergreenReports.balanceSheet(appState, period());
    const rows = [
      ...report.assets.map((row) => `<tr><td class="p-3">Asset</td><td class="p-3">${row.account}</td><td class="p-3 text-right font-mono">${gbp(row.amount)}</td></tr>`),
      ...report.liabilities.map((row) => `<tr><td class="p-3">Liability</td><td class="p-3">${row.account}</td><td class="p-3 text-right font-mono">${gbp(row.amount)}</td></tr>`),
      ...report.equityAccounts.map((row) => `<tr><td class="p-3">Equity</td><td class="p-3">${row.account}</td><td class="p-3 text-right font-mono">${gbp(row.amount)}</td></tr>`),
      `<tr><td class="p-3">Equity</td><td class="p-3 font-semibold">Current Earnings</td><td class="p-3 text-right font-mono">${gbp(report.currentEarnings)}</td></tr>`
    ];

    return summaryCards([
      { label: 'Total Assets', value: gbp(report.totalAssets) },
      { label: 'Liabilities', value: gbp(report.totalLiabilities) },
      { label: 'Equity + Earnings', value: gbp(report.totalEquity) },
      { label: 'Balance Check', value: gbp(report.difference), className: Math.abs(report.difference) < 0.01 ? 'text-emerald-600' : 'text-rose-600' }
    ]) + table(['Class', 'Account', 'Balance'], rows);
  }

  function renderTrialBalance() {
    const report = EvergreenReports.trialBalance(appState, period());
    const rows = report.rows.map((row) => `
      <tr>
        <td class="p-3">${row.account}</td>
        <td class="p-3 text-right font-mono">${gbp(row.debit)}</td>
        <td class="p-3 text-right font-mono">${gbp(row.credit)}</td>
      </tr>`
    );

    return summaryCards([
      { label: 'Total Debits', value: gbp(report.totalDebit) },
      { label: 'Total Credits', value: gbp(report.totalCredit) },
      { label: 'Difference', value: gbp(report.totalDebit - report.totalCredit), className: Math.abs(report.totalDebit - report.totalCredit) < 0.01 ? 'text-emerald-600' : 'text-rose-600' }
    ]) + table(
      ['Account', 'Debit', 'Credit'],
      rows,
      `<tfoot><tr class="font-bold bg-slate-100 dark:bg-slate-800"><td class="p-3">Totals</td><td class="p-3 text-right font-mono">${gbp(report.totalDebit)}</td><td class="p-3 text-right font-mono">${gbp(report.totalCredit)}</td></tr></tfoot>`
    );
  }

  function renderGeneralLedger() {
    const report = EvergreenReports.generalLedger(appState, period());
    const rows = report.rows.map((row) => `
      <tr>
        <td class="p-3 font-mono">${row.date}</td>
        <td class="p-3">${row.account}</td>
        <td class="p-3">${row.description}<div class="text-[10px] text-slate-400">${row.sourceType} ${row.sourceId}</div></td>
        <td class="p-3 text-right font-mono">${row.debit ? gbp(row.debit) : '—'}</td>
        <td class="p-3 text-right font-mono">${row.credit ? gbp(row.credit) : '—'}</td>
      </tr>`
    );

    return summaryCards([{ label: 'Journal Lines', value: String(report.rows.length) }])
      + table(['Date', 'Account', 'Description', 'Debit', 'Credit'], rows);
  }

  function renderAgeing(kind) {
    const report = kind === 'receivables'
      ? EvergreenReports.agedReceivables(appState, period())
      : EvergreenReports.agedPayables(appState, period());

    const rows = report.rows.map((row) => `
      <tr>
        <td class="p-3 font-mono">${row.reference}</td>
        <td class="p-3 font-semibold">${row.party}</td>
        <td class="p-3 font-mono">${row.dueDate}</td>
        <td class="p-3 text-center">${row.bucket}</td>
        <td class="p-3 text-right font-mono font-bold">${gbp(row.outstanding)}</td>
      </tr>`
    );

    return summaryCards([
      { label: 'Total Outstanding', value: gbp(report.total), className: 'text-amber-600' },
      { label: 'Current', value: gbp(report.buckets.Current) },
      { label: '1–30 Days', value: gbp(report.buckets['1-30']) },
      { label: '90+ Days', value: gbp(report.buckets['90+']), className: 'text-rose-600' }
    ]) + table(
      ['Reference', kind === 'receivables' ? 'Customer' : 'Supplier', 'Due Date', 'Age', 'Outstanding'],
      rows
    );
  }

  function renderCashFlow() {
    const report = EvergreenReports.cashFlow(appState, period());
    const rows = report.rows.map((row) => `
      <tr>
        <td class="p-3 font-mono">${row.date}</td>
        <td class="p-3">${row.description}</td>
        <td class="p-3 text-center">${row.status}</td>
        <td class="p-3 text-right font-mono ${row.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${gbp(row.amount)}</td>
      </tr>`
    );

    return summaryCards([
      { label: 'Cash In', value: gbp(report.inflows), className: 'text-emerald-600' },
      { label: 'Cash Out', value: gbp(report.outflows), className: 'text-rose-600' },
      { label: 'Net Cash Flow', value: gbp(report.netCashFlow), className: report.netCashFlow >= 0 ? 'text-brand-700 dark:text-brand-300' : 'text-rose-600' }
    ]) + table(['Date', 'Description', 'Recon Status', 'Amount'], rows);
  }

  function render() {
    const target = document.getElementById('reportOutput');
    if (!target || !window.EvergreenReports || typeof appState === 'undefined') return;

    ensurePeriodDefaults();
    const titles = {
      profitLoss: 'Profit & Loss',
      balanceSheet: 'Balance Sheet',
      trialBalance: 'Trial Balance',
      generalLedger: 'General Ledger',
      agedReceivables: 'Aged Receivables',
      agedPayables: 'Aged Payables',
      cashFlow: 'Cash Flow'
    };

    document.getElementById('reportTitle').innerText = titles[activeReport] || 'Reports';

    if (activeReport === 'profitLoss') target.innerHTML = renderProfitLoss();
    if (activeReport === 'balanceSheet') target.innerHTML = renderBalanceSheet();
    if (activeReport === 'trialBalance') target.innerHTML = renderTrialBalance();
    if (activeReport === 'generalLedger') target.innerHTML = renderGeneralLedger();
    if (activeReport === 'agedReceivables') target.innerHTML = renderAgeing('receivables');
    if (activeReport === 'agedPayables') target.innerHTML = renderAgeing('payables');
    if (activeReport === 'cashFlow') target.innerHTML = renderCashFlow();
  }

  function setReport(type) {
    activeReport = type;
    document.querySelectorAll('[data-report-type]').forEach((button) => {
      const selected = button.dataset.reportType === type;
      button.classList.toggle('bg-brand-600', selected);
      button.classList.toggle('text-white', selected);
      button.classList.toggle('bg-slate-100', !selected);
      button.classList.toggle('dark:bg-slate-800', !selected);
    });
    render();
  }

  function exportCsv() {
    const p = period();
    let csv = '';

    if (activeReport === 'profitLoss') {
      const r = EvergreenReports.profitAndLoss(appState, p);
      csv = EvergreenReports.rowsToCsv(['Section', 'Account', 'Amount'], [
        ...r.revenue.map((x) => ['Revenue', x.account, x.amount]),
        ...r.expenses.map((x) => ['Expense', x.account, x.amount]),
        ['Summary', 'Net Profit', r.netProfit]
      ]);
    } else if (activeReport === 'balanceSheet') {
      const r = EvergreenReports.balanceSheet(appState, p);
      csv = EvergreenReports.rowsToCsv(['Class', 'Account', 'Amount'], [
        ...r.assets.map((x) => ['Asset', x.account, x.amount]),
        ...r.liabilities.map((x) => ['Liability', x.account, x.amount]),
        ...r.equityAccounts.map((x) => ['Equity', x.account, x.amount]),
        ['Equity', 'Current Earnings', r.currentEarnings]
      ]);
    } else if (activeReport === 'trialBalance') {
      const r = EvergreenReports.trialBalance(appState, p);
      csv = EvergreenReports.rowsToCsv(['Account', 'Debit', 'Credit'], r.rows.map((x) => [x.account, x.debit, x.credit]));
    } else if (activeReport === 'generalLedger') {
      const r = EvergreenReports.generalLedger(appState, p);
      csv = EvergreenReports.rowsToCsv(
        ['Date', 'Journal', 'Source', 'Reference', 'Account', 'Description', 'Debit', 'Credit'],
        r.rows.map((x) => [x.date, x.journalId, x.sourceType, x.sourceId, x.account, x.description, x.debit, x.credit])
      );
    } else if (activeReport === 'agedReceivables' || activeReport === 'agedPayables') {
      const r = activeReport === 'agedReceivables'
        ? EvergreenReports.agedReceivables(appState, p)
        : EvergreenReports.agedPayables(appState, p);
      csv = EvergreenReports.rowsToCsv(
        ['Reference', 'Party', 'Due Date', 'Age Days', 'Bucket', 'Outstanding'],
        r.rows.map((x) => [x.reference, x.party, x.dueDate, x.days, x.bucket, x.outstanding])
      );
    } else {
      const r = EvergreenReports.cashFlow(appState, p);
      csv = EvergreenReports.rowsToCsv(
        ['Date', 'Description', 'Status', 'Amount'],
        r.rows.map((x) => [x.date, x.description, x.status, x.amount])
      );
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Evergreen_${activeReport}_${p.from || 'start'}_to_${p.to || 'today'}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('Report exported to CSV.');
  }

  function printReport() {
    const output = document.getElementById('reportOutput');
    const printable = document.getElementById('printableArea');
    if (!output || !printable) return;

    const p = period();
    printable.innerHTML = `
      <div class="border-b border-slate-200 pb-4 mb-5">
        <h1 class="text-2xl font-bold text-brand-700">Evergreen Accounting</h1>
        <h2 class="text-lg font-bold mt-1">${document.getElementById('reportTitle').innerText}</h2>
        <p class="text-xs text-slate-500 mt-1">Period: ${p.from || 'Beginning'} to ${p.to || 'Today'}</p>
      </div>
      ${output.innerHTML}
    `;
    document.getElementById('previewDocModal').classList.remove('hidden');
  }

  window.renderReports = render;
  window.setReportType = setReport;
  window.exportCurrentReportCsv = exportCsv;
  window.printCurrentReport = printReport;
})();
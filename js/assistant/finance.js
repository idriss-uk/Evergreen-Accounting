(() => {
  "use strict";
  const money = (value) => window.EvergreenLedger.roundMoney(value);
  const total = (rows) =>
    money(rows.reduce((sum, row) => sum + row.outstanding, 0));
  function calculate(snapshot, query, today) {
    const reports = window.EvergreenReports,
      state = snapshot.state;
    if (!reports || !window.EvergreenPayments || !window.EvergreenCash)
      throw Error("Accounting engines are unavailable. Reload the app.");
    const asOf = window.EvergreenAssistantData.asOf(state, query.range.to);
    const pnl = reports.profitAndLoss(state, query.range);
    const receivables = reports.agedReceivables(asOf, { to: query.range.to });
    const payables = reports.agedPayables(asOf, { to: query.range.to });
    const invoices = asOf.invoices.filter((d) => d.type === "Invoice");
    receivables.rows = invoices.flatMap((doc) =>
      reports
        .agedReceivables({ ...asOf, invoices: [doc] }, { to: query.range.to })
        .rows.map((row) => ({
          ...row,
          id: doc.id,
          partyKey: doc.customerId || doc.customer || doc.id,
          dueDate: doc.dueDate || "",
        })),
    );
    payables.rows = asOf.bills
      .filter((doc) => doc.type === "Bill")
      .flatMap((doc) =>
        reports
          .agedPayables({ ...asOf, bills: [doc] }, { to: query.range.to })
          .rows.map((row) => ({ ...row, dueDate: doc.dueDate || "" })),
      );
    const overdue = receivables.rows.filter(
      (row) => row.dueDate && row.dueDate < query.range.to,
    );
    const bank = state.bankTransactions.filter(
      (tx) =>
        tx.date <= query.range.to &&
        (query.intent !== "bank" ||
          !query.range.explicit ||
          !query.range.from ||
          tx.date >= query.range.from) &&
        tx.status !== "Matched",
    );
    const cash = window.EvergreenCash.ledger(state, { to: query.range.to });
    const gl = reports.generalLedger(state, query.range).rows;
    const categories = new Map();
    for (const line of gl) {
      const code = Number(String(line.account).match(/^\d+/)?.[0]);
      if (code < 5000 || code >= 7000 || !Number.isFinite(code)) continue;
      const doc = state.expenses.find(
        (d) => line.sourceType === "Expense" && d.id === line.sourceId,
      );
      const category =
        doc?.category ||
        (code < 6000
          ? "Purchases / supplier bills"
          : line.memo || "Uncategorised operating expenses");
      const row = categories.get(category) || {
        label: category,
        amount: 0,
        references: [],
      };
      row.amount = money(row.amount + line.debit - line.credit);
      row.references.push(line.sourceId || line.journalId);
      categories.set(category, row);
    }
    const tb = reports.trialBalance(state, query.range);
    const account = (key) =>
      tb.rows.find(
        (row) => row.account === window.EvergreenLedger.ACCOUNTS[key],
      );
    const input = account("VAT_INPUT"),
      output = account("VAT_OUTPUT");
    const vat = {
      input: money((input?.debit || 0) - (input?.credit || 0)),
      output: money((output?.credit || 0) - (output?.debit || 0)),
    };
    const warnings = [...snapshot.warnings];
    if (
      state.invoices.some(
        (d) => d.type === "Credit Note" && d.date <= query.range.to,
      )
    )
      warnings.push(
        "Invoice balances follow Evergreen’s payment report. Unallocated sales credit notes are not assigned to customer invoices; review credit allocation before chasing payment.",
      );
    if (
      state.bills.some(
        (d) => d.type === "Debit Note" && d.date <= query.range.to,
      )
    )
      warnings.push(
        "Supplier balances follow Evergreen’s payment report; unallocated debit notes are not deducted from individual bills.",
      );
    if (!Object.values(state).some((rows) => rows.length))
      warnings.push(
        "No accounting records are available. Zero means no recorded activity, not a verified business or bank balance.",
      );
    return {
      pnl,
      receivables,
      payables,
      overdue,
      bank,
      cash,
      vat,
      categories: [...categories.values()].sort((a, b) => b.amount - a.amount),
      gl,
      warnings,
      outstanding: total(receivables.rows),
      suppliers: total(payables.rows),
    };
  }
  window.EvergreenAssistantFinance = Object.freeze({ calculate });
})();

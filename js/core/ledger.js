(() => {
  'use strict';

  const ACCOUNTS = Object.freeze({
    BANK: '1000 Bank',
    CASH: '1010 Cash / Petty Cash',
    ACCOUNTS_RECEIVABLE: '1100 Accounts Receivable',
    VAT_INPUT: '1200 VAT Input',
    ACCOUNTS_PAYABLE: '2000 Accounts Payable',
    VAT_OUTPUT: '2100 VAT Output',
    SALES: '4000 Sales Revenue',
    PURCHASES: '5000 Purchases',
    OPERATING_EXPENSES: '6000 Operating Expenses'
  });

  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

  function isCashMethod(method) {
    return ['cash','petty cash','cash / petty cash'].includes(String(method || '').trim().toLowerCase());
  }

  function line(account, debit = 0, credit = 0, memo = '') {
    return {
      account,
      debit: roundMoney(debit),
      credit: roundMoney(credit),
      memo
    };
  }

  function createEntry({ id, date, sourceType, sourceId, description, lines }) {
    const entry = {
      id: id || `JRN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      date: date || new Date().toISOString().slice(0, 10),
      sourceType,
      sourceId,
      description,
      lines: lines.filter((item) => item.debit !== 0 || item.credit !== 0),
      createdAt: new Date().toISOString()
    };

    const totals = getTotals(entry);
    if (totals.debit !== totals.credit) {
      throw new Error(`Unbalanced journal: debit £${totals.debit.toFixed(2)} / credit £${totals.credit.toFixed(2)}`);
    }

    return entry;
  }

  function getTotals(entry) {
    return entry.lines.reduce((totals, item) => ({
      debit: roundMoney(totals.debit + roundMoney(item.debit)),
      credit: roundMoney(totals.credit + roundMoney(item.credit))
    }), { debit: 0, credit: 0 });
  }

  function fromDocument(documentType, doc) {
    const net = roundMoney(doc.totalNet ?? doc.netAmount);
    const vat = roundMoney(doc.totalVat ?? doc.vatAmount);
    const gross = roundMoney(doc.totalGross ?? doc.grossAmount);
    const ref = doc.invNo || doc.billNo || doc.id;

    if (documentType === 'Invoice') {
      return createEntry({
        date: doc.date,
        sourceType: documentType,
        sourceId: doc.id,
        description: `Sales invoice ${ref}`,
        lines: [
          line(ACCOUNTS.ACCOUNTS_RECEIVABLE, gross, 0, ref),
          line(ACCOUNTS.SALES, 0, net, ref),
          line(ACCOUNTS.VAT_OUTPUT, 0, vat, ref)
        ]
      });
    }

    if (documentType === 'Credit Note') {
      return createEntry({
        date: doc.date,
        sourceType: documentType,
        sourceId: doc.id,
        description: `Sales credit note ${ref}`,
        lines: [
          line(ACCOUNTS.SALES, net, 0, ref),
          line(ACCOUNTS.VAT_OUTPUT, vat, 0, ref),
          line(ACCOUNTS.ACCOUNTS_RECEIVABLE, 0, gross, ref)
        ]
      });
    }

    if (documentType === 'Bill') {
      return createEntry({
        date: doc.date,
        sourceType: documentType,
        sourceId: doc.id,
        description: `Supplier bill ${ref}`,
        lines: [
          line(ACCOUNTS.PURCHASES, net, 0, ref),
          line(ACCOUNTS.VAT_INPUT, vat, 0, ref),
          line(ACCOUNTS.ACCOUNTS_PAYABLE, 0, gross, ref)
        ]
      });
    }

    if (documentType === 'Debit Note') {
      return createEntry({
        date: doc.date,
        sourceType: documentType,
        sourceId: doc.id,
        description: `Supplier debit note ${ref}`,
        lines: [
          line(ACCOUNTS.ACCOUNTS_PAYABLE, gross, 0, ref),
          line(ACCOUNTS.PURCHASES, 0, net, ref),
          line(ACCOUNTS.VAT_INPUT, 0, vat, ref)
        ]
      });
    }

    if (documentType === 'Expense') {
      return createEntry({
        date: doc.date,
        sourceType: documentType,
        sourceId: doc.id,
        description: doc.merchant || 'Operational expense',
        lines: [
          line(ACCOUNTS.OPERATING_EXPENSES, net, 0, doc.category || ''),
          line(ACCOUNTS.VAT_INPUT, vat, 0, doc.category || ''),
          line(isCashMethod(doc.payMethod) ? ACCOUNTS.CASH : ACCOUNTS.BANK, 0, gross, doc.payMethod || '')
        ]
      });
    }

    throw new Error(`Unsupported Evergreen document type: ${documentType}`);
  }

  function fromPayment(payment) {
    const amount = roundMoney(payment.amount);
    const incoming = payment.direction === 'incoming';
    const account = isCashMethod(payment.method) ? ACCOUNTS.CASH : ACCOUNTS.BANK;

    return createEntry({
      date: payment.date,
      sourceType: 'Payment',
      sourceId: payment.id,
      description: payment.reference || 'Payment',
      lines: incoming
        ? [
            line(account, amount, 0, payment.reference),
            line(ACCOUNTS.ACCOUNTS_RECEIVABLE, 0, amount, payment.reference)
          ]
        : [
            line(ACCOUNTS.ACCOUNTS_PAYABLE, amount, 0, payment.reference),
            line(account, 0, amount, payment.reference)
          ]
    });
  }

  window.EvergreenLedger = Object.freeze({
    ACCOUNTS,
    isCashMethod,
    roundMoney,
    createEntry,
    getTotals,
    fromDocument,
    fromPayment
  });
})();

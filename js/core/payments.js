(() => {
  'use strict';

  function findDocument(state, documentType, documentId) {
    if (documentType === 'Invoice') {
      return (state.invoices || []).find((item) => item.id === documentId) || null;
    }
    if (documentType === 'Bill') {
      return (state.bills || []).find((item) => item.id === documentId) || null;
    }
    return null;
  }

  function paidAmount(state, documentType, documentId) {
    return (state.payments || [])
      .filter((payment) => payment.documentType === documentType && payment.documentId === documentId)
      .reduce((total, payment) => total + (Number(payment.amount) || 0), 0);
  }

  function outstandingAmount(state, documentType, documentId) {
    const document = findDocument(state, documentType, documentId);
    if (!document) return 0;
    const gross = Number(document.totalGross) || 0;
    return Math.max(0, Math.round((gross - paidAmount(state, documentType, documentId)) * 100) / 100);
  }

  function recordPayment(state, input) {
    const document = findDocument(state, input.documentType, input.documentId);
    if (!document) throw new Error('Payment document not found');

    const outstandingBefore = outstandingAmount(state, input.documentType, input.documentId);
    const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
    if (amount <= 0) throw new Error('Payment amount must be greater than zero');
    if (amount > outstandingBefore) throw new Error('Payment amount exceeds the outstanding balance');

    state.payments = Array.isArray(state.payments) ? state.payments : [];
    state.ledgerEntries = Array.isArray(state.ledgerEntries) ? state.ledgerEntries : [];

    const payment = {
      id: input.id || `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      documentType: input.documentType,
      documentId: input.documentId,
      amount,
      date: input.date || new Date().toISOString().slice(0, 10),
      method: input.method || 'Bank',
      reference: input.reference || document.invNo || document.billNo || document.id,
      direction: input.documentType === 'Invoice' ? 'incoming' : 'outgoing',
      createdAt: new Date().toISOString()
    };

    state.payments.push(payment);

    if (window.EvergreenLedger) {
      state.ledgerEntries.push(window.EvergreenLedger.fromPayment(payment));
    }

    const remaining = outstandingAmount(state, input.documentType, input.documentId);
    document.status = remaining === 0 ? 'Paid' : 'Part Paid';

    return { payment, remaining, document };
  }

  window.EvergreenPayments = Object.freeze({
    findDocument,
    paidAmount,
    outstandingAmount,
    recordPayment
  });
})();
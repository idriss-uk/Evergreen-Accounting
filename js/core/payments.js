(() => {
  'use strict';

  function findDocument(state, documentType, documentId) {
    const collection = documentType === 'Invoice'
      ? (state.invoices || [])
      : documentType === 'Bill'
        ? (state.bills || [])
        : [];
    const document = collection.find((item) => item.id === documentId) || null;
    return document && document.type === documentType ? document : null;
  }

  function paymentsForDocument(state, documentType, documentId) {
    return (state.payments || [])
      .filter((payment) => payment.documentType === documentType && payment.documentId === documentId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function paidAmount(state, documentType, documentId) {
    return paymentsForDocument(state, documentType, documentId)
      .reduce((total, payment) => total + (Number(payment.amount) || 0), 0);
  }

  function outstandingAmount(state, documentType, documentId) {
    const document = findDocument(state, documentType, documentId);
    if (!document) return 0;

    const payments = paymentsForDocument(state, documentType, documentId);
    if (payments.length === 0 && document.status === 'Paid') return 0;

    const gross = Number(document.totalGross) || 0;
    return Math.max(0, Math.round((gross - paidAmount(state, documentType, documentId)) * 100) / 100);
  }

  function paymentSummary(state,documentType,documentId) {
    const doc=findDocument(state,documentType,documentId); if (!doc) return null;
    const gross=Math.round((Number(doc.totalGross)||0)*100)/100;
    const outstanding=outstandingAmount(state,documentType,documentId);
    const paid=Math.max(0,Math.round((gross-outstanding)*100)/100);
    return {gross,paid,outstanding,status:outstanding<=0 ? 'Paid' : paid>0 ? 'Partially Paid' : 'Unpaid'};
  }

  function recordPayment(state, input) {
    const document = findDocument(state, input.documentType, input.documentId);
    if (!document) throw new Error('Payment document not found');

    const outstandingBefore = outstandingAmount(state, input.documentType, input.documentId);
    const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
    if (amount <= 0) throw new Error('Payment amount must be greater than zero');
    if (outstandingBefore <= 0) throw new Error('This document has no outstanding balance');
    if (amount > outstandingBefore) throw new Error('Payment amount exceeds the outstanding balance');

    state.payments = Array.isArray(state.payments) ? state.payments : [];
    state.ledgerEntries = Array.isArray(state.ledgerEntries) ? state.ledgerEntries : [];

    const payment = {
      id: input.id || `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      documentType: input.documentType,
      documentId: input.documentId,
      amount,
      date: input.date || new Date().toISOString().slice(0, 10),
      method: input.method || 'Bank Transfer',
      reference: String(input.reference || document.invNo || document.billNo || document.id).trim(),
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
    paymentsForDocument,
    paidAmount,
    outstandingAmount,
    recordPayment,
    paymentSummary
  });
})();
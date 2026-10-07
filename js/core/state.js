(() => {
  'use strict';

  const SCHEMA_VERSION = 2;
  const STORAGE_KEY = 'evergreen_accounting_db_v5';
  const LEGACY_STORAGE_KEYS = ['ledgerflow_mtd_db'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uniqueByName(values, kind) {
    const seen = new Set();
    return values
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((name, index) => ({
        id: `${kind.toUpperCase()}-${String(index + 1).padStart(4, '0')}`,
        name,
        createdAt: new Date().toISOString()
      }));
  }

  function normalize(source = {}) {
    const state = clone(source || {});
    const now = new Date().toISOString();

    state.metadata = {
      schemaVersion: SCHEMA_VERSION,
      createdAt: state.metadata?.createdAt || now,
      updatedAt: now,
      ...(state.metadata || {}),
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now
    };

    state.companyProfile = {
      name: '',
      vrn: '',
      address: '',
      logoUrl: '',
      ...(state.companyProfile || {})
    };

    const arrayKeys = [
      'invoices',
      'bills',
      'expenses',
      'bankTransactions',
      'cisRecords',
      'customers',
      'suppliers',
      'payments',
      'vatReturns',
      'ledgerEntries'
    ];

    arrayKeys.forEach((key) => {
      if (!Array.isArray(state[key])) state[key] = [];
    });

    if (state.customers.length === 0 && state.invoices.length > 0) {
      state.customers = uniqueByName(state.invoices.map((item) => item.customer), 'customer');
    }

    if (state.suppliers.length === 0 && (state.bills.length > 0 || state.expenses.length > 0)) {
      state.suppliers = uniqueByName([
        ...state.bills.map((item) => item.supplier),
        ...state.expenses.map((item) => item.merchant)
      ], 'supplier');
    }


    // V5.1 relationship migration: attach stable contact IDs to historical documents.
    const customersByName = new Map(state.customers.map((customer) => [customer.name.toLowerCase(), customer]));
    state.invoices.forEach((invoice) => {
      if (!invoice.customerId && invoice.customer) {
        invoice.customerId = customersByName.get(String(invoice.customer).trim().toLowerCase())?.id || null;
      }
    });

    const suppliersByName = new Map(state.suppliers.map((supplier) => [supplier.name.toLowerCase(), supplier]));
    state.bills.forEach((bill) => {
      if (!bill.supplierId && bill.supplier) {
        bill.supplierId = suppliersByName.get(String(bill.supplier).trim().toLowerCase())?.id || null;
      }
    });
    state.expenses.forEach((expense) => {
      if (!expense.supplierId && expense.merchant) {
        expense.supplierId = suppliersByName.get(String(expense.merchant).trim().toLowerCase())?.id || null;
      }
    });

    state.bankReconciliation = {
      openingBalance: Number(state.bankReconciliation?.openingBalance) || 0,
      ...(state.bankReconciliation || {})
    };

    if (typeof state.frsMode !== 'boolean') state.frsMode = false;
    if (!Number.isFinite(Number(state.frsRate))) state.frsRate = 14.5;

    return state;
  }

  function createEmptyState() {
    return normalize({});
  }

  window.EvergreenState = Object.freeze({
    SCHEMA_VERSION,
    STORAGE_KEY,
    LEGACY_STORAGE_KEYS,
    clone,
    normalize,
    createEmptyState
  });
})();
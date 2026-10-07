(() => {
  'use strict';

  function cleanName(name) {
    return String(name || '').trim();
  }

  function findByName(state, name) {
    const key = cleanName(name).toLowerCase();
    return (state.suppliers || []).find((supplier) => supplier.name.toLowerCase() === key) || null;
  }

  function ensureSupplier(state, name, details = {}) {
    const normalizedName = cleanName(name);
    if (!normalizedName) return null;

    state.suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
    const existing = findByName(state, normalizedName);
    if (existing) return existing;

    const supplier = {
      id: `SUPPLIER-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: normalizedName,
      email: '',
      phone: '',
      address: '',
      createdAt: new Date().toISOString(),
      ...details
    };
    state.suppliers.push(supplier);
    return supplier;
  }

  function outstandingBalance(state, supplierName) {
    const name = cleanName(supplierName).toLowerCase();
    return (state.bills || [])
      .filter((bill) => bill.type === 'Bill' && bill.supplier?.toLowerCase() === name && bill.status !== 'Paid')
      .reduce((total, bill) => total + (Number(bill.totalGross) || 0), 0);
  }

  window.EvergreenSuppliers = Object.freeze({
    findByName,
    ensureSupplier,
    outstandingBalance
  });
})();
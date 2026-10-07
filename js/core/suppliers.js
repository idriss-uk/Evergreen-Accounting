(() => {
  'use strict';

  function cleanName(name) {
    return String(name || '').trim();
  }

  function findById(state, id) {
    return (state.suppliers || []).find((supplier) => supplier.id === id) || null;
  }

  function findByName(state, name) {
    const key = cleanName(name).toLowerCase();
    return (state.suppliers || []).find((supplier) => supplier.name.toLowerCase() === key) || null;
  }

  function upsertSupplier(state, input = {}) {
    const normalizedName = cleanName(input.name);
    if (!normalizedName) throw new Error('Supplier name is required');

    state.suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
    const existing = (input.id && findById(state, input.id)) || findByName(state, normalizedName);
    const values = {
      name: normalizedName,
      email: String(input.email || '').trim(),
      phone: String(input.phone || '').trim(),
      address: String(input.address || '').trim(),
      updatedAt: new Date().toISOString()
    };

    if (existing) {
      Object.assign(existing, values);
      return existing;
    }

    const supplier = {
      id: input.id || `SUPPLIER-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      ...values,
      createdAt: new Date().toISOString()
    };
    state.suppliers.push(supplier);
    return supplier;
  }

  function ensureSupplier(state, name, details = {}) {
    return upsertSupplier(state, { name, ...details });
  }

  function outstandingBalance(state, supplierName) {
    const name = cleanName(supplierName).toLowerCase();
    return (state.bills || [])
      .filter((bill) => bill.type === 'Bill' && bill.supplier?.toLowerCase() === name)
      .reduce((total, bill) => {
        const amount = window.EvergreenPayments
          ? window.EvergreenPayments.outstandingAmount(state, 'Bill', bill.id)
          : (bill.status === 'Paid' ? 0 : Number(bill.totalGross) || 0);
        return total + amount;
      }, 0);
  }

  function purchaseCount(state, supplierName) {
    const name = cleanName(supplierName).toLowerCase();
    return (state.bills || []).filter((bill) => bill.supplier?.toLowerCase() === name).length;
  }

  window.EvergreenSuppliers = Object.freeze({
    findById,
    findByName,
    upsertSupplier,
    ensureSupplier,
    outstandingBalance,
    purchaseCount
  });
})();
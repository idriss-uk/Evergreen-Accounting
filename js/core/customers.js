(() => {
  'use strict';

  function cleanName(name) {
    return String(name || '').trim();
  }

  function findById(state, id) {
    return (state.customers || []).find((customer) => customer.id === id) || null;
  }

  function findByName(state, name) {
    const key = cleanName(name).toLowerCase();
    return (state.customers || []).find((customer) => customer.name.toLowerCase() === key) || null;
  }

  function upsertCustomer(state, input = {}) {
    const normalizedName = cleanName(input.name);
    if (!normalizedName) throw new Error('Customer name is required');

    state.customers = Array.isArray(state.customers) ? state.customers : [];
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

    const customer = {
      id: input.id || `CUSTOMER-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      ...values,
      createdAt: new Date().toISOString()
    };
    state.customers.push(customer);
    return customer;
  }

  function ensureCustomer(state, name, details = {}) {
    return upsertCustomer(state, { name, ...details });
  }

  function outstandingBalance(state, customerName) {
    const name = cleanName(customerName).toLowerCase();
    return (state.invoices || [])
      .filter((invoice) => invoice.type === 'Invoice' && invoice.customer?.toLowerCase() === name)
      .reduce((total, invoice) => {
        const amount = window.EvergreenPayments
          ? window.EvergreenPayments.outstandingAmount(state, 'Invoice', invoice.id)
          : (invoice.status === 'Paid' ? 0 : Number(invoice.totalGross) || 0);
        return total + amount;
      }, 0);
  }

  function salesCount(state, customerName) {
    const name = cleanName(customerName).toLowerCase();
    return (state.invoices || []).filter((invoice) => invoice.customer?.toLowerCase() === name).length;
  }

  window.EvergreenCustomers = Object.freeze({
    findById,
    findByName,
    upsertCustomer,
    ensureCustomer,
    outstandingBalance,
    salesCount
  });
})();
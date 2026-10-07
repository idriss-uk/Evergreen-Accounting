(() => {
  'use strict';

  function cleanName(name) {
    return String(name || '').trim();
  }

  function findByName(state, name) {
    const key = cleanName(name).toLowerCase();
    return (state.customers || []).find((customer) => customer.name.toLowerCase() === key) || null;
  }

  function ensureCustomer(state, name, details = {}) {
    const normalizedName = cleanName(name);
    if (!normalizedName) return null;

    state.customers = Array.isArray(state.customers) ? state.customers : [];
    const existing = findByName(state, normalizedName);
    if (existing) return existing;

    const customer = {
      id: `CUSTOMER-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: normalizedName,
      email: '',
      phone: '',
      address: '',
      createdAt: new Date().toISOString(),
      ...details
    };
    state.customers.push(customer);
    return customer;
  }

  function outstandingBalance(state, customerName) {
    const name = cleanName(customerName).toLowerCase();
    return (state.invoices || [])
      .filter((invoice) => invoice.type === 'Invoice' && invoice.customer?.toLowerCase() === name && invoice.status !== 'Paid')
      .reduce((total, invoice) => total + (Number(invoice.totalGross) || 0), 0);
  }

  window.EvergreenCustomers = Object.freeze({
    findByName,
    ensureCustomer,
    outstandingBalance
  });
})();
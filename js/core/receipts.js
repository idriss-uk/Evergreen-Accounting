(() => {
'use strict';
const categories = ['Software & IT','Office Supplies','Rent & Utilities','Travel & Meals','Legal & Professional','Advertising & Marketing','Bank Fees','Insurance','Repairs & Maintenance','Other Expenses'];
const money = n => Math.round(Number(n) * 100) / 100;
function suggest(merchant, history = []) {
 const key = String(merchant || '').trim().toLowerCase();
 if (!key) return null;
 const previous = history.find(e => String(e.merchant).trim().toLowerCase() === key && categories.includes(e.category));
 if (previous) return {category: previous.category, reason: 'Previous expense for this merchant'};
 const rules = [['Software & IT',/\b(adobe|microsoft|google|hosting|software|github)\b/],['Travel & Meals',/\b(uber|train|rail|hotel|taxi|restaurant)\b/],['Office Supplies',/\b(stationery|office supplies)\b/],['Rent & Utilities',/\b(electricity|water|gas|rent|broadband)\b/],['Bank Fees',/\b(bank fee|bank charge)\b/],['Insurance',/\binsurance\b/]];
 const found = rules.find(r => r[1].test(key));
 return found ? {category:found[0],reason:'Merchant keyword suggestion'} : null;
}
function create(input) {
 const net = Number(input.netAmount), rate = input.vatTreatment === 'EXEMPT' ? 0 : Number(input.vatTreatment);
 const date = String(input.date || '');
 if (!String(input.merchant || '').trim()) throw Error('Enter a merchant.');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw Error('Enter a valid expense date.');
 if (!Number.isFinite(net) || net <= 0 || ![0,5,20].includes(rate)) throw Error('Enter a positive net amount and a supported VAT rate.');
 if (!categories.includes(input.category)) throw Error('Choose an expense category.');
 const netAmount = money(net), vatAmount = money(netAmount * rate / 100);
 return {...input,id:input.id || 'EXP-' + crypto.randomUUID(),merchant:input.merchant.trim(),netAmount,vatRate:rate,vatAmount,grossAmount:money(netAmount+vatAmount),currency:'GBP',createdAt:new Date().toISOString()};
}
function duplicates(expense, history) {
 return history.filter(e => e.id !== expense.id && String(e.merchant).trim().toLowerCase() === expense.merchant.toLowerCase() && e.date === expense.date && money(e.grossAmount) === expense.grossAmount);
}
function validateFile(file) {
 if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) throw Error('Choose a JPG, PNG, WEBP or PDF receipt.');
 if (!file.size || file.size > 2 * 1024 * 1024) throw Error('Receipt must be non-empty and at most 2 MB. Resize larger camera photos before uploading.');
}
function extractionRequest(expense) {
 if (!expense.attachment || !expense.receipt) throw Error('Attach a receipt first.');
 return {schemaVersion:1,receipt:expense.receipt,fields:['merchant','date','reference','netAmount','vatAmount','grossAmount','currency'],requiresHumanReview:true};
}

function revise(existing, input) {
 if (!existing) throw Error('Expense no longer exists. Reopen the expense list.');
 const category = input.category ?? existing.category;
 const legacyCategory = category === existing.category && !categories.includes(category);
 const expense = create({...existing, ...input, id:existing.id, category:legacyCategory ? 'Other Expenses' : category});
 if (legacyCategory) expense.category = category;
 expense.createdAt = existing.createdAt || null;
 expense.updatedAt = new Date().toISOString();
 expense.supplierId = null;
 const fields = ['merchant','category','date','payMethod','reference','notes','netAmount','vatTreatment','vatRate','vatAmount','grossAmount','fileName','receipt'];
 const before = Object.fromEntries(fields.map(key => [key, existing[key] ?? null]));
 expense.revisions = [...(existing.revisions || []), {changedAt:expense.updatedAt, before, receiptChanged:existing.attachment !== expense.attachment}];
 return expense;
}
function applyExpense(state, expense, ledger) {
 if (!ledger) throw Error('Accounting engine is unavailable. Refresh and try again.');
 const journal = ledger.fromDocument('Expense',expense);
 const previous = (state.ledgerEntries || []).find(entry => entry.sourceType === 'Expense' && entry.sourceId === expense.id);
 if (previous) {journal.id = previous.id; journal.createdAt = previous.createdAt; journal.updatedAt = new Date().toISOString();}
 const entries = (state.ledgerEntries || []).filter(entry => !(entry.sourceType === 'Expense' && entry.sourceId === expense.id));
 const index = state.expenses.findIndex(item => item.id === expense.id);
 if (index < 0) state.expenses.unshift(expense); else state.expenses[index] = expense;
 state.ledgerEntries = [...entries, journal];
 return expense;
}

window.EvergreenReceipts = Object.freeze({categories,suggest,create,revise,applyExpense,duplicates,validateFile,extractionRequest,extractionAvailable:false});
})();
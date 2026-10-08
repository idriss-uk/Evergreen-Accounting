'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const context={window:{crypto},crypto};
for(const name of ['ledger','receipts','payments','bank-entries','reports'])vm.runInNewContext(fs.readFileSync(__dirname+'/../js/core/'+name+'.js','utf8'),context);
const {EvergreenLedger:l,EvergreenReceipts:r,EvergreenBankEntries:b,EvergreenReports:reports}=context.window;
const state={expenses:[],invoices:[],bills:[],payments:[],ledgerEntries:[],bankTransactions:[{id:'bank',date:'2026-10-08',amount:-120,status:'Unmatched'}]};
const expense=r.create({merchant:'Cash merchant',date:'2026-10-08',category:'Office Supplies',netAmount:100,vatTreatment:'20',payMethod:'Cash'});
r.applyExpense(state,expense,l);
assert.equal(state.ledgerEntries[0].lines.find(x=>x.account===l.ACCOUNTS.CASH).credit,120);
assert.equal(state.ledgerEntries[0].lines.some(x=>x.account===l.ACCOUNTS.BANK),false);
assert.equal(reports.profitAndLoss(state).totalExpenses,100);
const tb=reports.trialBalance(state);assert.equal(tb.totalDebit,tb.totalCredit);
assert.equal(b.existingCandidates(state,'bank').length,0);
const before=JSON.stringify(state);assert.throws(()=>b.linkExisting(state,'bank','Expense',expense.id));assert.equal(JSON.stringify(state),before);
assert.throws(()=>r.revise({...expense,bankTransactionId:'bank'},{payMethod:'Cash'}));
for(const method of ['Company Card','Bank Transfer','Cash']){
 r.applyExpense(state,r.revise(state.expenses[0],{payMethod:method}),l);
 assert.equal(state.expenses.length,1);assert.equal(state.ledgerEntries.length,1);
 assert.equal(state.ledgerEntries[0].lines.find(x=>x.credit).account,method==='Cash'?l.ACCOUNTS.CASH:l.ACCOUNTS.BANK);
}
for(const direction of ['incoming','outgoing']){
 const journal=l.fromPayment({id:direction,documentId:'doc',documentType:direction==='incoming'?'Invoice':'Bill',amount:30,date:'2026-10-08',direction,method:'Cash'});
 assert.equal(journal.lines.find(x=>x.account===l.ACCOUNTS.CASH)[direction==='incoming'?'debit':'credit'],30);
 assert.equal(l.getTotals(journal).debit,l.getTotals(journal).credit);
}
const cashOnly={...state,bankTransactions:[]};assert.equal(reports.cashFlow(cashOnly).outflows,120);
assert.equal(reports.cashFlow(cashOnly,{from:'2026-10-09'}).rows.length,0);
assert.equal(reports.cashFlow(state).rows.length,2);
console.log('Cash expense, editing, balanced ledger, cash flow and bank-link exclusion checks passed.');

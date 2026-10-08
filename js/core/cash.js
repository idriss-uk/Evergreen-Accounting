(() => {
 'use strict';
 const money=value=>Math.round(Number(value)*100)/100;
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
 const types=Object.freeze({opening:'Opening cash balance',withdrawal:'Bank withdrawal to cash',deposit:'Cash deposit to bank',capital:'Owner capital introduced',loan:'Owner / director loan introduced'});
 function ledger(state,{from='',to=''}={}) {
  const account=window.EvergreenLedger.ACCOUNTS.CASH;
  let opening=0,balance=0,inflows=0,outflows=0;
  const rows=[];
  window.EvergreenReports.buildCanonicalLedger(state).sort((a,b)=>String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id))).forEach(entry=>{
   const amount=money((entry.lines || []).filter(line=>line.account===account).reduce((sum,line)=>sum+Number(line.debit || 0)-Number(line.credit || 0),0));
   if (!amount || (to && entry.date>to)) return;
   balance=money(balance+amount);
   if (from && entry.date<from) {opening=balance;return;}
   const incoming=Math.max(amount,0),outgoing=Math.max(-amount,0);
   inflows=money(inflows+incoming);outflows=money(outflows+outgoing);
   const payment=entry.sourceType==='Payment'?(state.payments || []).find(p=>p.id===entry.sourceId):null;
   const expense=entry.sourceType==='Expense'?(state.expenses || []).find(e=>e.id===entry.sourceId):null;
   rows.push({id:entry.id,date:entry.date,reference:entry.cashReference || payment?.reference || expense?.reference || entry.sourceId || entry.id,description:entry.description || '',type:entry.sourceType==='CashMovement'?'Cash Movement':entry.sourceType,incoming,outgoing,balance});
  });
  return {rows,opening,inflows,outflows,balance};
 }
 function balanceAt(state,date,excludeExpenseId) {
  const filtered=excludeExpenseId ? {...state,expenses:(state.expenses || []).filter(e=>e.id!==excludeExpenseId),ledgerEntries:(state.ledgerEntries || []).filter(e=>!(e.sourceType==='Expense' && e.sourceId===excludeExpenseId))} : state;
  return ledger(filtered,{to:date}).balance;
 }
 function record(state,input) {
  const l=window.EvergreenLedger,type=input.type,amount=money(input.amount),date=input.date;
  if (!Object.prototype.hasOwnProperty.call(types,type)) throw Error('Choose a cash movement type.');
  if (!validDate(date)) throw Error('Enter a valid cash movement date.');
  if (!Number.isFinite(amount) || amount<=0) throw Error('Enter a cash amount greater than zero.');
  if (type==='opening' && (state.ledgerEntries || []).some(entry=>entry.sourceType==='CashMovement' && entry.cashKind==='opening' && !entry.reversedBy && !entry.cashReversalOf)) throw Error('An opening cash balance is already recorded.');
  const outgoing=type==='deposit';
  if (outgoing && balanceAt(state,date)<amount && !input.allowNegative) throw Error('Cash deposit exceeds cash available on this date. Review the cash ledger or confirm the negative balance warning.');
  const counterpart=['withdrawal','deposit'].includes(type)?l.ACCOUNTS.BANK:type==='loan'?'2200 Owner / Director Loan':'3000 Owner Capital / Opening Equity';
  const id='CASH-'+window.crypto.randomUUID();
  const entry=l.createEntry({date,sourceType:'CashMovement',sourceId:id,description:types[type]+(String(input.notes || '').trim()?' · '+String(input.notes).trim():''),lines:outgoing?
   [{account:counterpart,debit:amount,credit:0},{account:l.ACCOUNTS.CASH,debit:0,credit:amount}]:
   [{account:l.ACCOUNTS.CASH,debit:amount,credit:0},{account:counterpart,debit:0,credit:amount}]});
  Object.assign(entry,{cashKind:type,cashReference:String(input.reference || '').trim(),cashNotes:String(input.notes || '').trim()});
  (state.ledgerEntries ||= []).push(entry);
  return entry;
 }
 function reverse(state,id,date) {
  const original=(state.ledgerEntries || []).find(entry=>entry.id===id && entry.sourceType==='CashMovement');
  if (!original || original.reversedBy || original.cashReversalOf) throw Error('This cash movement cannot be reversed again.');
  if (original.bankTransactionId) throw Error('Unlink this transfer in Bank Recon before reversing it.');
  if (!validDate(date) || date<original.date) throw Error('Reversal date must be on or after the movement date.');
  const entry=window.EvergreenLedger.createEntry({date,sourceType:'CashMovement',sourceId:'CASH-'+window.crypto.randomUUID(),description:'Reversal · '+original.description,lines:original.lines.map(line=>({...line,debit:line.credit,credit:line.debit}))});
  Object.assign(entry,{cashKind:original.cashKind,cashReversalOf:original.id,cashReference:original.cashReference});
  original.reversedBy=entry.id;state.ledgerEntries.push(entry);return entry;
 }
 window.EvergreenCash=Object.freeze({types,ledger,balanceAt,record,reverse});
})();

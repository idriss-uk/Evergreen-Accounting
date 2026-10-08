(() => {
 'use strict';
 const el=id=>document.getElementById(id),fmt=value=>'£'+Number(value).toFixed(2);
 window.updateCashMovementHint=function() {
  const type=el('cashKind').value;
  el('cashMovementHint').textContent=type==='opening'?'Enter cash held before your first recorded cash transaction. This credits opening equity; it does not record income.':type==='capital'?'Credits owner capital. For money repayable to an owner or director, choose the loan option.':type==='loan'?'Credits the owner / director loan liability.': 'Match the corresponding imported bank row using Match Existing. Do not also record it as an expense or sale.';
 };
 window.renderCashLedger=function() {
  if (!el('cashDate').value) el('cashDate').value=new Date().toISOString().slice(0,10);
  updateCashMovementHint();
  const from=el('cashFrom').value,to=el('cashTo').value;
  if (from && to && from>to) {el('cashPeriodSummary').textContent='From date must be on or before To date.';el('cashLedgerRows').replaceChildren();return;}
  const report=EvergreenCash.ledger(appState,{from,to}),today=EvergreenCash.balanceAt(appState,new Date().toISOString().slice(0,10));
  el('cashCurrent').textContent=fmt(today);el('cashIn').textContent=fmt(report.inflows);el('cashOut').textContent=fmt(report.outflows);
  el('cashBalanceWarning').textContent=today<0?'Negative cash balance: check that cash funding and receipts are recorded.':'';
  el('cashPeriodSummary').textContent='Opening: '+fmt(report.opening)+' · Closing: '+fmt(report.balance);
  el('cashLedgerRows').replaceChildren();
  for (const row of report.rows) {
   const tr=document.createElement('tr');tr.className='border-b';
   [row.date,row.reference+' / '+row.type,row.description,row.incoming?fmt(row.incoming):'—',row.outgoing?fmt(row.outgoing):'—',fmt(row.balance)].forEach((value,i)=>{
    const td=document.createElement('td');td.className='p-3 '+(i>=3?'text-right':'text-left');td.textContent=value;tr.appendChild(td);
   });
   const td=document.createElement('td');td.className='p-3';
   const entry=(appState.ledgerEntries || []).find(e=>e.id===row.id);
   if(entry?.sourceType==='CashMovement' && !entry.reversedBy && !entry.cashReversalOf){const button=document.createElement('button');button.textContent='Reverse';button.className='text-brand-700';button.onclick=()=>reverseCashMovement(row.id);td.appendChild(button);}
   tr.appendChild(td);el('cashLedgerRows').appendChild(tr);
  }
  if (!report.rows.length) {const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.className='p-3';td.textContent='No cash movements in this period.';tr.appendChild(td);el('cashLedgerRows').appendChild(tr);}
 };
 window.saveCashMovement=async function(event) {
  event.preventDefault();const button=el('cashMovementSave');if(button.disabled)return;
  const input={type:el('cashKind').value,date:el('cashDate').value,amount:el('cashAmount').value,reference:el('cashReference').value,notes:el('cashNotes').value};
  if (input.type==='deposit' && EvergreenCash.balanceAt(appState,input.date)<Number(input.amount)) {
   if(!confirm('This deposit exceeds cash available on its date. Cash will become negative. Record it anyway?'))return;input.allowNegative=true;
  }
  const previous=JSON.parse(JSON.stringify(appState));button.disabled=true;
  try {EvergreenCash.record(appState,input);await saveState();el('cashMovementForm').reset();renderCashLedger();renderDashboard();showToast('Cash movement recorded.');}
  catch(error){appState=previous;showToast(error.message || 'Unable to save cash movement.','error');}
  finally{button.disabled=false;}
 };
 window.reverseCashMovement=async function(id) {
  if(!confirm('Reverse this cash movement today? The original entry remains in the ledger for audit.'))return;
  const previous=JSON.parse(JSON.stringify(appState));
  try {EvergreenCash.reverse(appState,id,new Date().toISOString().slice(0,10));await saveState();renderCashLedger();renderDashboard();showToast('Cash movement reversed.');}
  catch(error){appState=previous;showToast(error.message,'error');}
 };
 window.exportCashLedger=function() {
  const from=el('cashFrom').value,to=el('cashTo').value;if(from && to && from>to){showToast('Review the date range.','error');return;}
  const report=EvergreenCash.ledger(appState,{from,to});
  const rows=[['','Opening balance','','','',report.opening],...report.rows.map(r=>[r.date,...[r.reference,r.description].map(value=>/^[=+@-]/.test(String(value))?"'"+value:value),r.incoming,r.outgoing,r.balance]),['','Closing balance','','','',report.balance]];
  const blob=new Blob([EvergreenReports.rowsToCsv(['Date','Reference','Description','Money In','Money Out','Balance'],rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='evergreen-cash-ledger.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
})();

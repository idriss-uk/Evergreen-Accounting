(() => {
 'use strict';
 let receiptVersion=0,receipt=null,readingReceipt=false;
 const el=id=>document.getElementById(id);
 const clone=value=>JSON.parse(JSON.stringify(value));
 const refresh=()=>{renderBankTable();renderSalesTable();renderPurchasesTable();renderExpensesTable();renderContacts();renderDashboard();};
 const txById=id=>(appState.bankTransactions || []).find(tx=>tx.id===id);
 const ready=()=>{
  if(!window.EvergreenBankEntries) {showToast('Bank workflow update is loading. Reopen and refresh Evergreen.','error');return false;}
  return true;
 };
 window.openBankEntry=function(txId) {
  if(!ready())return;const tx=txById(txId);if(!tx)return;
  if(!EvergreenBanking.canRemoveTransaction(appState,tx)) {showToast('This row has already been reconciled.','error');return;}
  el('bankEntryForm').reset();receipt=null;readingReceipt=false;receiptVersion++;
  const sale=tx.amount>0;
  el('bankEntryTxId').value=txId;
  el('bankEntryTitle').textContent=sale?'Record Sale from Bank Row':'Record Expense from Bank Row';
  el('bankEntrySummary').textContent=tx.date+' · '+tx.description+' · £'+Math.abs(Number(tx.amount)).toFixed(2);
  el('bankEntryPartyLabel').textContent=sale?'Customer':'Merchant / Supplier';
  el('bankEntryReferenceLabel').textContent=sale?'Invoice number (optional)':'Receipt reference (optional)';
  el('bankEntryDescription').value=tx.description;
  el('bankEntryExpenseFields').classList.toggle('hidden',sale);
  el('bankEntryCategory').replaceChildren();
  EvergreenReceipts.categories.forEach(category=>{const option=document.createElement('option');option.value=category;option.textContent=category;el('bankEntryCategory').appendChild(option);});
  el('bankEntryCategory').value=EvergreenReceipts.categories.includes(tx.category)?tx.category:'Other Expenses';
  const plausible=EvergreenBankEntries.plausibleExisting(appState,txId);
  el('bankEntryExistingWarning').classList.toggle('hidden',!plausible.length);
  el('bankConfirmNewEntry').required=Boolean(plausible.length);
  el('bankEntryReviewExisting').onclick=()=>{closeModal('bankEntryModal');openExistingBankMatch(txId);};
  el('bankEntryFileName').textContent='Receipt optional';
  el('bankEntrySave').disabled=false;el('bankEntrySave').textContent=sale?'Record Sale & Reconcile':'Record Expense & Reconcile';
  updateBankEntryTotals();el('bankEntryModal').classList.remove('hidden');
 };
 window.updateBankEntryTotals=function() {
  const tx=txById(el('bankEntryTxId').value);if(!tx)return;
  const treatment=el('bankEntryVat').value,rate=treatment==='EXEMPT'?0:Number(treatment);
  const gross=Math.round(Math.abs(tx.amount)*100)/100,net=Math.round(gross/(1+rate/100)*100)/100;
  el('bankEntryNet').textContent='£'+net.toFixed(2);el('bankEntryVatAmount').textContent='£'+(gross-net).toFixed(2);
 };
 window.handleBankEntryReceipt=async function(event) {
  const file=event.target.files[0];if(!file)return;
  const version=++receiptVersion,previous=receipt;
  readingReceipt=true;el('bankEntrySave').disabled=true;el('bankEntryFileName').textContent='Preparing receipt…';
  try {
   const prepared=await EvergreenReceipts.prepareFile(file);
   if(version!==receiptVersion)return;
   receipt={attachment:prepared.data,fileName:prepared.metadata.fileName,receipt:{...prepared.metadata,schemaVersion:1,source:'bank-upload',capturedAt:new Date().toISOString(),extraction:{status:'not_available',reviewRequired:true}}};
   el('bankEntryFileName').textContent=prepared.metadata.fileName+' · '+Math.ceil(prepared.metadata.sizeBytes/1024)+' KB · Ready';
  } catch(error) {if(version===receiptVersion){receipt=previous;el('bankEntryFileName').textContent=previous?'Previous receipt kept':'Receipt optional';showToast(error.message,'error');}}
  finally {if(version===receiptVersion){readingReceipt=false;el('bankEntrySave').disabled=false;}}
 };
 window.saveBankEntry=async function(event) {
  event.preventDefault();if(!ready())return;
  if(readingReceipt){showToast('Wait for the receipt to finish loading.','error');return;}
  const previous=clone(appState);
  try {
   const result=EvergreenBankEntries.createFromRow(appState,el('bankEntryTxId').value,{party:el('bankEntryParty').value,description:el('bankEntryDescription').value,reference:el('bankEntryReference').value,category:el('bankEntryCategory').value,vatTreatment:el('bankEntryVat').value,confirmNewEntry:el('bankConfirmNewEntry').checked,...(receipt || {})});
   await saveState();closeModal('bankEntryModal');receiptVersion++;receipt=null;refresh();
   showToast((result.document.type==='Invoice'?'Sale':'Expense')+' recorded and bank row reconciled.');
  } catch(error){appState=previous;showToast(error.message || 'Unable to record bank entry.','error');}
 };
 window.openExistingBankMatch=function(txId) {
  if(!ready())return;const tx=txById(txId);if(!tx)return;
  try {
   const candidates=EvergreenBankEntries.existingCandidates(appState,txId),select=el('existingBankSource');select.replaceChildren();
   candidates.forEach(source=>{const option=document.createElement('option');option.value=JSON.stringify([source.type,source.id]);option.textContent=source.type+' · '+source.reference+' · '+source.party+' · '+source.date+' · £'+source.amount.toFixed(2)+' · '+source.method;select.appendChild(option);});
   if(!candidates.length){const option=document.createElement('option');option.value='';option.textContent='No unreconciled recorded item with the same amount and direction';select.appendChild(option);}
   el('existingBankTxId').value=txId;el('existingBankSummary').textContent=tx.date+' · '+tx.description+' · £'+Number(tx.amount).toFixed(2);
   el('existingBankSave').disabled=!candidates.length;el('existingBankMatchModal').classList.remove('hidden');
  } catch(error){showToast(error.message,'error');}
 };
 window.saveExistingBankMatch=async function(event) {
  event.preventDefault();if(!ready())return;if(!el('existingBankSource').value)return;
  const previous=clone(appState);
  try {
   const [type,id]=JSON.parse(el('existingBankSource').value);
   EvergreenBankEntries.linkExisting(appState,el('existingBankTxId').value,type,id);
   await saveState();closeModal('existingBankMatchModal');refresh();showToast('Existing record linked. Accounting amounts are unchanged.');
  } catch(error){appState=previous;showToast(error.message || 'Unable to link recorded item.','error');}
 };
 window.unlinkExistingBankMatch=async function(txId) {
  if(!ready()||!confirm('Remove this bank link and keep the recorded payment or expense?'))return;
  const previous=clone(appState);
  try {EvergreenBankEntries.unlinkExisting(appState,txId);await saveState();refresh();showToast('Bank link removed; recorded amounts are unchanged.');}
  catch(error){appState=previous;showToast(error.message,'error');}
 };
})();

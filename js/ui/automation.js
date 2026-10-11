(() => {
 'use strict';
 const el=id=>document.getElementById(id),api=()=>window.EvergreenAutomation;
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 let busy=false,review=null,reminderId=null;
 function cell(row,text){const td=document.createElement('td');td.className='p-3';td.textContent=text;row.append(td);return td;}
 function button(parent,text,action,disabled=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.className='p-2 border rounded-xl m-1';b.disabled=disabled;b.onclick=action;parent.append(b);}
 function options(id){const select=el(id),value=select.value;select.replaceChildren();const empty=new Option('Choose an invoice','');select.add(empty);appState.invoices.filter(doc=>doc.type==='Invoice').forEach(doc=>select.add(new Option(doc.invNo+' · '+doc.customer,doc.id)));select.value=value;}
 function render(){
  options('recurringSource');options('dueInvoice');if(!el('recurringStart').value)el('recurringStart').value=today();
  const body=el('recurringRows');body.replaceChildren();
  for(const template of appState.recurringTemplates || []){
   const row=document.createElement('tr');let next;try{next=api().scheduled(template);}catch(error){next='Invalid schedule';}
   cell(row,template.name+' · '+template.customer);cell(row,template.frequency[0].toUpperCase()+template.frequency.slice(1));cell(row,next);cell(row,template.active?'Active':'Paused');const actions=cell(row,'');
   button(actions,'Review & generate',()=>openReview(template.id),!template.active || next>today() || next==='Invalid schedule');
   button(actions,template.active?'Pause':'Resume',()=>mutate(()=>{const current=appState.recurringTemplates.find(item=>item.id===template.id);current.active=!current.active;}));body.append(row);
  }
  if(!body.children.length){const row=document.createElement('tr');cell(row,'No recurring templates yet.');body.append(row);}
  const overdue=api().overdue(appState,today());
  el('overdueSummary').textContent=overdue.length+' overdue invoices · '+new Set(overdue.map(row=>row.customer)).size+' customers · £'+overdue.reduce((sum,row)=>sum+row.outstanding,0).toFixed(2)+' outstanding';
  el('missingDueDates').textContent=appState.invoices.filter(doc=>doc.type==='Invoice'&&!doc.dueDate&&EvergreenPayments.outstandingAmount(appState,'Invoice',doc.id)>0).length+' unpaid invoices have no due date.';
  el('overdueRows').replaceChildren();for(const item of overdue){const row=document.createElement('tr');cell(row,item.id);cell(row,item.customer);cell(row,item.dueDate);cell(row,'£'+item.outstanding.toFixed(2));cell(row,String(item.daysOverdue));button(cell(row,''),'Edit reminder',()=>openReminder(item.id));el('overdueRows').append(row);}
  if(!overdue.length){const row=document.createElement('tr');cell(row,'No overdue invoices with a recorded due date.');el('overdueRows').append(row);}
 }
 async function mutate(action,after){
  if(busy)return;busy=true;
  const work=async()=>{
   let previous,saved=false;
   try{
    await stateSaveQueue;
    const stored=await EvergreenStorage.loadSnapshot();
    if(stored && stored.metadata.saveRevision!==appState.metadata.saveRevision) throw Error('Records changed in another tab. Reload Evergreen before continuing.');
    previous=JSON.parse(JSON.stringify(appState));action();await saveState();saved=true;render();renderSalesTable();renderDashboard();after?.();
   }catch(error){if(previous && !saved)appState=previous;showToast(error.message,'error');}
  };
  try{if(navigator.locks)await navigator.locks.request('evergreen-business-automation',work);else await work();}
  finally{busy=false;}
 }

 function create(event){event.preventDefault();return mutate(()=>api().createTemplate(appState,{name:el('recurringName').value,sourceId:el('recurringSource').value,frequency:el('recurringFrequency').value,startDate:el('recurringStart').value,termsDays:el('recurringTerms').value}),()=>showToast('Recurring template saved. No invoice generated.'));}
 function openReview(id){try{review=api().preview(appState,id,today());const content=el('recurringReviewContent');content.replaceChildren();for(const text of [review.invNo,review.customer,'Invoice date: '+review.date+' · Due: '+review.dueDate,...review.items.map(item=>item.desc+' · '+item.qty+' × £'+item.price.toFixed(2)+' · VAT '+item.vatRate),'Net £'+review.totalNet.toFixed(2)+' · VAT £'+review.totalVat.toFixed(2)+' · Gross £'+review.totalGross.toFixed(2)]){const p=document.createElement('p');p.textContent=text;content.append(p);}el('recurringReviewModal').classList.remove('hidden');}catch(error){showToast(error.message,'error');}}
 function generate(){if(!review)return;return mutate(()=>api().generate(appState,review.recurringTemplateId,review.date,today()),()=>{closeModal('recurringReviewModal');review=null;showToast('Scheduled invoice generated.');});}
 function setDue(event){event.preventDefault();return mutate(()=>{const doc=appState.invoices.find(item=>item.id===el('dueInvoice').value&&item.type==='Invoice');if(!doc)throw Error('Choose an invoice.');const value=api().date(el('dueDate').value);if(value<doc.date)throw Error('Due date cannot precede the invoice date.');doc.dueDate=value;},()=>showToast('Invoice due date saved. Accounting amounts unchanged.'));}
 function openReminder(id){reminderId=id;const saved=(appState.paymentReminders || []).find(row=>row.id===id);el('paymentReminderText').value=saved?.message || api().reminder(appState,id,today());el('paymentReminderModal').classList.remove('hidden');}
 function saveReminder(){return mutate(()=>{if(!appState.invoices.some(doc=>doc.id===reminderId))throw Error('Invoice unavailable.');appState.paymentReminders ||= [];const draft={id:reminderId,message:el('paymentReminderText').value,updatedAt:new Date().toISOString()};const index=appState.paymentReminders.findIndex(row=>row.id===reminderId);if(index<0)appState.paymentReminders.push(draft);else appState.paymentReminders[index]=draft;},()=>showToast('Reminder draft saved on this device.'));}
 function resetReminder(){try{el('paymentReminderText').value=api().reminder(appState,reminderId,today());}catch(error){showToast(error.message,'error');}}
 async function copyReminder(){try{await navigator.clipboard.writeText(el('paymentReminderText').value);showToast('Reminder copied. Send it yourself.');}catch(error){el('paymentReminderText').focus();el('paymentReminderText').select();showToast('Select and copy this message using your device.');}}
 function selectDue(){el('dueDate').value=appState.invoices.find(doc=>doc.id===el('dueInvoice').value)?.dueDate || '';}
 window.EvergreenAutomationUI={selectDue,render,create,generate,setDue,saveReminder,resetReminder,copyReminder};
})();

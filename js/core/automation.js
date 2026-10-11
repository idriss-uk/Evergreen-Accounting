(() => {
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const frequencies={weekly:0,monthly:1,quarterly:3,annual:12};
 function date(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw Error('Enter a valid date.');
  return value;
 }
 function addDays(value,days){const d=new Date(date(value)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
 function scheduled(template,cycle=template.cycle || 0){
  const start=new Date(date(template.startDate)+'T00:00:00Z');
  if(!Object.hasOwn(frequencies,template.frequency)||!Number.isSafeInteger(cycle)||cycle<0) throw Error('Invalid recurring schedule.');
  if(template.frequency==='weekly') return addDays(template.startDate,cycle*7);
  const months=frequencies[template.frequency]*cycle;
  const d=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+months,1));
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(start.getUTCDate(),last));return date(d.toISOString().slice(0,10));
 }
 function createTemplate(state,input){
  const source=state.invoices.find(doc=>doc.id===input.sourceId && doc.type==='Invoice');
  if(!source) throw Error('Choose an existing sales invoice.');
  if(!input.name?.trim() || !Object.hasOwn(frequencies,input.frequency)) throw Error('Enter a template name and frequency.');
  date(input.startDate);
  const terms=Number(input.termsDays);
  if(!Number.isInteger(terms)||terms<0||terms>365) throw Error('Payment terms must be 0–365 days.');
  // Validate a snapshot using the same engine as manual invoices; no posting occurs here.
  const draft=window.EvergreenInvoices.create({reference:'TEMPLATE',customer:source.customer,date:input.startDate,items:source.items});
  const template={id:'REC-'+window.crypto.randomUUID(),name:input.name.trim(),customer:draft.customer,items:clone(draft.items),frequency:input.frequency,startDate:input.startDate,termsDays:terms,cycle:0,active:true,generated:[]};
  (state.recurringTemplates ||= []).push(template);return template;
 }
 function preview(state,id,today){
  const template=(state.recurringTemplates || []).find(item=>item.id===id);
  if(!template || !template.active) throw Error('Template is paused or unavailable.');
  if(!Number.isInteger(template.termsDays)||template.termsDays<0||template.termsDays>365 || !Array.isArray(template.generated)) throw Error('Invalid template payment terms or generation history.');
  const cycleDate=scheduled(template);date(today);
  if(cycleDate>today) throw Error('This scheduled invoice is not due for generation yet.');
  if((template.generated || []).some(item=>item.date===cycleDate) || state.invoices.some(doc=>doc.recurringTemplateId===id && doc.recurringDate===cycleDate)) throw Error('This scheduled invoice has already been generated.');
  const doc=window.EvergreenInvoices.create({reference:'RINV-'+template.id.slice(4,12)+'-'+cycleDate.replaceAll('-',''),customer:template.customer,date:cycleDate,dueDate:addDays(cycleDate,template.termsDays),items:template.items});
  return {...doc,recurringTemplateId:id,recurringDate:cycleDate};
 }
 function generate(state,id,expectedDate,today){
  const doc=preview(state,id,today);
  if(doc.date!==expectedDate) throw Error('The schedule changed. Review the next invoice again.');
  const template=state.recurringTemplates.find(item=>item.id===id);
  // Check the next date before posting so invalid schedules cannot leave partial transactions.
  scheduled(template,(template.cycle || 0)+1);
  window.EvergreenInvoices.post(state,doc);
  (template.generated ||= []).push({date:doc.date,invoiceId:doc.id});template.cycle=(template.cycle || 0)+1;
  return doc;
 }
 function overdue(state,today){
  date(today);
  return state.invoices.filter(doc=>doc.type==='Invoice' && doc.dueDate).map(doc=>{
   date(doc.dueDate);
   const outstanding=window.EvergreenPayments.outstandingAmount(state,'Invoice',doc.id);
   return {id:doc.id,customer:doc.customer,dueDate:doc.dueDate,outstanding,daysOverdue:Math.floor((Date.parse(today)-Date.parse(doc.dueDate))/86400000)};
  }).filter(row=>row.daysOverdue>0 && row.outstanding>0).sort((a,b)=>b.daysOverdue-a.daysOverdue);
 }
 function reminder(state,id,today){
  const row=overdue(state,today).find(item=>item.id===id);if(!row) throw Error('This invoice is no longer overdue.');
  return `Hello ${row.customer},\n\nOur invoice ${row.id}, due on ${row.dueDate}, has an outstanding balance of £${row.outstanding.toFixed(2)} (${row.daysOverdue} days overdue). Please arrange payment or let us know if you have any questions. If payment has already been sent, please share the reference.\n\nThank you,\n${state.companyProfile?.name || 'Accounts team'}`;
 }
 window.EvergreenAutomation=Object.freeze({date,addDays,scheduled,createTemplate,preview,generate,overdue,reminder});
})();

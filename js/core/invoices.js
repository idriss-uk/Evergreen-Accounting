(() => {
 'use strict';
 const money=value=>Math.round(value*100)/100;
 function create(input){
  const items=JSON.parse(JSON.stringify(input.items || []));
  if(!items.length) throw Error('Add an invoice line.');
  let net=0,vat=0;
  items.forEach(item=>{
   if(!Number.isFinite(item.qty)||item.qty<=0||!Number.isFinite(item.price)||item.price<0||!['20','5','0','EXEMPT'].includes(String(item.vatRate))||!String(item.desc || '').trim()) throw Error('Enter valid invoice lines.');
   const amount=money(item.qty*item.price);net=money(net+amount);vat=money(vat+money(amount*(item.vatRate==='EXEMPT'?0:Number(item.vatRate))/100));
  });
  if(!input.reference || !input.customer || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw Error('Enter a document number, customer and date.');
  return {id:input.reference,invNo:input.reference,type:input.type || 'Invoice',customer:input.customer,date:input.date,...(input.dueDate?{dueDate:input.dueDate}:{}),items,totalNet:net,totalVat:vat,totalGross:money(net+vat),status:input.type==='Credit Note'?'Returned':'Unpaid'};
 }
 function post(state,doc){
  if(state.invoices.some(item=>item.id===doc.id || item.invNo===doc.invNo)) throw Error('Use a unique document number.');
  const journal=window.EvergreenLedger.fromDocument(doc.type,doc);
  if(window.EvergreenCustomers){const customer=window.EvergreenCustomers.ensureCustomer(state,doc.customer);if(customer)doc.customerId=customer.id;}
  state.invoices.unshift(doc);(state.ledgerEntries ||= []).push(journal);return doc;
 }
 window.EvergreenInvoices=Object.freeze({create,post});
})();

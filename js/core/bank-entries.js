(() => {
  'use strict';
  const money=value=>Math.round(Number(value)*100)/100;
  const text=value=>String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  function bankRow(state,id,available=true) {
    const tx=typeof id==='object' && id!==null ? id : (state.bankTransactions || []).find(row=>row.id===id);
    if (!tx) throw Error('Bank transaction no longer exists.');
    if (!Number.isFinite(Number(tx.amount)) || money(tx.amount)===0 || !validDate(tx.date)) throw Error('Bank transaction has an invalid amount or date.');
    if (available && (tx.status==='Matched' || tx.status==='Duplicate' || tx.matchedId || tx.matchedPaymentId || (state.payments || []).some(p=>p.bankTransactionId===tx.id) || (state.expenses || []).some(e=>e.bankTransactionId===tx.id))) throw Error('This bank row has already been reconciled or excluded.');
    return tx;
  }
  function linkedElsewhere(state,type,source,tx) {
    if (source.bankTransactionId && source.bankTransactionId!==tx.id) return true;
    return (state.bankTransactions || []).some(row=>row.id!==tx.id && row.status==='Matched' && (
      (row.matchedType===type && row.matchedId===source.id) ||
      (type==='Payment' && row.matchedPaymentId===source.id) ||
      (type==='Payment' && row.matchedType===source.documentType && row.matchedId===source.documentId && row.date===source.date && money(Math.abs(row.amount))===money(source.amount) && text(row.description)===text(source.reference))
    ));
  }
  function existingCandidates(state,txId) {
    const tx=bankRow(state,txId);
    const amount=money(Math.abs(tx.amount)),candidates=[];
    (state.payments || []).forEach(payment=>{
      if (!['Invoice','Bill'].includes(payment.documentType) || (payment.documentType==='Invoice')!==(tx.amount>0) || money(payment.amount)!==amount || linkedElsewhere(state,'Payment',payment,tx)) return;
      const docs=payment.documentType==='Invoice' ? state.invoices : state.bills;
      const doc=(docs || []).find(d=>d.id===payment.documentId && d.type===payment.documentType);
      if (!doc) return;
      candidates.push({type:'Payment',id:payment.id,date:payment.date,amount,reference:doc.invNo || doc.billNo || payment.reference || payment.id,paymentReference:payment.reference || '',party:doc.customer || doc.supplier || '',method:payment.method || '',documentType:payment.documentType,documentId:doc.id});
    });
    if (tx.amount<0) (state.expenses || []).forEach(expense=>{
      if (money(expense.grossAmount)!==amount || linkedElsewhere(state,'Expense',expense,tx)) return;
      candidates.push({type:'Expense',id:expense.id,date:expense.date,amount,reference:expense.reference || expense.id,party:expense.merchant || '',method:expense.payMethod || '',documentType:'Expense',documentId:expense.id});
    });
    return candidates;
  }
  function plausibleExisting(state,txId) {
    const tx=bankRow(state,txId),description=' '+text(tx.description)+' ';
    return existingCandidates(state,txId).filter(source=>{
      const near=validDate(source.date) && Math.abs(Date.parse(source.date)-Date.parse(tx.date))<=7*86400000;
      const reference=[source.reference,source.paymentReference].some(value=>text(value).length>=3 && description.includes(' '+text(value)+' '));
      return near || reference;
    });
  }
  function markMatched(tx,type,id,reference,mode) {
    Object.assign(tx,{status:'Matched',matchedType:type,matchedId:id,matchedReference:reference,matchedAmount:money(Math.abs(tx.amount)),matchedAt:new Date().toISOString(),matchMode:mode,suggestedType:null,suggestedId:null,suggestedReference:null,suggestedParty:null,matchScore:100});
  }
  function linkExisting(state,txId,type,id) {
    const tx=bankRow(state,txId);
    const candidate=existingCandidates(state,txId).find(item=>item.type===type && item.id===id);
    if (!candidate) throw Error('This record is unavailable, already reconciled, or has a different amount or payment direction.');
    const source=(type==='Payment' ? state.payments : state.expenses).find(item=>item.id===id);
    source.bankTransactionId=tx.id;
    markMatched(tx,type,id,candidate.reference,'existing');
    if (type==='Payment') tx.matchedPaymentId=id;
    state.bankLinkHistory=[...(state.bankLinkHistory || []),{action:'link',bankTransactionId:tx.id,sourceType:type,sourceId:id,at:tx.matchedAt}];
    return {transaction:tx,source};
  }
  function unlinkExisting(state,txId) {
    const tx=bankRow(state,txId,false);
    if (tx.status!=='Matched' || tx.matchMode!=='existing' || !['Payment','Expense'].includes(tx.matchedType)) throw Error('Only links to already-recorded items can be removed here.');
    const type=tx.matchedType,id=tx.matchedId;
    const source=((type==='Payment' ? state.payments : state.expenses) || []).find(item=>item.id===id);
    if (!source || source.bankTransactionId!==tx.id) throw Error('The linked record changed. Review the reconciliation before continuing.');
    delete source.bankTransactionId;
    for (const field of ['matchedType','matchedId','matchedReference','matchedPaymentId','matchedAmount','matchedAt','matchMode','suggestedType','suggestedId','suggestedReference','suggestedParty']) delete tx[field];
    tx.status='Unmatched';tx.matchScore=0;
    state.bankLinkHistory=[...(state.bankLinkHistory || []),{action:'unlink',bankTransactionId:tx.id,sourceType:type,sourceId:id,at:new Date().toISOString()}];
    return tx;
  }
  function uniqueId(state,prefix) {
    let id;
    do {id=prefix+'-'+(window.crypto?.randomUUID?.() || Date.now()+'-'+Math.random().toString(36).slice(2));}
    while ([...(state.invoices || []),...(state.expenses || [])].some(item=>item.id===id));
    return id;
  }
  function createFromRow(state,txId,input) {
    bankRow(state,txId);
    if (plausibleExisting(state,txId).length && !input.confirmNewEntry) throw Error('A similar recorded payment or expense exists. Review Match Existing first, or confirm that this is a separate new entry.');
    const work=clone(state),tx=bankRow(work,txId),isSale=tx.amount>0;
    const party=String(input.party || '').trim(),description=String(input.description || tx.description).trim();
    if (!party || !description) throw Error('Enter the customer or merchant and a description.');
    if (!window.EvergreenLedger || !window.EvergreenPayments || !window.EvergreenReceipts) throw Error('Accounting update is unavailable. Refresh Evergreen.');
    const treatment=String(input.vatTreatment ?? '0'),rate=treatment==='EXEMPT' ? 0 : Number(treatment);
    if (!['0','5','20','EXEMPT'].includes(treatment)) throw Error('Choose a supported VAT rate.');
    const gross=money(Math.abs(tx.amount)),net=money(gross/(1+rate/100)),vat=money(gross-net);
    let document;
    if (isSale) {
      const reference=String(input.reference || uniqueId(work,'INV-BANK')).trim();
      if ((work.invoices || []).some(doc=>doc.id===reference || doc.invNo===reference)) throw Error('Use a unique invoice number.');
      document={id:reference,invNo:reference,type:'Invoice',customer:party,date:tx.date,items:[{desc:description,qty:1,price:net,vatRate:treatment}],totalNet:net,totalVat:vat,totalGross:gross,status:'Unpaid',createdAt:new Date().toISOString(),origin:'bank',bankTransactionId:tx.id};
      const journal=window.EvergreenLedger.fromDocument('Invoice',document);
      const contact=window.EvergreenCustomers?.ensureCustomer(work,party);if(contact)document.customerId=contact.id;
      (work.invoices ||= []).unshift(document);(work.ledgerEntries ||= []).push(journal);
      const result=window.EvergreenPayments.recordPayment(work,{documentType:'Invoice',documentId:document.id,amount:gross,date:tx.date,method:'Bank Reconciliation',reference:tx.description});
      result.payment.bankTransactionId=tx.id;
      markMatched(tx,'Invoice',document.id,document.invNo,'created');tx.matchedPaymentId=result.payment.id;tx.category='Sales / Other Income';
    } else {
      document=window.EvergreenReceipts.create({id:uniqueId(work,'EXP-BANK'),merchant:party,date:tx.date,category:input.category,payMethod:'Bank Transfer',netAmount:net,vatTreatment:treatment,reference:String(input.reference || '').trim(),notes:description,attachment:input.attachment || null,fileName:input.fileName || null,receipt:input.receipt || null,origin:'bank',bankTransactionId:tx.id});
      document.vatAmount=vat;document.grossAmount=gross;
      const contact=window.EvergreenSuppliers?.ensureSupplier(work,party);if(contact)document.supplierId=contact.id;
      window.EvergreenReceipts.applyExpense(work,document,window.EvergreenLedger);
      markMatched(tx,'Expense',document.id,document.reference || document.merchant,'created');tx.category=document.category;
    }
    Object.assign(state,work);
    return {transaction:tx,document};
  }
  function documentLinked(state,type,id) {
    if (type==='Expense' && (state.expenses || []).some(item=>item.id===id && item.bankTransactionId)) return true;
    if ((state.bankTransactions || []).some(tx=>tx.status==='Matched' && tx.matchedType===type && tx.matchedId===id)) return true;
    return (state.payments || []).some(payment=>payment.documentType===type && payment.documentId===id && (payment.bankTransactionId || (state.bankTransactions || []).some(tx=>tx.status==='Matched' && tx.matchedType==='Payment' && tx.matchedId===payment.id)));
  }
  window.EvergreenBankEntries=Object.freeze({existingCandidates,plausibleExisting,linkExisting,unlinkExisting,createFromRow,documentLinked});
})();

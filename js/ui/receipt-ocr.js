(() => {
  'use strict';

  let generation=0;
  let scanning=false;
  let pendingReview=null;
  let applied=false;
  const el=id=>document.getElementById(id);
  const money=value=>Math.round(Number(value)*100)/100;

  function status(message, error=false) {
    const target=el('ocrScanStatus');
    if(!target) return;
    target.textContent=message;
    target.className=error ? 'text-xs text-rose-600 font-semibold' : 'text-xs text-slate-500 dark:text-slate-300';
  }

  function setBusy(value) {
    scanning=value;
    window.expOcrBusy=value;
    const button=el('ocrScanButton');
    if(button) button.disabled=value;
    const save=el('expenseSaveButton');
    if(save) save.disabled=value;
  }

  function reset() {
    generation++;
    pendingReview=null;
    applied=false;
    window.expOcrPending=false;
    window.expOcrApplied=false;
    // An OCR worker in progress cannot be interrupted safely; invalidate its results.
    setBusy(false);
    const panel=el('ocrReviewPanel');
    if(panel) panel.classList.add('hidden');
    const original=el('ocrReceiptImage');
    if(original) original.removeAttribute('src');
    const recognized=el('ocrRecognizedText');
    if(recognized) recognized.textContent='';
    status('Choose a JPG, PNG or WEBP receipt photo and select Scan receipt.');
  }

  function receiptChanged() {
    reset();
    if(!el('expenseModal')?.classList.contains('hidden')) {
      status('Receipt updated. Scan to obtain fresh suggestions.');
    }
  }

  function updateReviewCalculation() {
    const totalInput=el('ocrReviewTotal');
    const vatInput=el('ocrReviewVat');
    const netText=el('ocrReviewNet');
    const warning=el('ocrReviewValidation');
    if(!totalInput||!vatInput||!netText||!warning) return;
    const total=totalInput.value===''?NaN:Number(totalInput.value);
    const vat=vatInput.value===''?NaN:Number(vatInput.value);
    if(!Number.isFinite(total)||!Number.isFinite(vat)||total<=0||vat<0||vat>total) {
      netText.textContent='Net: —';
      warning.textContent='Enter a positive total and a VAT amount between £0 and the total. VAT must be reviewed, even when zero.';
      return;
    }
    const net=money(total-vat);
    netText.textContent='Net: £'+net.toFixed(2);
    const treatment=el('ocrReviewVatRate').value;
    if(!treatment) {
      warning.textContent='Choose a VAT treatment after checking the original receipt.';
      return;
    }
    const expected=treatment==='EXEMPT'?0:money(net*Number(treatment)/100);
    warning.textContent=Math.abs(expected-money(vat))>0.02
      ? 'VAT amount does not match the selected rate. Review net, VAT and treatment before applying.'
      : 'Figures are internally consistent. You must still check the original receipt.';
  }

  function renderReview(result) {
    const s=result.suggestions;
    const panel=el('ocrReviewPanel');
    panel.classList.remove('hidden');
    const image=el('ocrReceiptImage');
    image.src=pendingExpenseFileBase64;
    el('ocrReviewMerchant').value=s.merchant||'';
    el('ocrReviewDate').value=s.date||'';
    el('ocrReviewTotal').value=Number.isFinite(s.gross)?Number(s.gross).toFixed(2):'';
    el('ocrReviewVat').value=Number.isFinite(s.vat)?Number(s.vat).toFixed(2):'';
    el('ocrReviewVatRate').value=s.vatRate||'';
    el('ocrReviewConfidence').textContent=s.ocrConfidence===null
      ? 'Text recognition confidence unavailable'
      : 'Text recognition confidence: '+s.ocrConfidence+'% (not a guarantee of correct figures)';
    el('ocrReviewWarnings').textContent=s.warnings.length?s.warnings.join(' • '):
      'All values are suggestions. Please compare each value with the receipt.';
    el('ocrRecognizedText').textContent=result.rawText;
    updateReviewCalculation();
  }

  async function scan() {
    if(scanning) return;
    const data=typeof pendingExpenseFileBase64==='undefined' ? null : pendingExpenseFileBase64;
    if(!data) {
      status('Attach a receipt image first.',true);
      return;
    }
    if(!/^data:image\/(?:jpeg|png|webp);base64,/i.test(data)) {
      status('Scanning supports JPG, PNG or WEBP. For a PDF receipt, enter the details manually.',true);
      return;
    }
    const generationAtStart=++generation;
    const uploadVersionAtStart=window.expUploadVersion;
    pendingReview=null;
    applied=false;
    window.expOcrPending=false;
    window.expOcrApplied=false;
    el('ocrReviewPanel').classList.add('hidden');
    setBusy(true);
    status('Preparing English OCR engine. Initial scan requires internet to download OCR files...');
    try {
      if(!window.EvergreenReceiptOCR?.scanImage) throw Error('OCR module is loading. Refresh Evergreen and try again.');
      const result=await EvergreenReceiptOCR.scanImage(data,update=>{
        if(generation!==generationAtStart) return;
        status(update.status+(update.progress===null?'':' — '+update.progress+'%'));
      });
      if(generation!==generationAtStart || window.expUploadVersion!==uploadVersionAtStart ||
         pendingExpenseFileBase64!==data || el('expenseModal')?.classList.contains('hidden')) return;

      pendingReview={
        ...result,
        uploadVersion:uploadVersionAtStart,
        receiptHash:window.expReceipt?.sha256||null
      };
      window.expOcrPending=true;
      renderReview(result);
      status('Scan complete. Review the original and every suggested field. Nothing was saved.');
    } catch(error) {
      if(generation===generationAtStart) status(error.message||'Scanning failed; manual entry remains available.',true);
    } finally {
      if(generation===generationAtStart) setBusy(false);
    }
  }

  function apply() {
    if(!pendingReview || pendingReview.uploadVersion!==window.expUploadVersion ||
       !pendingExpenseFileBase64 ||
       (pendingReview.receiptHash && window.expReceipt?.sha256!==pendingReview.receiptHash)) {
      status('Receipt changed. Scan again before applying suggestions.',true);
      return;
    }

    const merchant=el('ocrReviewMerchant').value.trim();
    const date=el('ocrReviewDate').value;
    const gross=Number(el('ocrReviewTotal').value);
    const vat=Number(el('ocrReviewVat').value);
    const rate=el('ocrReviewVatRate').value;
    if(!merchant || !date || !Number.isFinite(Date.parse(date)) ||
       !el('ocrReviewTotal').value || !el('ocrReviewVat').value ||
       !Number.isFinite(gross) || !Number.isFinite(vat) ||
       gross<=0 || vat<0 || vat>gross || !rate) {
      status('Complete merchant, date, gross total, VAT amount and VAT treatment before applying.',true);
      return;
    }
    const net=money(gross-vat);
    if(net<=0) {status('Net amount must be greater than zero.',true);return;}
    const calculatedVat=rate==='EXEMPT'?0:money(net*Number(rate)/100);
    if(Math.abs(calculatedVat-money(vat))>0.02) {
      status('VAT is inconsistent with the selected VAT rate. Correct the amounts or VAT treatment.',true);
      return;
    }

    el('expMerchant').value=merchant;
    el('expDate').value=date;
    el('expNet').value=net.toFixed(2);
    el('expVatRate').value=rate;
    if(typeof recalcExpenseTotal==='function') recalcExpenseTotal();
    if(typeof suggestExpenseCategory==='function') suggestExpenseCategory();

    // Preserve a small review audit record. Raw OCR text is never stored.
    // Historical attachments can predate receipt metadata.
    if(!window.expReceipt) {
      window.expReceipt={
        schemaVersion:2,
        source:'legacy',
        fileName:typeof pendingExpenseFileName==='string'?pendingExpenseFileName:'Older receipt image',
        mimeType:(pendingExpenseFileBase64.match(/^data:([^;]+);/)||[])[1]||'image/jpeg',
        ocrReady:true,
        capturedAt:null
      };
    }
    if(window.expReceipt) {
      window.expReceipt.extraction={
        status:'reviewed',
        engine:pendingReview.engine,
        recognizedTextStored:false,
        reviewedAt:new Date().toISOString(),
        confidence:pendingReview.suggestions.ocrConfidence,
        humanConfirmed:true,
        reviewedFields:['merchant','date','gross','vat','net','vatTreatment'],
        receiptSha256:pendingReview.receiptHash
      };
    }
    applied=true;
    window.expOcrPending=false;
    window.expOcrApplied=true;
    el('ocrReviewPanel').classList.add('hidden');
    pendingReview=null;
    status('Reviewed suggestions copied into the expense form. Select Save Expense Entry to post them; nothing has been posted yet.');
    if(typeof showToast==='function') showToast('OCR values applied. Check the expense form, then save when ready.');
  }

  function discard() {
    reset();
    status('OCR suggestions discarded. Your expense form has not changed.');
  }

  window.EvergreenOcrUI=Object.freeze({
    scan,
    apply,
    discard,
    reset,
    receiptChanged,
    updateReviewCalculation
  });
})();
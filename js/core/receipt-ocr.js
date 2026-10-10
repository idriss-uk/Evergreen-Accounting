(() => {
  'use strict';

  // Browser-only OCR; only the engine code/language pack are downloaded.
  // Receipt image data is processed locally. No receipt data is sent to an AI API.
  const ENGINE_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let enginePromise = null;

  const round = value => Math.round(Number(value) * 100) / 100;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const asIso = (year, month, day) => {
    const y = Number(year), m = Number(month), d = Number(day);
    if (!Number.isInteger(y) || y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return [y, String(m).padStart(2,'0'), String(d).padStart(2,'0')].join('-');
  };

  function extractDate(text) {
    const lines = String(text || '').split(/\r?\n/);
    const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const results = [];
    for (let i=0;i<lines.length;i++) {
      const line = lines[i];
      const isDateLine = /\b(date|purchased|transaction)\b/i.test(line);
      for (const match of line.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
        const value = asIso(match[1], match[2], match[3]);
        if (value) results.push({value,score:isDateLine?98:78,source:clean(line),line:i});
      }
      for (const match of line.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/g)) {
        const yy = match[3].length===2 ? 2000+Number(match[3]) : Number(match[3]);
        const value = asIso(yy,match[2],match[1]);
        if (value) results.push({value,score:isDateLine?96:76,source:clean(line),line:i});
      }
      for (const match of line.matchAll(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2}|\d{2})\b/gi)) {
        const yy = match[3].length===2 ? 2000+Number(match[3]) : Number(match[3]);
        const value = asIso(yy,monthNames.indexOf(match[2].slice(0,3).toLowerCase())+1,match[1]);
        if (value) results.push({value,score:isDateLine?96:76,source:clean(line),line:i});
      }
    }
    results.sort((a,b)=>b.score-a.score || a.line-b.line);
    return results[0] || null;
  }

  function parseCurrency(raw) {
    let amount = String(raw || '').replace(/[£\s]/g,'').trim();
    if (amount.includes(',') && !amount.includes('.')) {
      if (/^\d+,\d{2}$/.test(amount)) amount = amount.replace(',','.');
      else amount = amount.replace(/,/g,'');
    } else amount = amount.replace(/,/g,'');
    const n = Number(amount);
    return Number.isFinite(n) && n >= 0 && n <= 100000000 ? round(n) : null;
  }

  const prices = line => {
    const values=[];
    for (const match of String(line).matchAll(/(?:£\s*)?\d{1,7}(?:,\d{3})*(?:\.\d{2}|,\d{2})\b/g)) {
      const n=parseCurrency(match[0]);
      if(n!==null) values.push(n);
    }
    return values;
  };

  function extractAmounts(text) {
    const lines=String(text||'').split(/\r?\n/);
    const pick={gross:[],vat:[],net:[]};
    for (let i=0;i<lines.length;i++) {
      const line=clean(lines[i]), lower=line.toLowerCase();
      if(!line || /\b(vat\s*(reg|number|no\b)|company\s*(reg|number)|telephone|phone|postcode|sort code|card number)\b/i.test(line)) continue;
      const values=prices(line);
      if (!values.length) continue;
      const amount=values[values.length-1];
      let kind='',score=0;
      if (/\b(sub\s?total|net(?:\s+(?:amount|total))?|before\s+vat)\b/i.test(line)) {kind='net';score=90;}
      else if (/\b(vat(?:\s+(?:total|amount|due|20%|5%|@|charged))?|sales\s+tax|tax\s+amount)\b/i.test(line) && !/\b(total\s*(?:paid|due)|grand\s+total)\b/i.test(line)) {kind='vat';score=90;}
      else if (/\b(grand\s+total|total\s+paid|amount\s+paid|amount\s+due|balance\s+due|card\s+total|total\s+to\s+pay)\b/i.test(line)) {kind='gross';score=98;}
      else if (/\btotal\b/i.test(line) && !/\b(sub|vat|tax|discount|change|items|savings)\b/i.test(line)) {kind='gross';score=85;}
      if(kind) pick[kind].push({value:amount,score,source:line,line:i});
    }
    Object.values(pick).forEach(items=>items.sort((a,b)=>b.score-a.score || b.line-a.line));
    return {gross:pick.gross[0]||null,vat:pick.vat[0]||null,net:pick.net[0]||null,
      conflictingGross:pick.gross.length>1 && pick.gross.some(row=>row.value!==pick.gross[0].value)};
  }

  function extractMerchant(text) {
    const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);
    for(const line of lines.slice(0,9)){
      // OCR often joins a supplier heading on the left with the INVOICE title on the right.
      // Remove a trailing document heading, but preserve brand names such as InvoiceMate.
      const merchantLine=clean(line.replace(/(?:\s+|\s*[-—–|:]\s*)(?:(?:TAX\s+)?(?:INVOICE|NVOICE|INV0ICE|INV01CE)|RECEIPT)\s*$/i,''));
      if(merchantLine.length<3 || merchantLine.length>65 || !/[a-z]{3}/i.test(merchantLine)) continue;
      if(/\b(receipt|invoice|tax invoice|order no|terminal|vat reg|date|time|cardholder|transaction|subtotal|total|thank you|welcome|customer copy|sales receipt|tel:|telephone|street|road|postcode|email|www\.|https?:|card:)\b/i.test(merchantLine)) continue;
      if(/^[\d\s£.,/#*-]+$/.test(merchantLine) || /(?:\d{1,2}:\d{2}|\d{4,})/.test(merchantLine)) continue;
      return {value:merchantLine,score:68,source:line};
    }
    return null;
  }

  function parseReceiptText(rawText, ocrConfidence = null) {
    const text=String(rawText||'').slice(0,30000);
    const merchant=extractMerchant(text);
    const date=extractDate(text);
    const amounts=extractAmounts(text);
    let total=amounts.gross?.value ?? null;
    let vat=amounts.vat?.value ?? null;
    let net=amounts.net?.value ?? null;
    const warnings=[];

    if(total===null && net!==null && vat!==null) {
      total=round(net+vat);
      warnings.push('Total calculated from net and VAT; verify against the receipt.');
    }
    if(net===null && total!==null && vat!==null) {
      net=round(total-vat);
    }
    if(vat===null && net!==null && total!==null && total>=net) {
      vat=round(total-net);
      warnings.push('VAT inferred from total minus net; check the receipt.');
    }
    if(total===null) warnings.push('Total not confidently found: enter it manually.');
    if(vat===null) warnings.push('VAT was not identified. Do not assume the purchase is zero-rated.');
    if(!date) warnings.push('Receipt date not identified.');
    if(!merchant) warnings.push('Merchant not identified.');
    // Invoices can represent a supplier purchase or the user's own issued sales.
    // OCR cannot decide the bookkeeping treatment safely.
    const documentHints = /\b(?:INVOICE|NVOICE|INV0ICE|INV01CE)\b/i.test(text)
      && /\b(?:BILL\s*TO|INVOICE\s*(?:NO|NUMBER|#)|TOTAL\s*DUE)\b/i.test(text);
    if(documentHints) warnings.push('This appears to be an invoice. Confirm whether it is a supplier purchase or your own sales invoice before posting under Expenses.');
    if(amounts.conflictingGross) warnings.push('Multiple different totals found. Confirm the correct amount.');
    if(vat!==null && total!==null && (vat<0 || vat>total)) {
      warnings.push('VAT exceeds the total. Review the original figures.');
      vat=null;net=null;
    }
    if(net!==null && vat!==null && total!==null && Math.abs(round(net+vat)-total)>0.02){
      warnings.push('Net + VAT does not equal total. Review values manually.');
    }
    let vatRate=null;
    if(vat!==null && net!==null && net>0) {
      const ratio=100*vat/net;
      if(Math.abs(ratio-20)<0.6) vatRate='20';
      if(Math.abs(ratio-5)<0.6) vatRate='5';
      if(vat===0) {
        vatRate=null;
        warnings.push('VAT is zero. Choose zero-rated or exempt treatment manually after checking the receipt.');
      } else if(vatRate===null) {
        warnings.push('VAT does not match a standard 5% or 20% treatment. Review manually.');
      }
    }
    // OCR confidence reflects text recognition, not correctness of financial fields.
    return {
      merchant:merchant?.value || '',
      date:date?.value || '',
      gross:total,
      vat,net,vatRate,
      ocrConfidence:Number.isFinite(ocrConfidence)?Math.round(ocrConfidence):null,
      warnings,
      evidence:{
        merchant:merchant?.source||'',
        date:date?.source||'',
        total:amounts.gross?.source||'',
        vat:amounts.vat?.source||'',
        net:amounts.net?.source||''
      }
    };
  }

  function loadEngine() {
    if (globalThis.Tesseract?.createWorker) return Promise.resolve(globalThis.Tesseract);
    if(enginePromise) return enginePromise;
    enginePromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=ENGINE_URL;
      script.async=true;
      script.crossOrigin='anonymous';
      script.onload=()=>globalThis.Tesseract?.createWorker
        ? resolve(globalThis.Tesseract)
        : reject(Error('OCR library did not initialise.'));
      script.onerror=()=>reject(Error('OCR engine download failed. Check your internet connection and try again.'));
      document.head.appendChild(script);
    }).catch(error=>{enginePromise=null;throw error;});
    return enginePromise;
  }

  async function scanImage(dataUrl, onProgress = () => {}) {
    if(!/^data:image\/(?:jpeg|png|webp);base64,/i.test(dataUrl || '')) {
      throw Error('OCR scanning supports JPG, PNG and WEBP receipt images. For PDFs, enter the details manually or use an image.');
    }
    const Tesseract=await loadEngine();
    let worker;
    try {
      worker=await Tesseract.createWorker('eng',1,{logger:info=>{
        if(info?.status) onProgress({
          status:String(info.status),
          progress:Number.isFinite(info.progress)?Math.round(info.progress*100):null
        });
      }});
      const result=await worker.recognize(dataUrl);
      const rawText=String(result?.data?.text||'');
      if(!rawText.trim()) throw Error('No readable text detected. Try a brighter photo, or enter details manually.');
      return {
        suggestions:parseReceiptText(rawText,Number(result?.data?.confidence)),
        rawText,
        engine:'tesseract.js@5.1.1',
        processedLocally:true
      };
    } finally {
      if(worker) await worker.terminate().catch(()=>{});
    }
  }

  window.EvergreenReceiptOCR=Object.freeze({
    parseReceiptText,
    scanImage,
    engineVersion:'tesseract.js@5.1.1',
    requiresNetworkForFirstUse:true
  });
})();
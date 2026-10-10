(() => {
  'use strict';

  const FORMAT = 'evergreen-accounting-backup';
  const VERSION = 1;
  const COLLECTIONS = [
    'invoices','bills','expenses','bankTransactions','cisRecords',
    'customers','suppliers','payments','vatReturns','ledgerEntries'
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const round = value => Math.round(value * 100) / 100;

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function assertCompleteState(state) {
    if (!isObject(state)) throw Error('Backup must contain an accounting state object.');
    for (const field of ['invoices','bills','expenses']) {
      if (!Array.isArray(state[field])) throw Error('Backup is missing its '+field+' collection.');
    }
    for (const key of COLLECTIONS) {
      if (state[key] !== undefined && !Array.isArray(state[key])) {
        throw Error('Backup has an invalid '+key+' collection.');
      }
    }
    if ((state.expenses||[]).some(expense =>
      !isObject(expense) ||
      (expense.attachmentRef && !expense.attachment) ||
      (expense.attachment && typeof expense.attachment !== 'string')
    )) {
      throw Error('Backup has a missing or invalid receipt attachment. Export a complete backup from the original device.');
    }
    if ((state.invoices||[]).some(item=>!isObject(item)) ||
        (state.bills||[]).some(item=>!isObject(item))) {
      throw Error('Backup contains invalid accounting documents.');
    }
    return state;
  }

  function audit(state) {
    const issues = [];
    const add = (severity,code,message,reference='') => {
      issues.push({severity,code,message,reference});
    };
    if (!isObject(state)) {
      add('error','invalid-state','Accounting state is not an object.');
      return {issues,errorCount:1,warningCount:0,ok:false};
    }

    for (const key of COLLECTIONS) {
      const rows=state[key]??[];
      if (!Array.isArray(rows)) {
        add('error','invalid-collection',key+' is not a list.');
        continue;
      }
      const ids=new Set();
      rows.forEach((row,index)=>{
        if (!isObject(row)) {
          add('error','invalid-record',key+' contains a non-object record.',String(index));
          return;
        }
        const id=String(row.id||'');
        if (!id) add('warning','missing-id',key+' record has no stable identifier.',String(index));
        else if(ids.has(id)) add('error','duplicate-id',key+' contains a duplicate identifier.',id);
        else ids.add(id);

        if (key==='invoices'||key==='bills'||key==='expenses') {
          const amount=Number(row.totalGross??row.grossAmount);
          if(!Number.isFinite(amount)||amount<0) add('error','invalid-amount',key+' has an invalid gross amount.',id);
          const n=Number(row.totalNet??row.netAmount);
          const v=Number(row.totalVat??row.vatAmount);
          if(Number.isFinite(amount)&&Number.isFinite(n)&&Number.isFinite(v)&&
             Math.abs(round(n+v)-round(amount))>0.01){
            add('warning','gross-mismatch',key+' net + VAT does not equal its gross amount.',id);
          }
        }
        if(key==='expenses' && row.attachmentRef && !row.attachment) {
          add('error','missing-receipt', 'Receipt is referenced but not included in the current state.',id);
        }
        if(key==='payments'){
          const amount=Number(row.amount);
          if(!Number.isFinite(amount)||amount<=0) add('error','invalid-payment','Payment amount must be positive.',id);
          const collection=row.documentType==='Invoice' ? state.invoices : row.documentType==='Bill' ? state.bills : [];
          if(!Array.isArray(collection)||!collection.some(doc=>doc.id===row.documentId && doc.type===row.documentType)){
            add('warning','orphan-payment','Payment references a document that is missing.',id);
          }
        }
        if(key==='ledgerEntries') {
          const lines=row.lines;
          if(!Array.isArray(lines)||!lines.length) {
            add('error','empty-journal','Journal has no lines.',id);
          }else{
            let debit=0,credit=0;
            for(const line of lines) {
              const d=Number(line.debit),c=Number(line.credit);
              if(!Number.isFinite(d)||!Number.isFinite(c)||d<0||c<0||(d>0&&c>0)){
                add('error','invalid-journal-line','Journal has an invalid debit or credit.',id);break;
              }
              debit=round(debit+d);credit=round(credit+c);
            }
            if(Math.abs(round(debit-credit))>0.01) add('error','unbalanced-journal','Journal debits and credits do not balance.',id);
          }
        }
      });
    }

    // Cross-check journal-derived reports without changing or repairing records.
    if (window.EvergreenReports?.trialBalance) {
      try {
        const tb=window.EvergreenReports.trialBalance(state);
        if(!Number.isFinite(tb.totalDebit) || !Number.isFinite(tb.totalCredit)) {
          add('error','trial-balance-invalid','Trial Balance contains a non-finite amount.');
        } else if(Math.abs(round(tb.totalDebit-tb.totalCredit))>0.01) {
          add('error','trial-balance-mismatch','Ledger Trial Balance does not balance.');
        }
      } catch(error) {
        add('error','trial-balance-failed','Unable to prepare Trial Balance: '+error.message);
      }
    }
    if (window.EvergreenReports?.balanceSheet) {
      try {
        const balance=window.EvergreenReports.balanceSheet(state);
        if(!Number.isFinite(balance.difference) || Math.abs(balance.difference)>0.01) {
          add('warning','balance-sheet-mismatch','Balance Sheet assets do not equal liabilities plus equity.');
        }
      } catch(error) {
        add('warning','balance-sheet-failed','Balance Sheet could not be checked: '+error.message);
      }
    }

    const errorCount=issues.filter(issue=>issue.severity==='error').length;
    const warningCount=issues.filter(issue=>issue.severity==='warning').length;
    return {issues,errorCount,warningCount,ok:errorCount===0,checkedAt:new Date().toISOString()};
  }

  function cryptoApi() {
    const subtle=globalThis.crypto?.subtle;
    if(!subtle||typeof TextEncoder==='undefined') throw Error('Backup verification requires a secure browser connection with Web Crypto support.');
    return subtle;
  }

  async function sha256(value) {
    const bytes=new TextEncoder().encode(value);
    const digest=await cryptoApi().digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  async function createBackup(state) {
    assertCompleteState(state);
    const stateText=JSON.stringify(state);
    return {
      format:FORMAT,
      version:VERSION,
      exportedAt:new Date().toISOString(),
      checksumAlgorithm:'SHA-256',
      checksum:await sha256(stateText),
      state:clone(state)
    };
  }

  async function readBackup(text) {
    let value;
    try {value=JSON.parse(text);} catch(error){throw Error('Not a valid JSON backup file.');}
    if(!isObject(value)) throw Error('Backup must be a JSON object.');
    if(value.format === FORMAT) {
      if(value.version !== VERSION || value.checksumAlgorithm !== 'SHA-256' ||
         !/^[a-f0-9]{64}$/i.test(value.checksum||'')){
        throw Error('Unrecognised or incomplete Evergreen backup version.');
      }
      if(!isObject(value.state))throw Error('Backup accounting data is missing.');
      const actual=await sha256(JSON.stringify(value.state));
      if(actual!==value.checksum.toLowerCase()) throw Error('Backup checksum failed. The file may be incomplete or altered; no records were restored.');
      assertCompleteState(value.state);
      return {state:clone(value.state),verified:true,legacy:false,exportedAt:value.exportedAt||null};
    }
    if('format' in value || 'checksum' in value) {
      throw Error('Unrecognised backup envelope. No data was restored.');
    }
    assertCompleteState(value);
    return {state:clone(value),verified:false,legacy:true,exportedAt:null};
  }

  window.EvergreenIntegrity=Object.freeze({
    FORMAT,VERSION,
    assertCompleteState,
    audit,
    createBackup,
    readBackup
  });
})();
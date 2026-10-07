(() => {
 'use strict';
 const DB_NAME = 'evergreen-accounting', DB_VERSION = 2;
 const SNAPSHOT_STORE = 'snapshots', RECEIPT_STORE = 'receipts';
 const ENTITY_STORES = ['customers','suppliers','invoices','bills','expenses','payments','bankTransactions','vatReturns','ledgerEntries','cisRecords'];
 const clone = value => JSON.parse(JSON.stringify(value));
 const indexedDbAvailable = () => typeof window !== 'undefined' && Boolean(window.indexedDB);
 function openDatabase() {
  if (!indexedDbAvailable()) return Promise.resolve(null);
  return new Promise((resolve,reject) => {
   let abandoned=false;
   const request = indexedDB.open(DB_NAME,DB_VERSION);
   request.onupgradeneeded = () => {
    const db = request.result;
    [SNAPSHOT_STORE,RECEIPT_STORE,...ENTITY_STORES].forEach(name => {
     if (!db.objectStoreNames.contains(name)) db.createObjectStore(name,{keyPath:'id'});
    });
   };
   request.onsuccess = () => {const db = request.result; if (abandoned) {db.close(); return;} db.onversionchange = () => db.close(); resolve(db);};
   request.onerror = () => reject(request.error || Error('Unable to open local database.'));
   request.onblocked = () => {abandoned=true;reject(Error('Close other Evergreen tabs to finish the storage update.'));};
  });
 }
 function requestAsPromise(request) {
  return new Promise((resolve,reject) => {request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error || Error('Local database read failed.'));});
 }
 function splitReceipts(input) {
  const state = clone(input), receipts = [];
  (state.expenses || []).forEach(expense => {
   if (expense.attachmentRef && !expense.attachment) throw Error('Receipt data is missing. Restore a complete backup before saving.');
   delete expense.attachmentRef;
   if (expense.attachment) {
    if (!expense.id) throw Error('Expense must have an ID before storing its receipt.');
    const id = 'expense:' + expense.id;
    receipts.push({id,data:expense.attachment});
    expense.attachment = null; expense.attachmentRef = id;
   }
  });
  return {state,receipts};
 }
 async function hydrateWithDatabase(db,input) {
  const state=clone(input);
  const expenses=(state.expenses || []).filter(expense=>expense.attachmentRef);
  if (!expenses.length) return state;
  if (!db) throw Error('Receipt storage is unavailable. Reopen Evergreen in its original browser or restore a complete backup.');
  const tx=db.transaction(RECEIPT_STORE,'readonly');
  const records=await Promise.all(expenses.map(expense=>requestAsPromise(tx.objectStore(RECEIPT_STORE).get(expense.attachmentRef))));
  records.forEach((record,index)=>{
   if (!record || typeof record.data !== 'string') throw Error('A stored receipt is missing. Restore a complete backup; existing records have not been replaced.');
   expenses[index].attachment=record.data; delete expenses[index].attachmentRef;
  });
  return state;
 }
 async function hydrateState(input) {
  const db=await openDatabase();
  try {return await hydrateWithDatabase(db,input);} finally {db?.close();}
 }
 async function loadSnapshot() {
  const db=await openDatabase(); if (!db) return null;
  try {
   const record=await requestAsPromise(db.transaction(SNAPSHOT_STORE,'readonly').objectStore(SNAPSHOT_STORE).get('current'));
   return record?.state ? await hydrateWithDatabase(db,record.state) : null;
  } finally {db.close();}
 }
 async function saveSnapshot(input) {
  const normalized=window.EvergreenState?.normalize ? window.EvergreenState.normalize(input) : clone(input);
  const {state,receipts}=splitReceipts(normalized);
  const db=await openDatabase(); if (!db) return false;
  try {
   await new Promise((resolve,reject)=>{
    const tx=db.transaction([SNAPSHOT_STORE,RECEIPT_STORE,...ENTITY_STORES],'readwrite');
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error || Error('Local database save failed.'));
    tx.onabort=()=>reject(tx.error || Error('Local database save cancelled.'));
    try {
     tx.objectStore(SNAPSHOT_STORE).put({id:'current',schemaVersion:window.EvergreenState?.SCHEMA_VERSION || 2,savedAt:new Date().toISOString(),state});
     const receiptStore=tx.objectStore(RECEIPT_STORE); receiptStore.clear(); receipts.forEach(record=>receiptStore.put(record));
     ENTITY_STORES.forEach(name=>{
      const store=tx.objectStore(name); store.clear();
      (Array.isArray(state[name]) ? state[name] : []).forEach((record,index)=>store.put({...record,id:record.id || name+'-'+index}));
     });
    } catch(error) {tx.abort(); reject(error);}
   });
   return true;
  } finally {db.close();}
 }
 async function clearDatabase() {
  if (!indexedDbAvailable()) return false;
  await new Promise((resolve,reject)=>{
   const request=indexedDB.deleteDatabase(DB_NAME);
   request.onsuccess=()=>resolve(); request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(Error('Close other Evergreen tabs before clearing local storage.'));
  });
  return true;
 }
 window.EvergreenStorage=Object.freeze({DB_NAME,DB_VERSION,ENTITY_STORES:[...ENTITY_STORES],indexedDbAvailable,splitReceipts,hydrateState,loadSnapshot,saveSnapshot,clearDatabase});
})();

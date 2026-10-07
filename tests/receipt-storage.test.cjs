'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const clone=value=>JSON.parse(JSON.stringify(value));
function fakeIndexedDB() {
 const stores=new Map([['snapshots',new Map()],...['customers','suppliers','invoices','bills','expenses','payments','bankTransactions','vatReturns','ledgerEntries','cisRecords'].map(name=>[name,new Map()])]);
 const control={stores,failWrite:false};
 const db={
  objectStoreNames:{contains:name=>stores.has(name)},
  createObjectStore(name){stores.set(name,new Map());},
  close(){},
  transaction(names,mode) {
   const tx={error:null}; const list=Array.isArray(names)?names:[names];
   const staged=new Map(list.map(name=>[name,new Map(stores.get(name))]));
   let aborted=false;
   tx.abort=()=>{aborted=true;Promise.resolve().then(()=>tx.onabort?.());};
   tx.objectStore=name=>({
    get(id){const request={};Promise.resolve().then(()=>{request.result=clone(stores.get(name).get(id) ?? null);request.onsuccess?.();});return request;},
    clear(){staged.get(name).clear();},
    put(value){if(control.failWrite) throw Error('Simulated quota failure');staged.get(name).set(value.id,clone(value));}
   });
   if(mode==='readwrite') setTimeout(()=>{if(aborted)return;staged.forEach((records,name)=>stores.set(name,records));tx.oncomplete?.();},0);
   return tx;
  }
 };
 control.api={open(){const request={result:db};Promise.resolve().then(()=>{request.onupgradeneeded?.();request.onsuccess?.();});return request;}};
 return control;
}
async function run() {
 const database=fakeIndexedDB();
 const context={window:{indexedDB:database.api},indexedDB:database.api,console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/core/storage.js'),'utf8'),context);
 const storage=context.window.EvergreenStorage;
 const state={metadata:{saveRevision:1},expenses:[{id:'E1',netAmount:10,attachment:'data:image/jpeg;base64,OLD',receipt:{fileName:'old.jpg'}}],invoices:[],bills:[]};
 assert.equal(await storage.saveSnapshot(state),true);
 const raw=database.stores.get('snapshots').get('current').state;
 assert.equal(raw.expenses[0].attachment,null);
 assert.equal(raw.expenses[0].attachmentRef,'expense:E1');
 assert.equal(database.stores.get('receipts').size,1);
 assert.equal((await storage.loadSnapshot()).expenses[0].attachment,state.expenses[0].attachment);
 assert.equal((await storage.hydrateState(raw)).expenses[0].attachment,state.expenses[0].attachment);
 assert.equal(state.expenses[0].attachmentRef,undefined);
 const portable=JSON.parse(JSON.stringify(await storage.loadSnapshot()));
 assert.equal(portable.expenses[0].attachmentRef,undefined);
 await storage.saveSnapshot({...state,expenses:[]});
 assert.equal(database.stores.get('receipts').size,0);
 await storage.saveSnapshot(portable);
 assert.equal((await storage.loadSnapshot()).expenses[0].attachment,state.expenses[0].attachment);
 database.failWrite=true;
 const replacement={...state,expenses:[{...state.expenses[0],attachment:'data:image/png;base64,NEW'}]};
 await assert.rejects(()=>storage.saveSnapshot(replacement));
 database.failWrite=false;
 assert.equal((await storage.loadSnapshot()).expenses[0].attachment,state.expenses[0].attachment);
 await storage.saveSnapshot(replacement);
 assert.equal(database.stores.get('receipts').size,1);
 assert.equal((await storage.loadSnapshot()).expenses[0].attachment,'data:image/png;base64,NEW');
 await storage.saveSnapshot({...state,expenses:[{...state.expenses[0],attachment:null,receipt:null}]});
 assert.equal(database.stores.get('receipts').size,0);
 await storage.saveSnapshot(state);
 database.stores.get('receipts').clear();
 await assert.rejects(()=>storage.loadSnapshot());
 database.stores.get('snapshots').set('current',{state});
 assert.equal((await storage.loadSnapshot()).expenses[0].attachment,state.expenses[0].attachment);
 context.window.indexedDB=null;
 assert.equal(await storage.saveSnapshot(state),false);
 console.log('Receipt storage migration, atomic save, hydration, replacement and deletion checks passed.');
}
module.exports=run();

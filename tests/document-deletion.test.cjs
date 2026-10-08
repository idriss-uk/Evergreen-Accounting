'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const fn=html.match(/async function deleteDoc\([\s\S]*?(?=\n        (?:async )?function )/)[0];
const run=new Function('state','linked',`
 let appState=state;const window={EvergreenBankEntries:{documentLinked:()=>linked}};
 async function saveState(){} function renderSalesTable(){} function renderPurchasesTable(){} function renderExpensesTable(){} function renderContacts(){} function renderDashboard(){} function showToast(){}
 ${fn}
 return (async()=>{await deleteDoc('sales','SAME-ID');return appState;})();
`);
const fixture=()=>({invoices:[{id:'SAME-ID',type:'Invoice'}],bills:[{id:'SAME-ID',type:'Bill'}],expenses:[],payments:[{id:'SALE-PAY',documentType:'Invoice',documentId:'SAME-ID'},{id:'BILL-PAY',documentType:'Bill',documentId:'SAME-ID'}],ledgerEntries:[{sourceType:'Invoice',sourceId:'SAME-ID'},{sourceType:'Bill',sourceId:'SAME-ID'},{sourceType:'Payment',sourceId:'SALE-PAY'},{sourceType:'Payment',sourceId:'BILL-PAY'}]});
(async()=>{
 const state=await run(fixture(),false);assert.equal(state.invoices.length,0);assert.equal(state.bills.length,1);assert.equal(state.payments.length,1);assert.equal(state.payments[0].id,'BILL-PAY');assert.equal(state.ledgerEntries.length,2);assert.equal(state.ledgerEntries[0].sourceType,'Bill');assert.equal(state.ledgerEntries[1].sourceId,'BILL-PAY');
 const protectedState=fixture(),before=JSON.stringify(protectedState);await run(protectedState,true);assert.equal(JSON.stringify(protectedState),before);
 console.log('Linked document and payment journal deletion safeguards passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});

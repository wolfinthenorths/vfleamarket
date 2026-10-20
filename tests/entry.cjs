/* Startup UI logic only. No browser account, real Telegram token or network. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
function launch({authenticated,pending=false}){
 const nodes=new Map();
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{open:false,innerHTML:'',addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},classList:{add(){},remove(){}}});return nodes.get(selector);};
 let requests=0;
 const context={document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},window:{Telegram:{WebApp:{initData:authenticated?'signed-test-launch':'',initDataUnsafe:{user:{id:12345}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){}}}},location:{hash:''},localStorage:{getItem:key=>key.includes('pending')&&pending?JSON.stringify({orderId:'11111111-1111-4111-8111-111111111111'}):null},URLSearchParams,Intl,matchMedia:()=>({matches:false}),addEventListener(){},fetch(){requests++;return new Promise(()=>{});}};
 vm.runInNewContext(source,context);
 return {dialog:node('#sheet'),content:node('#sheet-content'),requests};
}
const fresh=launch({authenticated:true});assert.equal(fresh.dialog.open,true);assert.match(fresh.content.innerHTML,/Представься/);assert.equal(fresh.requests,1);
const guest=launch({authenticated:false});assert.equal(guest.dialog.open,false);assert.equal(guest.requests,1);
const recovery=launch({authenticated:true,pending:true});assert.equal(recovery.dialog.open,false);assert.equal(recovery.requests,1);
console.log('3 startup checks passed: identity opens before catalog loading; guests and pending-payment recovery remain separate.');

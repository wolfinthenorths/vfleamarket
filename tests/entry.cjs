/* Startup UI logic only. No browser account, real Telegram token or network. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
function launch({authenticated,pending=false}){
 const nodes=new Map();
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{open:false,innerHTML:'',setAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},classList:{add(){},remove(){},toggle(){}}});return nodes.get(selector);};
 let requests=0;
 const context={document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},window:{Telegram:{WebApp:{initData:authenticated?'signed-test-launch':'',initDataUnsafe:{user:{id:12345}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){}}}},location:{hash:''},localStorage:{getItem:key=>key.includes('pending')&&pending?JSON.stringify({orderId:'11111111-1111-4111-8111-111111111111'}):null},URLSearchParams,Intl,AbortController,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:false}),addEventListener(){},fetch(){requests++;return new Promise(()=>{});}};
 vm.runInNewContext(source,context);
 return {dialog:node('#sheet'),content:node('#sheet-content'),wallet:node('#balance-label'),requests};
}
const fresh=launch({authenticated:true});assert.equal(fresh.dialog.open,true);assert.match(fresh.content.innerHTML,/Назови свое имя и торговцы сразу же предложат товар!/);assert.match(fresh.content.innerHTML,/Добро пожаловать на Блошиный рынок!/);assert.match(fresh.content.innerHTML,/data-close/);assert.equal(fresh.requests,2);
const guest=launch({authenticated:false});assert.equal(guest.dialog.open,false);assert.equal(guest.requests,1);
assert.match(fresh.wallet.innerHTML,/Загружается…/);assert.match(fresh.wallet.innerHTML,/wallet-spinner/);assert.doesNotMatch(fresh.wallet.innerHTML,/Выбрать/);
const recovery=launch({authenticated:true,pending:true});assert.equal(recovery.dialog.open,false);assert.equal(recovery.requests,1);
console.log('3 startup checks passed: identity opens before catalog loading; guests and pending-payment recovery remain separate.');

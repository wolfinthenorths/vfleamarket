/* No network or browser: exercise request races using the real view module. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/backpack.js'),'utf8');
let now=1000;const storage=new Map();
const context={window:{},localStorage:{getItem:key=>storage.get(key)||null},Date:{now:()=>now},Map,JSON,Promise};
vm.runInNewContext(source,context);
const view=context.window.BackpackView;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
(async()=>{
 let calls=0,next=deferred();const api=()=>{calls++;return next.promise;};
 const opts={api,scope:'one'};
 const a=view.preload(opts),b=view.preload(opts);await Promise.resolve();assert.equal(calls,1,'navigation shares the in-flight request');
 next.resolve({ok:true,items:[],pack:{branchId:'2.4'}});await Promise.all([a,b]);
 await view.preload(opts);assert.equal(calls,1,'fresh inventory is reused');
 storage.set('flea:branch:v1:one','2.4');await view.preload(opts);assert.equal(calls,1,'auto-selected branch shares the snapshot');
 now+=31000;next=deferred();const oldDeferred=next;const old=view.preload(opts);await Promise.resolve();assert.equal(calls,2);
 view.invalidate('one');const fresh=deferred();next=fresh;const afterPurchase=view.preload(opts);await Promise.resolve();assert.equal(calls,3,'purchase never reuses the old request');
 // Resolve the newer read first; the older read must not replace its snapshot.
 fresh.resolve({ok:true,items:[{id:'new'}],pack:{branchId:'2.4'}});await afterPurchase;
 oldDeferred.resolve({ok:true,items:[],pack:null});await old;
 await view.preload(opts);assert.equal(calls,3,'late old response cannot evict the newer snapshot');
 view.invalidate('one');const stale=deferred();next=stale;const staleRead=view.preload(opts);await Promise.resolve();
 view.invalidate('one');stale.resolve({ok:true,items:[],pack:null});await staleRead;
 next=Promise.resolve({ok:true,items:[{id:'fresh'}],pack:null});
 await view.preload({scope:'two',api:()=>{calls++;return next;}});assert.equal(calls,5,'accounts never share snapshots');
 next=deferred();const retry=view.preload(opts);await Promise.resolve();assert.equal(calls,6,'invalidated read cannot refill the cache');next.resolve({ok:true,items:[],pack:null});await retry;
 view.invalidate('one');next=deferred();const failed=view.preload(opts);await Promise.resolve();next.reject(new Error('offline'));await failed;
 next=deferred();const recovery=view.preload(opts);await Promise.resolve();assert.equal(calls,8,'failed reads can be retried');next.resolve({ok:true,items:[],pack:null});await recovery;
 console.log('Inventory loading checks passed: shared requests, fresh snapshots, branch aliases, mutation races, account isolation and retry.');
})().catch(error=>{console.error(error);process.exitCode=1;});

/* Real route handlers, fake DOM only; no browser accounts or network. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const events={},nodes=new Map(),location={hash:''};let y=0;
const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',value:'',insertAdjacentHTML(where,html){this.innerHTML=where==='afterbegin'?html+this.innerHTML:this.innerHTML+html;},addEventListener(event,fn){this[event]=fn;},setAttribute(){},classList:{add(){},remove(){},toggle(){}},close(){},showModal(){}});return nodes.get(key);};
const document={querySelector:node,querySelectorAll:()=>[],addEventListener:(event,fn)=>events['document:'+event]=fn};
const initialCarts={kirk:{'kirk-15':1},nuka:{'nuka-04':2}};
const context={document,location,history:{},window:{get scrollY(){return y;},scrollTo({top}){y=top;}},localStorage:{getItem:key=>key.includes(':cart:')?JSON.stringify(initialCarts):null,setItem(){}},URLSearchParams,Intl,AbortController,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:false}),addEventListener:(event,fn)=>events[event]=fn,fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(root+'/public/catalog.json','utf8'))})};
vm.runInNewContext(fs.readFileSync(root+'/public/app.js','utf8'),context);
const scroll=top=>{y=top;events.scroll();};
const navigate=hash=>{location.hash=hash;y=0;events.scroll();events.hashchange();};
setImmediate(()=>{
 try{
  scroll(930);navigate('#shop/kirk');assert.equal(y,0,'new store starts at top');
  scroll(460);navigate('');assert.equal(y,930,'return restores the market list');
  navigate('#shop/kirk');assert.equal(y,460,'store remembers its own position');
  scroll(720);navigate('#shop/nuka');assert.equal(y,0,'another store has its own position');
  navigate('#shop/kirk');assert.equal(y,720);navigate('');assert.equal(y,930);
  assert.equal(context.history.scrollRestoration,'manual');
  assert.match(node('#cart-total').textContent,/570/);
  navigate('#carts/kirk');assert.match(node('#main').innerHTML,/Всего во всех корзинах[\s\S]*570/);assert.match(node('#main').innerHTML,/Списать|К торговым|К покупке|Открыть в Telegram/);
  navigate('#shop/kirk');assert.match(node('#store-cart-holder').innerHTML,/Все корзины[\s\S]*570/);
  const click=(id,delta)=>events['document:click']({target:{closest:()=>({tagName:'BUTTON',dataset:{change:id,delta:String(delta)},hasAttribute:()=>false})}});
  click('nuka-04',-1);assert.match(node('#cart-total').textContent,/480/);
  click('kirk-15',-1);assert.match(node('#cart-total').textContent,/90/);
  click('nuka-04',-1);assert.equal(node('#cart-total').hidden,true);assert.equal(node('#store-cart-holder').innerHTML,'');
  console.log('Navigation checks passed: home/store positions survive hash jumps and repeated returns.');
 }catch(error){console.error(error);process.exitCode=1;}
});

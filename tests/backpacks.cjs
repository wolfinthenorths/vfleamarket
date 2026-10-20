/* Execute production inventory Apps Script with isolated sheets; no live Google writes. */
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const catalog=require('../public/catalog.json'),source=fs.readFileSync(__dirname+'/../google/inventory.gs','utf8');
const mainId='1cYEfxasIAu61BtAQEZBHV4yV5Ghm7_-BL_SsSFoiBG8';
const branchIds={'2.1':'1ZWrUrC8hP7YRWsbk6CW7NP90yfhqo2llaB07i0WKjXo','2.2':'17gNasLpRDTs-fBl5g2-pfaAhL-T_yzS1MRxE4dHUB3c','2.3':'1KKhAAbmpaBLfQyoqDqScRiMKpnsyy0bS3VuRudEhs0w','2.4':'1yjrofHY7lK05bquay67_s3QerANAlsUhM7boktqSWto'};
function a1(text){const m=text.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);assert(m,text);const col=s=>[...s].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0);return [Number(m[2]),col(m[1]),m[4]?Number(m[4])-Number(m[2])+1:1,m[3]?col(m[3])-col(m[1])+1:1];}
class Sheet{
 constructor(id,name,book){this.id=id;this.name=name;this.book=book;this.values={};this.notes={};this.formulas={};this.invalidCapacity=false;}
 getName(){return this.name;}setName(name){if(this.book.sheets.some(s=>s!==this&&s.name===name))throw Error('duplicate');this.name=name;return this;}
 getSheetId(){return this.id;}getDataRange(){return this.getRange(1,1,100,26);}
 copyTo(book){const copy=new Sheet(900+book.sheets.length,'Copy '+this.name,book);copy.values={...this.values};copy.notes={...this.notes};copy.formulas={...this.formulas};book.sheets.push(copy);return copy;}
 getRange(r,c,h=1,w=1){if(typeof r==='string')[r,c,h,w]=a1(r);const sheet=this,key=(i,j)=>(r+i)+':'+(c+j),range={
  getValue:()=>sheet.values[key(0,0)]??'',getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>sheet.values[key(i,j)]??'')),
  getDisplayValue:()=>r===15&&c===19?(sheet.invalidCapacity?'#N/A':(10+2*Math.floor(Number(sheet.values['16:2']||8)/2-5)+(sheet.values['2:3']==='Райдер'?1:0))+' слотов'):String(sheet.values[key(0,0)]??''),
  getFormula:()=>sheet.formulas[key(0,0)]||'',getFormulas:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>sheet.formulas[key(i,j)]||'')),getNote:()=>sheet.notes[key(0,0)]||'',
  getDisplayValues:()=>range.getValues().map(row=>row.map(String)),getDataValidations:()=>Array.from({length:h},()=>Array(w).fill(null)),
  setValue(value){sheet.values[key(0,0)]=value;return range;},setValues(values){values.forEach((row,i)=>row.forEach((v,j)=>sheet.values[key(i,j)]=v));return range;},
  setFormula(value){sheet.formulas[key(0,0)]=value;return range;},clearContent(){for(let i=0;i<h;i++)for(let j=0;j<w;j++){delete sheet.values[key(i,j)];delete sheet.formulas[key(i,j)];}return range;},clearNote(){delete sheet.notes[key(0,0)];return range;}
 };return range;}
}
function fixture(){
 let nextId=1,writes=0;
 const books={};for(const id of [mainId,...Object.values(branchIds)])books[id]={id,sheets:[],getSheets(){return this.sheets;}};
 const add=(book,name)=>{const s=new Sheet(nextId++,name,books[book]);books[book].sheets.push(s);return s;};
 const main=add(mainId,'Эшвейл');main.getRange('C2').setValue('Райдер');main.getRange('B10:B15').setValues([[17],[15],[13],[14],[12],[17]]);main.getRange('B17:B36').setValues(Array.from({length:20},()=>['✓']));
 const setup=(s)=>{s.getRange('C2').setValue('Райдер');s.getRange('O14').setValue('Рюкзак');s.getRange('O15').setValue('Количество слотов');s.getRange('B16').setValue(8);s.getRange('S15').setFormula('=capacity');return s;};
 const pack=setup(add(branchIds['2.4'],'Эшвейл')),other=setup(add(branchIds['2.1'],'Template'));
 const character={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Эшвейл'},user={id:'12345',username:'owner'};
 const orders=[],bank={characters:[character],ledger:orders};
 const context=vm.createContext({console,Date,JSON,Number,String,Math,Error,Set,
  fmError_:code=>{throw new Error(code);},fmNow_:()=> '20.10.2026 12:00',fmCatalog_:()=>catalog,fmRows_:ledger=>ledger,
  fmParseOrder_:entry=>JSON.parse(entry.values[5]),fmCurrent_:(_bank,_report,u)=>u.id===user.id?character:null,
  Utilities:{Charset:{UTF_8:1},DigestAlgorithm:{SHA_256:1},computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text).digest()]},
  SpreadsheetApp:{openById:id=>{assert(books[id],id);return books[id];},flush(){}},
  Sheets:{Spreadsheets:{batchUpdate(body,id){assert(books[id],id);writes++;for(const request of body.requests){const q=request.updateCells;assert(q);const sheet=books[id].sheets.find(s=>s.id===q.start.sheetId);assert(sheet);q.rows.forEach((row,i)=>row.values.forEach((cell,j)=>{const key=(q.start.rowIndex+1+i)+':'+(q.start.columnIndex+1+j);if(q.fields.includes('userEnteredValue')){if(cell.userEnteredValue?.formulaValue)sheet.formulas[key]=cell.userEnteredValue.formulaValue;else sheet.values[key]=cell.userEnteredValue?.stringValue??cell.userEnteredValue?.numberValue??'';}if(q.fields.includes('note'))sheet.notes[key]=cell.note;}));}}}}
 });
 vm.runInContext(source,context);
 const purchase=(quantity=2)=>{const item=catalog.shops[0].items[0],id='receipt-'+orders.length;orders.push([id,'',character.id,user.id,0,JSON.stringify({id,userId:user.id,character,lines:[{id:item.id,name:item.name,quantity,slots:item.slots}]}),true]);};purchase();
 const run=(action='market_inventory',fields={})=>JSON.parse(JSON.stringify(context.fmInventoryDispatch_({action,branchId:'2.4',...fields},bank,{},fields.user||user)));
 const save=(inventory,quantity,extra={})=>run('market_pack_save',{version:inventory.pack.version,requestId:'11111111-1111-4111-8111-111111111111',items:quantity?[{id:'count-01',quantity}]:[],...extra});
 return {books,main,pack,other,orders,purchase,run,save,user,get writes(){return writes;}};
}
let tests=0;function test(name,fn){fn();tests++;console.log('PASS',name);}
test('full ownership includes purchases older than the former 25-order window',()=>{const f=fixture();for(let i=0;i<30;i++)f.purchase(1);assert.equal(f.run().items[0].quantity,32);});
test('inventory mirror is idempotent and preserves manual starting possessions',()=>{const f=fixture();f.main.getRange('H25').setValue('Ментаты × 3');let r=f.run();assert.equal(r.items[0].quantity,5);const count=f.writes;r=f.run();assert.equal(r.items[0].quantity,5);assert.equal(f.writes,count);assert.match(f.main.getRange('H25').getValue(),/Ментаты × 3/);});
test('backpack saves update visible cells without debiting or removing inventory',()=>{const f=fixture(),r=f.run();assert.equal(r.pack.capacity,9);const saved=f.save(r,2);assert.equal(saved.pack.used,2);assert.equal(saved.items[0].quantity,2);assert.match(f.pack.getRange('R17').getValue(),/Ментаты × 2/);assert.equal(f.orders.length,1);});
test('ownership and capacity are both checked on the server',()=>{const f=fixture(),r=f.run();assert.throws(()=>f.save(r,3),/item_not_owned/);f.purchase(20);assert.throws(()=>f.save(f.run(),10),/pack_full/);});
test('changed strength rejects stale saves; an existing overload never deletes contents',()=>{const f=fixture();f.purchase(8);let r=f.run();r=f.save(r,9);f.pack.getRange('B16').setValue(6);assert.throws(()=>f.save(r,1,{requestId:'22222222-2222-4222-8222-222222222222'}),/pack_changed/);const updated=f.run();assert.equal(updated.pack.capacity,7);assert.equal(updated.pack.used,9);assert.match(f.pack.getRange('R17').getValue(),/× 9/);});
test('lost save response can replay the same request without double counting',()=>{const f=fixture(),r=f.run();f.save(r,2);const count=f.writes;assert.equal(f.save(r,2).pack.used,2);assert.equal(f.writes,count);assert.throws(()=>f.save(r,1),/id_conflict/);});
test('concurrent tabs cannot overwrite a newer backpack',()=>{const f=fixture(),r=f.run();f.save(r,2);assert.throws(()=>f.save(r,1,{requestId:'22222222-2222-4222-8222-222222222222'}),/pack_changed/);});
test('missing master sheet gives exact waiting message and creates nothing',()=>{const f=fixture();f.books[mainId].sheets=[];const before=f.books[branchIds['2.1']].sheets.length;assert.equal(f.run().notice,'Дождитесь своего листа или напомните о нем!');assert.equal(f.run('market_branch_join',{branchId:'2.1'}).waiting,true);assert.equal(f.books[branchIds['2.1']].sheets.length,before);});
test('explicit branch choice creates a native sheet and transfers source stats',()=>{const f=fixture();const r=f.run('market_branch_join',{branchId:'2.1'});assert.equal(r.pack.branchId,'2.1');assert.equal(r.pack.capacity,17);const s=f.books[branchIds['2.1']].sheets.find(s=>s.name==='Эшвейл');assert.equal(s.getRange('B16').getValue(),17);assert.equal(s.getRange('B23').getValue(),'✓');const n=f.books[branchIds['2.1']].sheets.length;f.run('market_branch_join',{branchId:'2.1'});assert.equal(f.books[branchIds['2.1']].sheets.length,n);});
test('different characters receive all six of their own stats, never template defaults',()=>{
 for(const stats of [[17,15,13,14,12,17],[12,11,15,14,14,16],[13,16,16,13,15,10]]){
  const f=fixture();f.main.getRange('B10:B15').setValues(stats.map(value=>[value]));f.run('market_branch_join',{branchId:'2.1'});
  const created=f.books[branchIds['2.1']].sheets.find(s=>s.name==='Эшвейл');assert.deepEqual(created.getRange('B16:B21').getValues(),stats.map(value=>[value]));
 }
});
test('blank source stats never fall back to another character or template values',()=>{const f=fixture();f.main.getRange('B10').clearContent();assert.equal(f.run().notice,'Характеристики персонажа еще не заполнены.');const before=f.books[branchIds['2.1']].sheets.length;assert.throws(()=>f.run('market_branch_join',{branchId:'2.1'}),/invalid_character_stats/);assert.equal(f.books[branchIds['2.1']].sheets.length,before);});
test('branches keep independent contents',()=>{const f=fixture();f.save(f.run(),2);let r=f.run('market_branch_join',{branchId:'2.1'});r=f.save(r,1,{branchId:'2.1'});assert.equal(r.pack.used,1);assert.equal(f.run().pack.used,2);});
test('manual backpack items count towards slots and are preserved',()=>{const f=fixture();f.purchase(3);f.pack.getRange('R17').setValue('Ментаты × 3');let r=f.run();assert.equal(r.pack.manualSlots,3);assert.throws(()=>f.save(r,3),/item_not_owned/);r=f.save(r,2);assert.equal(r.pack.used,5);assert.match(f.pack.getRange('R17').getValue(),/× 3/);});
test('unknown manual items and broken capacity formulas fail safely',()=>{const f=fixture();f.pack.getRange('V17').setValue('Семейная реликвия');let r=f.run();assert.throws(()=>f.save(r,1),/manual_slots_unknown/);f.pack.invalidCapacity=true;assert.throws(()=>f.run(),/invalid_capacity/);});
test('unknown branches, forged owners, duplicate item ids and formulas cannot write',()=>{const f=fixture(),r=f.run();assert.throws(()=>f.run('market_inventory',{user:{id:'999'}}),/not_bound/);assert.throws(()=>f.run('market_branch_join',{branchId:'9.9'}),/invalid_branch/);assert.throws(()=>f.save(r,1,{items:[{id:'count-01',quantity:1},{id:'count-01',quantity:1}]}),/invalid_pack/);f.main.getRange('H25').setFormula('=SUM(1)');assert.throws(()=>f.run(),/inventory_formula/);});
console.log(`${tests} backpack checks passed; zero live balances or backpacks used.`);

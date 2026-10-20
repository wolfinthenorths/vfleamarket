/* Execute the actual Apps Script module against an isolated Sheets API model.
   No Google account, real player or real balance is used by these tests. */
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const source=fs.readFileSync(root+'/google/catalog.gs','utf8')+'\n'+fs.readFileSync(root+'/google/market.gs','utf8');
const catalog=JSON.parse(fs.readFileSync(root+'/public/catalog.json','utf8'));
const bankId='1iuFkiLPEaA770-iBCLJKuHaLkCY-_43GpY4xcrcwaX4',reportId='11kCbQm19YVnQ3Jw4Z9iActhsLIayuDeBsz8Obywq3Bc';
class Sheet{
 constructor(id,name,headers){this.id=id;this.name=name;this.rows=[headers];this.formulas={};this.notes={};}
 getSheetId(){return this.id;}getMaxColumns(){return 32;}getLastRow(){return this.rows.length;}
 getRange(row,col,height=1,width=1){const s=this;return {getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>s.rows[row-1+i]?.[col-1+j]??'')),getFormula:()=>s.formulas[row+':'+col]||'',getNote:()=>s.notes[row+':'+col]||''};}
}
function fixture(){
 const bank=new Sheet(1,'Крышки',['Участники','','','','','','','','Покупки на Блошином рынке','Итого','ID персонажа']);
 bank.rows.push(['Test Survivor',0,0,0,0,0,0,0,'',1000,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);bank.formulas['2:10']='=1000-I2';
 const ledger=new Sheet(2,'_Покупки_бот',['ID заказа','Отпечаток запроса','ID персонажа','Telegram ID','UTC','Квитанция JSON','Отчёт синхронизирован']);
 const orders=new Sheet(3,'Заказы',['Когда (Томск)','Номер заказа','Персонаж','Telegram','Telegram ID','Магазин','Предметов','Списано крышек','Баланс до','Баланс после','Статус','Квитанция JSON']);
 const items=new Sheet(4,'Покупки',['Когда (Томск)','Номер заказа','Персонаж','Telegram','Магазин','Предмет','Количество','Цена за шт.','Сумма','Слотов','Telegram ID']);
 const players=new Sheet(5,'Игроки',['Персонаж','Telegram ID','Telegram','ID персонажа','Когда привязан (Томск)','Статус']);players.rows.push(['Test Survivor','12345','@player','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','','Привязан']);
 const books={[bankId]:[bank,ledger],[reportId]:[orders,items,players]};
 const flags={reportFail:false,uncertain:false,locked:false,bankCommits:0};
 const context=vm.createContext({console,Date,JSON,Set,Number,String,Math,Error,
  Utilities:{Charset:{UTF_8:1},DigestAlgorithm:{SHA_256:1},formatDate:()=> '20.10.2026 04:00:00',computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest())},
  CacheService:{getScriptCache:()=>({get:()=>JSON.stringify(catalog),put(){}})},
  SpreadsheetApp:{openById:id=>({getSheetByName:name=>books[id].find(s=>s.name===name)}),flush(){}},
  LockService:{getScriptLock:()=>({tryLock:()=>!flags.locked,releaseLock(){}})},
  Sheets:{Spreadsheets:{batchUpdate(body,id){
    if(id===reportId&&flags.reportFail)throw new Error('unavailable');
    // Sheets validates the entire batch before applying any request.
    for(const r of body.requests){const q=r.updateCells||r.appendCells;assert(books[id].some(s=>s.id===(q.start?.sheetId??q.sheetId)));}
    for(const r of body.requests){
      const q=r.updateCells||r.appendCells,s=books[id].find(s=>s.id===(q.start?.sheetId??q.sheetId));
      const start=q.start?.rowIndex??s.rows.length,col=q.start?.columnIndex??0;
      for(let j=0;j<q.rows.length;j++){const row=s.rows[start+j]||(s.rows[start+j]=[]);q.rows[j].values.forEach((cell,k)=>{if(q.fields.includes('userEnteredValue')){const u=cell.userEnteredValue;if(u)row[col+k]=u.stringValue??u.numberValue??u.boolValue??u.formulaValue??'';}if(q.fields.includes('note')&&cell.note!==undefined)s.notes[(start+j+1)+':'+(col+k+1)]=cell.note;});}
      if(s===bank)bank.rows[1][9]=1000-Number(bank.rows[1][8]);
    }
    if(id===bankId&&body.requests.some(r=>r.appendCells)){flags.bankCommits++;if(flags.uncertain){flags.uncertain=false;throw new Error('response lost after commit');}}
  }}}
 });
 vm.runInContext(source,context);
 context.Sheets.Spreadsheets.get=(id,{ranges})=>({sheets:ranges.map(range=>{
  const name=range.match(/^'([^']+)'!/)[1],s=books[id].find(s=>s.name===name);assert(s);
  return {properties:{sheetId:s.id,title:s.name},data:[{rowData:s.rows.map((row,i)=>({values:row.map((v,j)=>({effectiveValue:typeof v==='number'?{numberValue:v}:typeof v==='boolean'?{boolValue:v}:{stringValue:String(v)},userEnteredValue:s.formulas[(i+1)+':'+(j+1)]?{formulaValue:s.formulas[(i+1)+':'+(j+1)]}:{},note:s.notes[(i+1)+':'+(j+1)]||''}))}))}]};
 })});
 const user={id:'12345',username:'player'},request={action:'market_checkout',user,orderId:'11111111-1111-4111-8111-111111111111',shopId:'count',revision:catalog.revision,expectedTotal:460,items:[{id:'count-01',quantity:2}]};
 const run=p=>JSON.parse(JSON.stringify(context.marketDispatch_({...request,...p})));
 return {bank,ledger,orders,items,players,flags,run,request,setRevision:value=>vm.runInContext('FM_CATALOG_DATA.revision='+JSON.stringify(value),context)};
}
let tests=0;function test(name,fn){fn();tests++;console.log('PASS',name);}
function reconcile(f){assert.equal(f.run({action:'market_reconcile'}).ok,true);}
test('payment returns its durable receipt before background mirrors',()=>{const f=fixture(),r=f.run();assert.equal(r.ok,true);assert.equal(r.reportSynced,false);assert.equal(f.bank.rows[1][8],460);assert.equal(f.bank.rows[1][9],540);assert.equal(f.bank.formulas['2:10'],'=1000-I2');assert.equal(f.ledger.rows.length,2);assert.equal(f.orders.rows.length,1);assert.equal(f.ledger.rows[1][6],false);reconcile(f);assert.equal(f.orders.rows.length,2);assert.equal(f.items.rows[1][6],2);assert.equal(f.items.rows[1][8],460);assert.match(f.bank.notes['2:9'],/Ментаты × 2/);assert.equal(f.ledger.rows[1][6],true);});
test('double click and retry produce one receipt and one debit',()=>{const f=fixture();f.run();const r=f.run();assert.equal(r.replayed,true);assert.equal(f.flags.bankCommits,1);reconcile(f);assert.equal(f.orders.rows.length,2);});
test('uncertain successful bank commit is recovered by the same id',()=>{const f=fixture();f.flags.uncertain=true;assert.equal(f.run().error,'connection_failed');const r=f.run();assert.equal(r.ok,true);assert.equal(r.replayed,true);assert.equal(f.flags.bankCommits,1);assert.equal(f.bank.rows[1][8],460);reconcile(f);assert.equal(f.orders.rows.length,2);});
test('report outage does not lose a paid order and reconciliation is idempotent',()=>{const f=fixture();f.flags.reportFail=true;assert.equal(f.run().ok,true);assert.equal(f.ledger.rows[1][6],false);f.flags.reportFail=false;assert.equal(f.run({action:'market_reconcile'}).synced,1);assert.equal(f.run({action:'market_reconcile'}).synced,0);assert.equal(f.orders.rows.length,2);assert.equal(f.items.rows.length,2);});
test('insufficient money leaves all sheets unchanged',()=>{const f=fixture();assert.equal(f.run({items:[{id:'count-01',quantity:5}],expectedTotal:1150}).error,'not_enough_caps');assert.equal(f.bank.rows[1][8],'');assert.equal(f.ledger.rows.length,1);assert.equal(f.orders.rows.length,1);});
test('server ignores spoofed totals and rejects mixed shops',()=>{const f=fixture();assert.equal(f.run({expectedTotal:1}).error,'catalog_changed');assert.equal(f.run({items:[{id:'kirk-01',quantity:1}]}).error,'invalid_cart');assert.equal(f.flags.bankCommits,0);});
test('same id with changed cart cannot debit again',()=>{const f=fixture();f.run();assert.equal(f.run({items:[{id:'count-01',quantity:1}],expectedTotal:230}).error,'id_conflict');assert.equal(f.flags.bankCommits,1);});
test('changing Telegram account cannot read or replay someone else receipt',()=>{const f=fixture();f.run();assert.equal(f.run({user:{id:'67890',username:'other'}}).error,'id_conflict');assert.equal(f.run({action:'market_order',user:{id:'67890',username:'other'}}).error,'order_not_found');});
test('expired catalog cannot buy, but can replay an old paid order',()=>{const f=fixture();assert.equal(f.run({revision:'0000000000000000'}).error,'catalog_changed');f.run();f.setRevision('9999999999999999');assert.equal(f.run().replayed,true);});
test('expenses formula and script lock both block a purchase',()=>{const f=fixture();f.bank.formulas['2:9']='=10';assert.equal(f.run().error,'balance_formula');delete f.bank.formulas['2:9'];f.flags.locked=true;assert.equal(f.run().error,'busy');assert.equal(f.flags.bankCommits,0);});
test('reading state does not wait for the payment write lock',()=>{const f=fixture();f.flags.locked=true;assert.equal(f.run({action:'market_state'}).ok,true);assert.equal(f.flags.bankCommits,0);});
test('initial claim is unique and subsequent account switching is blocked',()=>{const f=fixture();assert.equal(f.run({action:'market_bind',user:{id:'67890',username:'other'},characterId:f.bank.rows[1][10]}).error,'character_taken');assert.equal(f.run({action:'market_bind',characterId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}).error,'already_bound');});
test('first claim requires the roster username and records the signed numeric id',()=>{
 const f=fixture();f.players.rows[1][1]='';f.players.rows[1][2]='@PlAyEr';
 const state=f.run({action:'market_state'});assert.equal(state.availableCharacters.length,1);assert.equal(state.availableCharacters[0].id,f.bank.rows[1][10]);
 assert.equal(f.run({action:'market_bind',characterId:f.bank.rows[1][10]}).ok,true);
 assert.equal(f.players.rows[1][1],'12345');assert.equal(f.players.rows[1][2],'@player');assert.equal(f.flags.bankCommits,0);
});
test('wrong username cannot see or claim an unbound character',()=>{
 const f=fixture();f.players.rows[1][1]='';
 const user={id:'67890',username:'other'};
 assert.equal(f.run({action:'market_state',user}).availableCharacters.length,0);
 assert.equal(f.run({action:'market_bind',user,characterId:f.bank.rows[1][10]}).error,'character_not_allowed');
 assert.equal(f.players.rows[1][1],'');assert.equal(f.flags.bankCommits,0);
});
test('blank roster username and missing Telegram username cannot claim',()=>{
 const f=fixture();f.players.rows[1][1]='';f.players.rows[1][2]='';
 assert.equal(f.run({action:'market_bind',characterId:f.bank.rows[1][10]}).error,'character_not_allowed');
 assert.equal(f.run({action:'market_bind',user:{id:'12345',username:''},characterId:f.bank.rows[1][10]}).error,'username_required');
});
test('duplicate roster mapping fails closed without changing ids or balances',()=>{
 const f=fixture();f.players.rows[1][1]='';f.players.rows.push([...f.players.rows[1]]);
 assert.equal(f.run({action:'market_state'}).error,'schema_changed');
 assert.equal(f.run({action:'market_bind',characterId:f.bank.rows[1][10]}).error,'schema_changed');assert.equal(f.flags.bankCommits,0);
});
test('bound numeric id survives a username change and a recycled username cannot claim',()=>{
 const f=fixture();assert.equal(f.run({action:'market_state',user:{id:'12345',username:'new_name'}}).character.name,'Test Survivor');
 assert.equal(f.run({action:'market_state',user:{id:'67890',username:'player'}}).availableCharacters.length,0);
 assert.equal(f.run({action:'market_bind',user:{id:'67890',username:'player'},characterId:f.bank.rows[1][10]}).error,'character_taken');
});
console.log(`${tests} transaction tests passed; zero live balances used.`);

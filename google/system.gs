/** Shared character state for the existing HMAC bridge. No public endpoint.
 * Install together with templates.gs, then run systemInstall() in Apps Script.
 * Receipt ledgers and existing character UUIDs are never rewritten.
 */
const SYS_CORE = '1cYEfxasIAu61BtAQEZBHV4yV5Ghm7_-BL_SsSFoiBG8';
const SYS_CONTROL = '11gCokfUZUwcRDikt64StzzdDfFMJjjgdlg3hECGTvkU';
const SYS_REPORT = '11kCbQm19YVnQ3Jw4Z9iActhsLIayuDeBsz8Obywq3Bc';
const SYS_JOURNAL = '10QjPZCeD5otmxk8vE9Lho6dUvJma21LAztsSRybDY3c';
const SYS_PACK_HEADERS = ['ID персонажа','Персонаж','Глава','Ветка','Предметы JSON','ID запроса','Отпечаток','Когда'];
const SYS_LEGACY_HEADERS = ['Персонаж','Предмет','Количество','Категория','Слотов','Источник'];
const SYS_USE_HEADERS = ['Персонаж','Предмет','Количество','Причина'];
const SYS_EXPORT_HEADERS = ['Персонаж','Ветка','Глава','Инвентарь: боеприпасы','Инвентарь: оружие','Инвентарь: медпрепараты','Инвентарь: броня','Инвентарь: прочее','Рюкзак: боеприпасы','Рюкзак: оружие','Рюкзак: медпрепараты','Рюкзак: броня','Рюкзак: прочее','Слотов','Проверить','Версия'];
const SYS_ITEM_HEADERS = ['Персонаж','Предмет','Всего','В рюкзаке','Свободно','Категория','Слотов за шт.','ID предмета'];
const SYS_CATEGORIES = ['Боеприпасы','Оружие','Медпрепараты','Броня','Прочее'];
const SYS_REQUEST_CACHE = {};

function sysInstalling_() {return PropertiesService.getScriptProperties().getProperty('DOTD_SYSTEM_MIGRATING')==='1';}
function sysMeta_(id) {return SYS_REQUEST_CACHE['meta:'+id]||(SYS_REQUEST_CACHE['meta:'+id]=Sheets.Spreadsheets.get(id,{fields:'sheets(properties(sheetId,title,gridProperties(rowCount)))'}).sheets.map(s=>s.properties));}
function sysEnabled_() {return PropertiesService.getScriptProperties().getProperty('DOTD_SYSTEM_VERSION')==='2';}
function sysNorm_(s) {return String(s||'').normalize('NFKC').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');}
function sysQuote_(s) {return "'"+String(s).replace(/'/g,"''")+"'";}
function sysValue_(c) {const v=c&&c.effectiveValue||{};if(v.errorValue)throw Error('schema_changed');return v.numberValue!==undefined?v.numberValue:v.boolValue!==undefined?v.boolValue:v.stringValue||'';}
function sysRows_(id,title,width,limit) {
  const cacheKey='rows:'+id+':'+title;if(SYS_REQUEST_CACHE[cacheKey])return SYS_REQUEST_CACHE[cacheKey];
  const col=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
  const meta=sysMeta_(id).find(s=>s.title===title);if(!meta)throw Error('schema_changed');
  const r=Sheets.Spreadsheets.get(id,{ranges:[sysQuote_(title)+'!A1:'+col(width)+Math.min(meta.gridProperties.rowCount,limit||1000)],fields:'sheets(properties(sheetId,title),data(rowData(values(effectiveValue))))'});
  const sheet=r.sheets&&r.sheets[0];if(!sheet)throw Error('schema_changed');
  const result={id:sheet.properties.sheetId,rows:(sheet.data&&sheet.data[0]&&sheet.data[0].rowData||[]).map(row=>Array.from({length:width},(_,i)=>sysValue_(row.values&&row.values[i])))};
  SYS_REQUEST_CACHE[cacheKey]=result;return result;
}
function sysCoreRanges_(name) {return [sysQuote_(name)+'!A1:D36',sysQuote_(name)+'!E63:L92',sysQuote_(name)+'!AA40'];}
function sysSeparateCopiedGrants_(current,original) {
  const grants=[],clear=[];
  current.forEach((row,i)=>{if(JSON.stringify(row)===JSON.stringify(original[i]||['','','',''])){if(row[0]!=='')clear.push(i);}else grants.push(row);});
  return {grants:grants,clear:clear};
}
function sysDecodeCore_(sheet,name) {
  const cells={};(sheet.data||[]).forEach(b=>(b.rowData||[]).forEach((row,i)=>(row.values||[]).forEach((c,j)=>{cells[(i+(b.startRow||0)+1)+':'+(j+(b.startColumn||0)+1)]=sysValue_(c);}))); 
  const v=(row,col)=>cells[row+':'+col]===undefined?'':cells[row+':'+col];
  if(sysNorm_(v(2,1))!==sysNorm_(name))throw Error('invalid_character_stats');
  const stats=Array.from({length:6},(_,i)=>v(i+10,2)),xpValues=[v(6,3),v(6,4)];
  if(stats.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('invalid_character_stats');
  if(xpValues.some(x=>x!==''&&(typeof x!=='number'||!Number.isFinite(x)||x<0)))throw Error('invalid_balance');
  const xp=xpValues.reduce((a,x)=>a+(x===''?0:x),0),kind=String(v(2,3)).trim();
  if(!['райдер','житель','гуль'].includes(sysNorm_(kind)))throw Error('invalid_character_stats');
  const rawGrants=Array.from({length:30},(_,i)=>[v(63+i,5),v(63+i,9),v(63+i,11),v(63+i,12)]);
  let grants=rawGrants,reset=null;
  const owner=String(v(40,27));
  if(owner&&owner!==String(sheet.properties.sheetId)){
    let original=SYS_REQUEST_CACHE['raw-core-id:'+owner];
    if(!original){
      const meta=Sheets.Spreadsheets.get(SYS_CORE,{fields:'sheets(properties(sheetId,title))'});
      const found=(meta.sheets||[]).find(s=>String(s.properties.sheetId)===owner);if(!found)throw Error('invalid_character_stats');
      original=Sheets.Spreadsheets.get(SYS_CORE,{ranges:sysCoreRanges_(found.properties.title),fields:'sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(effectiveValue))))'}).sheets[0];
    }
    const originalCells={};(original.data||[]).forEach(b=>(b.rowData||[]).forEach((row,i)=>(row.values||[]).forEach((c,j)=>{originalCells[(i+(b.startRow||0)+1)+':'+(j+(b.startColumn||0)+1)]=sysValue_(c);}))); 
    const originalGrants=Array.from({length:30},(_,i)=>[5,9,11,12].map(c=>originalCells[(i+63)+':'+c]===undefined?'':originalCells[(i+63)+':'+c]));
    const separated=sysSeparateCopiedGrants_(rawGrants,originalGrants);grants=separated.grants;reset={sheetId:sheet.properties.sheetId,clear:separated.clear};
  }
  return {name:String(v(2,1)).trim(),kind:kind,stats:stats,xp:xp,grants:grants,reset:reset};
}
function sysWarmCore_(names) {
  const r=Sheets.Spreadsheets.get(SYS_CORE,{ranges:names.flatMap(sysCoreRanges_),fields:'sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(effectiveValue))))'});
  (r.sheets||[]).forEach(s=>{SYS_REQUEST_CACHE['raw-core-id:'+s.properties.sheetId]=s;});
  (r.sheets||[]).forEach(s=>{try{SYS_REQUEST_CACHE['core:'+s.properties.title]=sysDecodeCore_(s,s.properties.title);}catch(e){SYS_REQUEST_CACHE['core-error:'+s.properties.title]=e.message;}});
}
function sysCore_(name) {
  if(SYS_REQUEST_CACHE['core:'+name])return SYS_REQUEST_CACHE['core:'+name];
  if(SYS_REQUEST_CACHE['core-error:'+name])throw Error(SYS_REQUEST_CACHE['core-error:'+name]);
  const meta=sysMeta_(SYS_CORE).find(s=>sysNorm_(s.title)===sysNorm_(name));if(!meta)throw Error('character_sheet_missing');
  const r=Sheets.Spreadsheets.get(SYS_CORE,{ranges:sysCoreRanges_(meta.title),fields:'sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(effectiveValue))))'});
  const sheet=r.sheets&&r.sheets[0];if(!sheet)throw Error('character_sheet_missing');
  return SYS_REQUEST_CACHE['core:'+name]=sysDecodeCore_(sheet,name);
}
function sysProgressValues_(xp,spent) {
  if(typeof xp!=='number'||!Number.isFinite(xp)||xp<0||!Number.isSafeInteger(spent)||spent<0)throw Error('invalid_balance');
  const thresholds=[0,10,25,45,70,100,135,175,220,270],points=[0,2,4,6,9,12,15,19,23,27];
  let level=0;thresholds.forEach((t,i)=>{if(xp>=t)level=i;});
  if(points[level]<spent)throw Error('invalid_balance');
  return {level:level,points:points[level]-spent,earned:points[level]};
}
function sysSpent_(rows,id) {
  const seen={},owned={};let spent=0;
  rows.forEach(row=>{
    if(String(row[8])!==id||!row[7])return;
    const operation=String(row[7]),signature=JSON.stringify([row[8],row[9],row[10],row[3]]);
    if(seen[operation]){if(seen[operation]!==signature)throw Error('id_conflict');return;}
    seen[operation]=signature;
    if(owned[String(row[9])])throw Error('already_owned');owned[String(row[9])]=true;
    if(row[10]==='paid'){if(!Number.isSafeInteger(row[3])||row[3]<0)throw Error('invalid_balance');spent+=row[3];}
  });return spent;
}
function sysProgress_(name,id,perkRows) {
  const core=sysCore_(name),rows=perkRows||sysRows_(SYS_CONTROL,'Перки',15,25000).rows.slice(1);
  return Object.assign({kind:core.kind},sysProgressValues_(core.xp,sysSpent_(rows,id)));
}
function sysItemIndex_() {return fminIndex_();}
function sysGrant_(raw,index) {
  const text=String(raw[0]||'').trim();if(!text)return null;
  const match=text.match(/^(.*?)\s*[×xх]\s*(\d+)\s*$/i),name=match?match[1].trim():text;
  const quantity=raw[1]===''||raw[1]===undefined?(match?Number(match[2]):1):raw[1];
  if(typeof quantity!=='number'||!Number.isSafeInteger(quantity)||quantity<0)throw Error('invalid_pack');
  if(!quantity)return null;
  const catalog=index.byName[sysNorm_(name)]||index.byName[fminNorm_(name)];
  const slots=raw[2]===''||raw[2]===undefined?(catalog?catalog.slots:null):raw[2];
  if(slots!==null&&(!Number.isSafeInteger(slots)||slots<0||slots>1000))throw Error('invalid_capacity');
  const category=String(raw[3]||catalog&&catalog.category||'Прочее').trim();
  return Object.assign({},catalog||{id:'gm-'+fminHash_(sysNorm_(name)).slice(0,24),name:name,category:category,slots:slots},{quantity:quantity,category:category,slots:slots});
}
function sysOwnedValues_(purchases,grants,legacy,uses,index,name) {
  const totals={};
  function add(item,sign) {if(!item)return;if(!totals[item.id])totals[item.id]=Object.assign({},item,{quantity:0});totals[item.id].quantity+=sign*item.quantity;}
  purchases.forEach(i=>add(i,1));grants.forEach(raw=>add(sysGrant_(raw,index),1));
  legacy.filter(r=>sysNorm_(r[0])===sysNorm_(name)).forEach(r=>add(sysGrant_([r[1],r[2],r[4],r[3]],index),1));
  uses.filter(r=>sysNorm_(r[0])===sysNorm_(name)).forEach(r=>add(sysGrant_([r[1],r[2],'',''],index),-1));
  if(Object.values(totals).some(i=>i.quantity<0))throw Error('item_not_owned');
  return Object.values(totals).filter(i=>i.quantity>0).sort((a,b)=>a.id.localeCompare(b.id));
}
function sysCapacity_(core) {const mod=Math.floor(core.stats[0]/2-5);if(mod< -2||mod>4)throw Error('invalid_capacity');return 10+mod*2+(sysNorm_(core.kind)==='райдер'?1:0);}
function sysPackRow_(rows,character,chapter) {
  const found=rows.map((r,i)=>({r:r,i:i})).filter(x=>String(x.r[0])===character.id&&String(x.r[2])===String(chapter));
  if(found.length>1)throw Error('schema_changed');return found[0]||null;
}
function sysParsePack_(row) {if(!row)return [];let items;try{items=JSON.parse(row[4]||'[]');}catch(e){throw Error('invalid_pack');}
  if(!Array.isArray(items)||items.length>500)throw Error('invalid_pack');const seen={};
  items.forEach(i=>{if(!i||typeof i.id!=='string'||seen[i.id]||!Number.isSafeInteger(i.quantity)||i.quantity<1||!Number.isSafeInteger(i.slots)||i.slots<0)throw Error('invalid_pack');seen[i.id]=true;});return items;
}
function sysFreeValues_(owned,packed) {
  const held={};packed.forEach(i=>held[i.id]=(held[i.id]||0)+i.quantity);
  const items=owned.map(i=>Object.assign({},i,{ownedQuantity:i.quantity,packedQuantity:held[i.id]||0,freeQuantity:Math.max(0,i.quantity-(held[i.id]||0))}));
  const errors=packed.filter(i=>i.quantity>(owned.find(o=>o.id===i.id)?.quantity||0)).map(i=>i.name);
  packed.filter(i=>!items.some(o=>o.id===i.id)).forEach(i=>items.push(Object.assign({},i,{quantity:0,ownedQuantity:0,packedQuantity:i.quantity,freeQuantity:0})));
  return {items:items,errors:errors};
}
function sysState_(p,bank,report,user) {
  const character=fmCurrent_(bank,report,user);if(!character)throw Error('not_bound');
  let core;try{core=sysCore_(character.name);}catch(e){if(e.message==='character_sheet_missing')return {character:character,waiting:true};throw e;}
  const index=sysItemIndex_(),tables={packs:sysRows_(SYS_REPORT,'Рюкзаки',8,1000),legacy:sysRows_(SYS_REPORT,'_Старые_вещи',6,2000),uses:sysRows_(SYS_REPORT,'Списания вещей',4,2000)};
  const owned=sysOwnedValues_(fminPurchased_(bank,character,index),core.grants,tables.legacy.rows.slice(1),tables.uses.rows.slice(1),index,character.name);
  const states=fminBranchStates_(character),branches=states.map(b=>({id:b.id,chapter:b.chapter,hasSheet:Boolean(b.sheet)}));
  const present=branches.filter(b=>b.hasSheet),selected=p.branchId?fminBranch_(p.branchId):present.length===1?fminBranch_(present[0].id):null;
  const incorrect=selected&&(!branches.find(b=>b.id===selected.id).hasSheet&&branches.some(b=>b.chapter===selected.chapter&&b.hasSheet));
  let pack=null,row=null;
  if(selected&&!incorrect&&states.find(b=>b.id===selected.id).sheet){
    row=sysPackRow_(tables.packs.rows.slice(1),character,selected.chapter);
    if(row&&String(row.r[3])!==selected.id)throw Error('incorrect_branch');
    const items=sysParsePack_(row&&row.r),capacity=sysCapacity_(core),used=items.reduce((n,i)=>n+i.slots*i.quantity,0);
    pack={branchId:selected.id,chapter:selected.chapter,capacity:capacity,used:used,manualSlots:0,manualItems:[],manualUnknown:[],items:items,version:fminHash_({row:row&&row.r||null,capacity:capacity,owned:owned.map(i=>[i.id,i.quantity,i.slots])})};
  }
  const activeChapter=selected?selected.chapter:FMIN_BRANCHES.reduce((n,b)=>Number(b.chapter)>Number(n)?b.chapter:n,'0');
  const reserved=sysPackRow_(tables.packs.rows.slice(1),character,activeChapter);
  const stock=sysFreeValues_(owned,sysParsePack_(reserved&&reserved.r));
  return {character:character,core:core,tables:tables,row:row,owned:owned,stock:stock,branches:branches,incorrect:incorrect,pack:pack,waiting:false};
}
function sysPublicState_(s) {
  if(s.waiting)return {ok:true,character:{id:s.character.id,name:s.character.name},waiting:true,notice:FMIN_WAIT,items:[],branches:[],pack:null};
  return {ok:true,systemVersion:2,character:{id:s.character.id,name:s.character.name},waiting:false,incorrectBranch:Boolean(s.incorrect),notice:s.incorrect?FMIN_WRONG_BRANCH:s.stock.errors.length?'Проверьте наличие вещей у Смотрителя.':s.pack?'':'Выберите ветку!',items:s.stock.items,manualUnknown:s.owned.filter(i=>i.slots===null).map(i=>i.name),branches:s.branches,pack:s.pack};
}
function sysInventory_(p,bank,report,user) {return sysPublicState_(sysState_(p,bank,report,user));}
function sysJoin_(p,bank,report,user) {
  const character=fmCurrent_(bank,report,user);if(!character)throw Error('not_bound');
  let core;try{core=sysCore_(character.name);}catch(e){if(e.message==='character_sheet_missing')return {ok:true,waiting:true,notice:FMIN_WAIT,items:[],branches:[],pack:null};throw e;}
  const branch=fminBranch_(p.branchId),states=fminBranchStates_(character),target=states.find(b=>b.id===branch.id);
  if(fminWrongBranch_(branch,states))throw Error('incorrect_branch');
  if(!target.sheet){
    const template=fminTemplate_(branch,core.kind),created=template.copyTo(target.book);
    created.setName('_market_pending_'+character.id.slice(0,8));
    created.getRange('H2:H5').setValues([[0],[0],[0],[0]]);created.getRange('M2:M7').setValues([[0],[0],[0],[0],[0],[0]]);
    created.getRange('R11:S12').clearContent();created.getRange('O14').clearNote();created.getRange('G25').setValue('пусто');created.getRange('G32').setValue('пусто');
    sysConfigureSheet_(created,'roll',character.name);created.setName(character.name);target.sheet=created;SpreadsheetApp.flush();
  }
  return sysInventory_(p,bank,report,user);
}
function sysSavePack_(p,bank,report,user) {
  const s=sysState_(p,bank,report,user);if(s.waiting)throw Error('character_sheet_missing');if(s.incorrect)throw Error('incorrect_branch');if(!s.pack)throw Error('branch_sheet_missing');
  if(!Array.isArray(p.items)||p.items.length>500||typeof p.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(p.requestId))throw Error('invalid_pack');
  const seen={},items=p.items.map(line=>{
    if(!line||typeof line.id!=='string'||seen[line.id]||!Number.isSafeInteger(line.quantity)||line.quantity<1)throw Error('invalid_pack');seen[line.id]=true;
    const item=s.owned.find(i=>i.id===line.id);if(!item||line.quantity>item.quantity)throw Error('item_not_owned');if(item.slots===null)throw Error('manual_slots_unknown');return Object.assign({},item,{quantity:line.quantity});
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const fingerprint=fminHash_(items.map(i=>({id:i.id,quantity:i.quantity})));
  if(s.row&&s.row.r[5]===p.requestId){if(s.row.r[6]!==fingerprint)throw Error('id_conflict');return sysPublicState_(s);}
  if(p.version!==s.pack.version)throw Error('pack_changed');if(items.reduce((n,i)=>n+i.slots*i.quantity,0)>s.pack.capacity)throw Error('pack_full');
  const values=[s.character.id,s.character.name,String(s.pack.chapter),s.pack.branchId,JSON.stringify(items),p.requestId,fingerprint,fmNow_()];
  const request={updateCells:{start:{sheetId:s.tables.packs.id,rowIndex:s.row?s.row.i+1:s.tables.packs.rows.length,columnIndex:0},rows:[fmRow_(values)],fields:'userEnteredValue'}};
  Sheets.Spreadsheets.batchUpdate({requests:[request]},SYS_REPORT);
  delete SYS_REQUEST_CACHE['rows:'+SYS_REPORT+':Рюкзаки'];
  // This is the only authoritative write. Export failures never undo or repeat a move.
  const updated=sysState_(p,bank,report,user);try{sysPublishCharacter_(updated);}catch(e){console.warn('Character export deferred');}
  return sysPublicState_(updated);
}
function sysExportValues_(s) {
  const groups=items=>SYS_CATEGORIES.map((_,category)=>items.filter(i=>fminCategory_(i)===category).map(i=>i.name+' × '+i.quantity).join('\n'));
  return [s.character.name,s.pack?s.pack.branchId:'',s.pack?String(s.pack.chapter):'',...groups(s.stock.items.filter(i=>i.freeQuantity>0).map(i=>Object.assign({},i,{quantity:i.freeQuantity}))),...groups(s.pack?s.pack.items:[]),s.pack?s.pack.capacity:sysCapacity_(s.core),s.stock.errors.join(', '),s.pack?s.pack.version:''];
}
function sysPublishCharacter_(s) {
  sysPublishItems_(s);
  const values=sysExportValues_(s);
  [SYS_REPORT,SYS_CORE].forEach(id=>{
    const target=sysRows_(id,'_Экспорт_вещей',16,1000),matches=target.rows.map((r,i)=>({r:r,i:i})).filter(x=>sysNorm_(x.r[0])===sysNorm_(s.character.name));
    if(matches.length>1)throw Error('schema_changed');const at=matches.length?matches[0].i:target.rows.length;
    if(matches.length&&JSON.stringify(matches[0].r)===JSON.stringify(values))return;
    const request={updateCells:{start:{sheetId:target.id,rowIndex:at,columnIndex:0},rows:[fmRow_(values)],fields:'userEnteredValue'}};
    target.rows[at]=values;
    if(SYS_REQUEST_CACHE.publish){(SYS_REQUEST_CACHE.publish[id]||(SYS_REQUEST_CACHE.publish[id]=[])).push(request);}
    else Sheets.Spreadsheets.batchUpdate({requests:[request]},id);
  });
}
function sysRefresh_() {
  // Called by the market's existing minute reconciliation, under its write lock.
  const bank=fmBank_(),report=fmReport_(),registry=registry_(),receipts=ledger_(registry.book).rows;
  const names=SpreadsheetApp.openById(SYS_CORE).getSheets().filter(s=>!s.getName().startsWith('_')).map(s=>s.getName());
  sysWarmCore_(names);
  SYS_REQUEST_CACHE.publish={};
  const resetRequests=[];
  const progressRequests=[];let refreshed=0;const errors=[];
  names.forEach(name=>{
    try{
      const core=sysCore_(name);
      if(core.reset){core.reset.clear.forEach(i=>resetRequests.push({updateCells:{range:{sheetId:core.reset.sheetId,startRowIndex:62+i,endRowIndex:63+i,startColumnIndex:4,endColumnIndex:12},rows:[{values:Array.from({length:8},()=>({}))}],fields:'userEnteredValue'}}));resetRequests.push(sysCellRequest_(core.reset.sheetId,40,27,String(core.reset.sheetId)));}
      let entry=registry.rows.map((r,i)=>({r:r,i:i})).slice(1).find(x=>sysNorm_(x.r[0])===sysNorm_(name));
      if(!entry){const row=[name,core.kind,'','','',0,0,Utilities.getUuid()];registry.sheet.appendRow(row);registry.rows.push(row);entry={r:row,i:registry.rows.length-1};}
      if(sysNorm_(entry.r[1])!==sysNorm_(core.kind))progressRequests.push({updateCells:{start:{sheetId:registry.sheet.getSheetId(),rowIndex:entry.i,columnIndex:1},rows:[fmRow_([core.kind])],fields:'userEnteredValue'}});
      const state=sysProgressValues_(core.xp,sysSpent_(receipts,String(entry.r[7])));
      if(entry.r[5]!==state.points||entry.r[6]!==state.level)progressRequests.push({updateCells:{start:{sheetId:registry.sheet.getSheetId(),rowIndex:entry.i,columnIndex:5},rows:[fmRow_([state.points,state.level])],fields:'userEnteredValue'}});
      const character=bank.characters.find(c=>sysNorm_(c.name)===sysNorm_(name));if(!character)return;
      // Publishing is an administrative read; no player identity is inferred here.
      const adminReport={players:{fmValues:[FM_PLAYERS_HEADERS,[name,'1','',character.id]]}},adminUser={id:'1',username:''};
      const s=sysState_({},Object.assign({},bank,{characters:[Object.assign({},character,{balance:0})]}),adminReport,adminUser);
      sysPublishCharacter_(s);refreshed++;
    }catch(e){errors.push(name+': '+e.message);}
  });
  if(resetRequests.length)Sheets.Spreadsheets.batchUpdate({requests:resetRequests},SYS_CORE);
  if(progressRequests.length)Sheets.Spreadsheets.batchUpdate({requests:progressRequests},SYS_CONTROL);
  Object.keys(SYS_REQUEST_CACHE.publish).forEach(id=>{const requests=SYS_REQUEST_CACHE.publish[id];if(requests.length)Sheets.Spreadsheets.batchUpdate({requests:requests},id);});
  delete SYS_REQUEST_CACHE.publish;
  const cache=CacheService.getScriptCache();if(!cache.get('dotd:journal:copied')){sysRefreshJournal_();cache.put('dotd:journal:copied','1',600);}
  const status=SpreadsheetApp.openById(SYS_REPORT).getSheetByName('_Состояние_связей');
  if(status)status.getRange('A1:C2').setValues([['Обновлено','Листов обновлено','Проверить'],[new Date().toISOString(),refreshed,errors.join('\n')]]);
  return {refreshed:refreshed,errors:errors};
}
function sysRefreshJournal_() {
  const source=SpreadsheetApp.openById(SYS_JOURNAL).getSheets()[0],last=source.getLastRow();if(last>10000)throw Error('ledger_too_large');
  const values=source.getRange(1,1,Math.max(1,last),3).getDisplayValues();
  if(!['Юзернейм в Telegram','Учётная запись Telegram'].includes(values[0][0])||values.some(r=>r.some(v=>/^#(REF!|ERROR!|N\/A)/.test(v))))throw Error('schema_changed');
  const target=SpreadsheetApp.openById(SYS_CONTROL).getSheetByName('Журнал гулей');
  if(target.getMaxRows()<values.length)target.insertRowsAfter(target.getMaxRows(),values.length-target.getMaxRows());
  target.getRange(1,1,values.length,3).setValues(values);
}

function sysPublishItems_(s) {
  const target=sysRows_(SYS_REPORT,'Инвентарь',8,1000),existing=target.rows.map((r,i)=>({r:r,i:i})).filter(x=>x.i>0&&sysNorm_(x.r[0])===sysNorm_(s.character.name));
  const values=s.stock.items.map(i=>[s.character.name,i.name,i.ownedQuantity,i.packedQuantity,i.freeQuantity,i.category,i.slots===null?'Указать':i.slots,i.id]);
  const requests=[];
  for(let n=0;n<Math.max(existing.length,values.length);n++){
    const at=existing[n]?existing[n].i:target.rows.length,row=values[n]||Array(8).fill('');
    if(existing[n]&&JSON.stringify(existing[n].r)===JSON.stringify(row))continue;
    requests.push({updateCells:{start:{sheetId:target.id,rowIndex:at,columnIndex:0},rows:[fmRow_(row)],fields:'userEnteredValue'}});target.rows[at]=row;
  }
  if(SYS_REQUEST_CACHE.publish)(SYS_REQUEST_CACHE.publish[SYS_REPORT]||(SYS_REQUEST_CACHE.publish[SYS_REPORT]=[])).push(...requests);
  else if(requests.length)Sheets.Spreadsheets.batchUpdate({requests:requests},SYS_REPORT);
}

/** Owner diagnostics: no payments, purchases or identity claims. */
function systemCheck() {
  const started=Date.now(),bank=fmBank_(),registry=registry_(),receipts=ledger_(registry.book).rows,names=sysMeta_(SYS_CORE).filter(s=>!s.title.startsWith('_')).map(s=>s.title);sysWarmCore_(names);
  const characters=[],errors=[];
  names.forEach(name=>{try{const core=sysCore_(name),entry=registry.rows.find(r=>sysNorm_(r[0])===sysNorm_(name)),progress=sysProgress_(name,String(entry&&entry[7]),receipts),character=bank.characters.find(c=>sysNorm_(c.name)===sysNorm_(name));let stock=null;if(character){const report={players:{fmValues:[FM_PLAYERS_HEADERS,[name,'1','',character.id]]}},s=sysState_({},Object.assign({},bank,{characters:[Object.assign({},character,{balance:0})]}),report,{id:'1',username:''});stock={items:s.owned.length,packed:s.pack?s.pack.items.length:0,issues:s.stock.errors};}characters.push({name:name,kind:core.kind,level:progress.level,points:progress.points,stock:stock});}catch(e){errors.push(name+': '+e.message);}});
  const result={enabled:sysEnabled_(),installing:sysInstalling_(),milliseconds:Date.now()-started,characters:characters,errors:errors};console.log(JSON.stringify(result));return result;
}
function systemRefresh() {
  const lock=LockService.getScriptLock();lock.waitLock(25000);try{const result=sysRefresh_();console.log(JSON.stringify(result));return result;}finally{lock.releaseLock();}
}

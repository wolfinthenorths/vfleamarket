/** Additional market_* actions for the existing signed Protectoron bridge.
 * Route only after the existing timestamp/HMAC verification, using:
 * if (String(payload.action).startsWith('market_')) return json_(marketDispatch_(payload));
 * This module has no public doGet/doPost and never accepts arbitrary spreadsheets.
 */
const FM_BANK_ID = '1iuFkiLPEaA770-iBCLJKuHaLkCY-_43GpY4xcrcwaX4';
const FM_REPORT_ID = '11kCbQm19YVnQ3Jw4Z9iActhsLIayuDeBsz8Obywq3Bc';
const FM_CATALOG_URL = 'https://raw.githubusercontent.com/wolfinthenorths/vfleamarket/main/public/catalog.json';
const FM_LEDGER_HEADERS = ['ID заказа','Отпечаток запроса','ID персонажа','Telegram ID','UTC','Квитанция JSON','Отчёт синхронизирован'];
const FM_ORDERS_HEADERS = ['Когда (Томск)','Номер заказа','Персонаж','Telegram','Telegram ID','Магазин','Предметов','Списано крышек','Баланс до','Баланс после','Статус','Квитанция JSON'];
const FM_ITEMS_HEADERS = ['Когда (Томск)','Номер заказа','Персонаж','Telegram','Магазин','Предмет','Количество','Цена за шт.','Сумма','Слотов','Telegram ID'];
const FM_PLAYERS_HEADERS = ['Персонаж','Telegram ID','Telegram','ID персонажа','Когда привязан (Томск)','Статус'];

function fmError_(code) { throw new Error(code); }
function fmCell_(value) {
  return {userEnteredValue: typeof value === 'number' ? {numberValue:value} : typeof value === 'boolean' ? {boolValue:value} : {stringValue:String(value)}};
}
function fmRow_(values) { return {values:values.map(fmCell_)}; }
function fmNow_() { return Utilities.formatDate(new Date(),'Asia/Tomsk','dd.MM.yyyy HH:mm:ss'); }
function fmHeader_(book,name,headers) {
  const sheet=book.getSheetByName(name);
  if(!sheet || sheet.getMaxColumns()<headers.length) fmError_('schema_changed');
  const actual=sheet.getRange(1,1,1,headers.length).getValues()[0];
  if(headers.some((v,i)=>actual[i]!==v)) fmError_('schema_changed');
  return sheet;
}
function fmRows_(sheet,width) {
  const n=sheet.getLastRow();
  if(n>10001) fmError_('schema_changed');
  return n>1 ? sheet.getRange(2,1,n-1,width).getValues() : [];
}
function fmCatalog_() {
  const cache=CacheService.getScriptCache();
  let raw=cache.get('fleamarket_catalog_v1');
  if(!raw) {
    const response=UrlFetchApp.fetch(FM_CATALOG_URL,{muteHttpExceptions:true,followRedirects:false});
    if(response.getResponseCode()!==200) fmError_('connection_failed');
    raw=response.getContentText();
    if(raw.length>230000) fmError_('schema_changed');
    // Cache only compact financial data; descriptions and images are irrelevant here.
    const full=JSON.parse(raw);
    raw=JSON.stringify({revision:full.revision,shops:full.shops.map(s=>({id:s.id,name:s.name,items:s.items.map(i=>({id:i.id,name:i.name,price:i.price,slots:i.slots}))}))});
    if(raw.length>95000) fmError_('schema_changed');
    cache.put('fleamarket_catalog_v1',raw,60);
  }
  const catalog=JSON.parse(raw);
  if(!/^[a-f0-9]{16}$/.test(catalog.revision) || !Array.isArray(catalog.shops) || catalog.shops.length!==6) fmError_('schema_changed');
  return catalog;
}
function fmBank_() {
  const book=SpreadsheetApp.openById(FM_BANK_ID),sheet=book.getSheetByName('Крышки');
  if(!sheet || sheet.getLastRow()>1000) fmError_('schema_changed');
  const h=sheet.getRange(1,9,1,3).getValues()[0];
  if(h[0]!=='Покупки на Блошином рынке'||h[1]!=='Итого'||h[2]!=='ID персонажа') fmError_('schema_changed');
  const values=sheet.getRange(2,1,Math.max(1,sheet.getLastRow()-1),11).getValues();
  const result=[],seen={};
  values.forEach((r,i)=>{
    if(!String(r[0]).trim())return;
    const id=String(r[10]);
    if(!/^[a-f0-9-]{36}$/.test(id)||seen[id])fmError_('schema_changed');
    seen[id]=true;result.push({id:id,name:String(r[0]).trim(),row:i+2,balance:r[9],expense:r[8]});
  });
  return {book:book,sheet:sheet,characters:result,ledger:fmHeader_(book,'_Покупки_бот',FM_LEDGER_HEADERS)};
}
function fmReport_() {
  const book=SpreadsheetApp.openById(FM_REPORT_ID);
  return {book:book,orders:fmHeader_(book,'Заказы',FM_ORDERS_HEADERS),items:fmHeader_(book,'Покупки',FM_ITEMS_HEADERS),players:fmHeader_(book,'Игроки',FM_PLAYERS_HEADERS)};
}
function fmUser_(user) {
  if(!user || !/^[1-9][0-9]{0,15}$/.test(String(user.id)) || typeof user.username!=='string' || user.username.length>64) fmError_('unauthorized');
  return {id:String(user.id),username:user.username};
}
function fmCurrent_(bank,report,user) {
  const rows=fmRows_(report.players,6);
  const matching=rows.filter(r=>String(r[1])===user.id);
  if(matching.length>1) fmError_('schema_changed');
  if(!matching.length)return null;
  const character=bank.characters.find(c=>c.id===String(matching[0][3]));
  if(!character)fmError_('character_not_found');
  if(!Number.isSafeInteger(character.balance)||character.balance<0)fmError_('invalid_balance');
  return character;
}
function fmState_(bank,report,user) {
  const character=fmCurrent_(bank,report,user);
  const used=fmRows_(report.players,6).filter(r=>String(r[1])).map(r=>String(r[3]));
  return {ok:true,character:character?{id:character.id,name:character.name}:null,balance:character?character.balance:null,
    availableCharacters:character?[]:bank.characters.filter(c=>used.indexOf(c.id)<0).map(c=>({id:c.id,name:c.name}))};
}
function fmBind_(p,bank,report,user) {
  const current=fmCurrent_(bank,report,user);
  if(current) {
    if(current.id!==p.characterId)fmError_('already_bound');
    return fmState_(bank,report,user);
  }
  const character=bank.characters.find(c=>c.id===p.characterId);
  if(!character)fmError_('character_not_found');
  const rows=fmRows_(report.players,6),matches=[];
  rows.forEach((r,i)=>{if(String(r[3])===character.id)matches.push({r:r,row:i+2});});
  if(matches.length>1)fmError_('schema_changed');
  if(matches.length && String(matches[0].r[1]) && String(matches[0].r[1])!==user.id)fmError_('character_taken');
  const row=fmRow_([character.name,user.id,user.username?'@'+user.username:'',character.id,fmNow_(),'Привязан']);
  const request=matches.length ? {updateCells:{start:{sheetId:report.players.getSheetId(),rowIndex:matches[0].row-1,columnIndex:0},rows:[row],fields:'userEnteredValue'}} : {appendCells:{sheetId:report.players.getSheetId(),rows:[row],fields:'userEnteredValue'}};
  Sheets.Spreadsheets.batchUpdate({requests:[request]},FM_REPORT_ID);
  SpreadsheetApp.flush();
  return fmState_(bank,report,user);
}
function fmFingerprint_(p,user) {
  if(!Array.isArray(p.items) || !p.items.length || p.items.length>40)fmError_('invalid_cart');
  const lines=p.items.map(i=>{if(!i || typeof i.id!=='string' || !Number.isSafeInteger(i.quantity) || i.quantity<1 || i.quantity>99)fmError_('invalid_cart');return {id:i.id,quantity:i.quantity};});
  lines.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(new Set(lines.map(i=>i.id)).size!==lines.length)fmError_('invalid_cart');
  const text=JSON.stringify({userId:user.id,shopId:p.shopId,revision:p.revision,expectedTotal:p.expectedTotal,items:lines});
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
function fmFindOrder_(ledger,id) {
  const rows=fmRows_(ledger,7),found=[];
  rows.forEach((r,i)=>{if(r[0]===id)found.push({values:r,row:i+2});});
  if(found.length>1)fmError_('schema_changed');
  return found[0]||null;
}
function fmParseOrder_(entry) {
  let o;try{o=JSON.parse(entry.values[5]);}catch(e){fmError_('schema_changed');}
  if(!o || o.id!==entry.values[0] || String(o.userId)!==String(entry.values[3]) || o.character.id!==entry.values[2])fmError_('schema_changed');
  return o;
}
function fmMirror_(entry,bank,report) {
  const o=fmParseOrder_(entry),raw=entry.values[5];
  const duplicates=fmRows_(report.orders,12).filter(r=>r[1]===o.id);
  if(duplicates.length>1 || duplicates.length===1 && duplicates[0][11]!==raw)fmError_('schema_changed');
  if(!duplicates.length) {
    const name=o.username?'@'+o.username:'ID '+o.userId;
    const order=fmRow_([o.when,o.id,o.character.name,name,o.userId,o.shopName,o.lines.reduce((n,i)=>n+i.quantity,0),o.total,o.balanceBefore,o.balanceAfter,'Оплачен',raw]);
    const items=o.lines.map(i=>fmRow_([o.when,o.id,o.character.name,name,o.shopName,i.name,i.quantity,i.price,i.total,i.slots*i.quantity,o.userId]));
    Sheets.Spreadsheets.batchUpdate({requests:[{appendCells:{sheetId:report.orders.getSheetId(),rows:[order],fields:'userEnteredValue'}},{appendCells:{sheetId:report.items.getSheetId(),rows:items,fields:'userEnteredValue'}}]},FM_REPORT_ID);
  }
  Sheets.Spreadsheets.batchUpdate({requests:[{updateCells:{start:{sheetId:bank.ledger.getSheetId(),rowIndex:entry.row-1,columnIndex:6},rows:[fmRow_([true])],fields:'userEnteredValue'}}]},FM_BANK_ID);
}
function fmCheckout_(p,bank,report,user,catalog) {
  if(typeof p.orderId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.orderId))fmError_('invalid_request');
  const fingerprint=fmFingerprint_(p,user),old=fmFindOrder_(bank.ledger,p.orderId);
  if(old) {
    if(String(old.values[3])!==user.id || old.values[1]!==fingerprint)fmError_('id_conflict');
    const order=fmParseOrder_(old);
    if(old.values[6]!==true){try{fmMirror_(old,bank,report);}catch(e){}}
    return {ok:true,order:order,replayed:true};
  }
  if(p.revision!==catalog.revision)fmError_('catalog_changed');
  const shop=catalog.shops.find(s=>s.id===p.shopId);if(!shop)fmError_('invalid_cart');
  const lines=p.items.map(row=>{const item=shop.items.find(i=>i.id===row.id);if(!item||!Number.isSafeInteger(item.price)||item.price<=0||!Number.isSafeInteger(item.slots)||item.slots<1)fmError_('invalid_cart');return {id:item.id,name:item.name,quantity:row.quantity,price:item.price,total:item.price*row.quantity,slots:item.slots};});
  lines.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const total=lines.reduce((n,i)=>n+i.total,0);
  if(!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(p.expectedTotal)||p.expectedTotal!==total)fmError_('catalog_changed');
  const character=fmCurrent_(bank,report,user);if(!character)fmError_('not_bound');
  const expense=character.expense===''?0:character.expense;
  const range=bank.sheet.getRange(character.row,9);
  if(range.getFormula())fmError_('balance_formula');
  if(!Number.isSafeInteger(expense)||expense<0 || !Number.isSafeInteger(expense+total))fmError_('invalid_balance');
  if(character.balance<total)fmError_('not_enough_caps');
  const when=fmNow_(),order={id:p.orderId,revision:p.revision,character:{id:character.id,name:character.name},userId:user.id,username:user.username,
    shopId:shop.id,shopName:shop.name,lines:lines,total:total,balanceBefore:character.balance,balanceAfter:character.balance-total,when:when,utc:Math.floor(Date.now()/1000)};
  const raw=JSON.stringify(order),note=(range.getNote()+'\n'+when+' | '+shop.name+' | '+lines.map(i=>i.name+' × '+i.quantity).join('; ')+' | '+total+' кр.').trim();
  const noteLines=note.split('\n');while(noteLines.join('\n').length>40000)noteLines.shift();
  // Both financial effects are inside ONE native Sheets batch on ONE workbook.
  Sheets.Spreadsheets.batchUpdate({requests:[
    {updateCells:{start:{sheetId:bank.sheet.getSheetId(),rowIndex:character.row-1,columnIndex:8},rows:[{values:[{userEnteredValue:{numberValue:expense+total},note:noteLines.join('\n')}]}],fields:'userEnteredValue,note'}},
    {appendCells:{sheetId:bank.ledger.getSheetId(),rows:[fmRow_([order.id,fingerprint,character.id,user.id,order.utc,raw,false])],fields:'userEnteredValue'}}
  ]},FM_BANK_ID);
  SpreadsheetApp.flush();
  const entry=fmFindOrder_(bank.ledger,order.id);if(!entry)fmError_('connection_failed');
  let reportSynced=true;try{fmMirror_(entry,bank,report);}catch(e){reportSynced=false;}
  return {ok:true,order:order,reportSynced:reportSynced};
}
function marketDispatch_(p) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))return {ok:false,error:'busy'};
  try {
    const bank=fmBank_(),report=fmReport_();
    if(p.action==='market_verify') {
      const catalog=fmCatalog_();
      Sheets.Spreadsheets.batchUpdate({requests:[{updateCells:{start:{sheetId:bank.ledger.getSheetId(),rowIndex:0,columnIndex:0},rows:[{values:[{note:'Связь проверена '+fmNow_()}]}],fields:'note'}}]},FM_BANK_ID);
      Sheets.Spreadsheets.batchUpdate({requests:[{updateCells:{start:{sheetId:report.orders.getSheetId(),rowIndex:0,columnIndex:0},rows:[{values:[{note:'Связь проверена '+fmNow_()}]}],fields:'note'}}]},FM_REPORT_ID);
      return {ok:true,revision:catalog.revision,characters:bank.characters.length};
    }
    if(p.action==='market_reconcile') {
      const pending=fmRows_(bank.ledger,7).map((r,i)=>({values:r,row:i+2})).filter(e=>e.values[0]&&e.values[6]!==true).slice(0,30);
      let synced=0;for(const e of pending){fmMirror_(e,bank,report);synced++;}
      return {ok:true,synced:synced};
    }
    const user=fmUser_(p.user);
    if(p.action==='market_state')return fmState_(bank,report,user);
    if(p.action==='market_bind')return fmBind_(p,bank,report,user);
    if(p.action==='market_checkout')return fmCheckout_(p,bank,report,user,fmCatalog_());
    if(p.action==='market_order') {
      const entry=fmFindOrder_(bank.ledger,p.orderId);
      if(!entry || String(entry.values[3])!==user.id)fmError_('order_not_found');
      return {ok:true,order:fmParseOrder_(entry)};
    }
    if(p.action==='market_history') {
      const rows=fmRows_(bank.ledger,7).map((r,i)=>({values:r,row:i+2})).filter(e=>String(e.values[3])===user.id).reverse().slice(0,25);
      return {ok:true,orders:rows.map(fmParseOrder_)};
    }
    fmError_('invalid_request');
  } catch(error) {
    const allowed=['busy','connection_failed','schema_changed','unauthorized','character_not_found','character_taken','already_bound','not_bound','invalid_balance','balance_formula','invalid_cart','invalid_request','catalog_changed','not_enough_caps','id_conflict','order_not_found'];
    return {ok:false,error:allowed.indexOf(String(error.message))>=0?String(error.message):'connection_failed'};
  } finally {lock.releaseLock();}
}

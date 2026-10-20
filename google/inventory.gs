/** Full ownership and chapter backpacks. Called only inside the signed market lock. */
const FMIN_BOOK = '1cYEfxasIAu61BtAQEZBHV4yV5Ghm7_-BL_SsSFoiBG8';
const FMIN_BRANCHES = [
  {id:'2.1',chapter:'2',book:'1ZWrUrC8hP7YRWsbk6CW7NP90yfhqo2llaB07i0WKjXo'},
  {id:'2.2',chapter:'2',book:'17gNasLpRDTs-fBl5g2-pfaAhL-T_yzS1MRxE4dHUB3c'},
  {id:'2.3',chapter:'2',book:'1KKhAAbmpaBLfQyoqDqScRiMKpnsyy0bS3VuRudEhs0w'},
  {id:'2.4',chapter:'2',book:'1yjrofHY7lK05bquay67_s3QerANAlsUhM7boktqSWto'}
];
const FMIN_MARK = '\n[FM_ITEMS_V1]';
const FMIN_PACK = '\n[FM_PACK_V1]';
const FMIN_WAIT = 'Дождитесь своего листа или напомните о нем!';

function fminNorm_(s) {return String(s||'').trim().toLowerCase().replace(/ё/g,'е').replace(/[«»"“”]/g,'').replace(/\s+/g,' ');}
function fminHash_(value) {return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value),Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function fminIndex_() {
  const byId={},byName={};
  fmCatalog_().shops.forEach(shop=>shop.items.forEach(item=>{const v=Object.assign({},item,{shopId:shop.id,shopName:shop.name});byId[item.id]=v;byName[fminNorm_(item.name)]=v;}));
  return {byId:byId,byName:byName};
}
function fminCategory_(item) {
  const c=fminNorm_(item.category);
  return /боеприпас|патрон/.test(c)?0:/оруж|ближний бой|дальний бой/.test(c)?1:/мед|хими/.test(c)?2:/брон/.test(c)?3:4;
}
function fminFindSheet_(book,name) {
  const matches=book.getSheets().filter(s=>fminNorm_(s.getName())===fminNorm_(name));
  if(matches.length>1)fmError_('schema_changed');
  return matches[0]||null;
}
function fminSource_(character) {return fminFindSheet_(SpreadsheetApp.openById(FMIN_BOOK),character.name);}
function fminStatsReady_(source) {return source.getRange('B10:B15').getValues().every(row=>typeof row[0]==='number'&&Number.isFinite(row[0]));}
function fminNote_(note,marker) {
  const pos=String(note||'').indexOf(marker);
  if(pos<0)return {prefix:String(note||''),data:null};
  let data;try{data=JSON.parse(String(note).slice(pos+marker.length));}catch(e){fmError_('schema_changed');}
  return {prefix:String(note).slice(0,pos),data:data};
}
function fminCell_(sheet,row,col) {
  const range=sheet.getRange(row,col),value=String(range.getDisplayValue()||''),note=range.getNote(),parsed=fminNote_(note,FMIN_MARK);
  if(range.getFormula())fmError_('inventory_formula');
  let base=value;
  if(parsed.data){
    if(value===parsed.data.last)base=String(parsed.data.base||'');
    else if(parsed.data.generated){
      const old=String(parsed.data.generated).split('\n');
      base=value.split('\n').filter(line=>old.indexOf(line)<0).join('\n').trim();
    }
  }
  return {row:row,col:col,base:base,value:value,note:note,prefix:parsed.prefix};
}
function fminCells_(sheet,pack) {
  const columns=pack?[15,16,18,20,22]:[5,6,8,10,12],rows=pack?[17,19,21]:[25,27,29];
  return columns.map(col=>rows.map(row=>fminCell_(sheet,row,col)));
}
function fminWritePlan_(sheet,cells,items) {
  const groups=[[],[],[],[],[]];
  items.forEach(item=>groups[fminCategory_(item)].push(item.name+' × '+item.quantity));
  const requests=[];
  cells.forEach((column,index)=>column.forEach((cell,i)=>{
    const generated=(i<2?groups[index].slice(i,i+1):groups[index].slice(2)).join('\n');
    const text=[cell.base,generated].filter(Boolean).join('\n');
    const note=cell.prefix+FMIN_MARK+JSON.stringify({base:cell.base,generated:generated,last:text});
    if(text.length>45000||note.length>45000)fmError_('inventory_too_large');
    if(text!==cell.value||note!==cell.note)requests.push({updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:cell.row-1,columnIndex:cell.col-1},rows:[{values:[{userEnteredValue:{stringValue:text},note:note}]}],fields:'userEnteredValue,note'}});
  }));
  return requests;
}
function fminManual_(cells,index) {
  const result=[],unknown=[];
  cells.forEach(column=>column.forEach(cell=>String(cell.base).split('\n').map(s=>s.trim()).filter(Boolean).forEach(line=>{
    const match=line.match(/^(.*?)\s*[×xх]\s*(\d+)\s*$/i),name=match?match[1].trim():line,quantity=match?Number(match[2]):1;
    const found=index.byName[fminNorm_(name)];
    if(!found||!Number.isSafeInteger(quantity)||quantity<1){unknown.push(line);return;}
    result.push(Object.assign({},found,{quantity:quantity}));
  })));
  return {items:result,unknown:unknown};
}
function fminPurchased_(bank,character,index) {
  const totals={};
  fmRows_(bank.ledger,7).forEach((row,i)=>{
    if(!row[0]||String(row[2])!==character.id)return;
    const order=fmParseOrder_({values:row,row:i+2});
    order.lines.forEach(line=>{
      const item=index.byId[line.id];
      if(!item||!Number.isSafeInteger(line.quantity)||line.quantity<1)fmError_('schema_changed');
      if(!totals[item.id])totals[item.id]=Object.assign({},item,{quantity:0});
      totals[item.id].quantity+=line.quantity;
    });
  });
  return Object.keys(totals).sort().map(id=>totals[id]);
}
function fminOwned_(bank,character,source,index,sync) {
  const cells=fminCells_(source,false),purchased=fminPurchased_(bank,character,index),manual=fminManual_(cells,index),totals={};
  purchased.concat(manual.items).forEach(item=>{
    if(!totals[item.id])totals[item.id]=Object.assign({},item,{quantity:0});
    totals[item.id].quantity+=item.quantity;
  });
  if(sync){const requests=fminWritePlan_(source,cells,purchased);if(requests.length)Sheets.Spreadsheets.batchUpdate({requests:requests},FMIN_BOOK);}
  return {items:Object.keys(totals).sort().map(id=>totals[id]),manualUnknown:manual.unknown};
}
function fmSyncInventoryForOrder_(bank,order) {
  const character=bank.characters.find(c=>c.id===order.character.id);
  if(!character)return false;
  const source=fminSource_(character);if(!source)return false;
  fminOwned_(bank,character,source,fminIndex_(),true);return true;
}
function fmSyncInventories_(bank) {
  const ids={};fmRows_(bank.ledger,7).forEach(row=>{if(row[0])ids[String(row[2])]=true;});
  let synced=0;
  bank.characters.filter(c=>ids[c.id]).forEach(character=>{try{const source=fminSource_(character);if(source){fminOwned_(bank,character,source,fminIndex_(),true);synced++;}}catch(e){}});
  return synced;
}
function fminBranch_(id) {const branch=FMIN_BRANCHES.find(b=>b.id===id);if(!branch)fmError_('invalid_branch');return branch;}
function fminPack_(branch,sheet,index) {
  if(String(sheet.getRange('O14').getValue())!=='Рюкзак'||String(sheet.getRange('O15').getValue())!=='Количество слотов')fmError_('schema_changed');
  const raw=String(sheet.getRange('S15').getDisplayValue()),match=raw.match(/^\s*(\d+)\s+слот/);
  if(!match)fmError_('invalid_capacity');
  const capacity=Number(match[1]);if(!Number.isSafeInteger(capacity)||capacity<0||capacity>1000)fmError_('invalid_capacity');
  const cells=fminCells_(sheet,true),manual=fminManual_(cells,index),header=sheet.getRange('O14'),note=fminNote_(header.getNote(),FMIN_PACK);
  const saved=note.data||{items:[]};
  if(!Array.isArray(saved.items))fmError_('schema_changed');
  const selected=(saved.items||[]).map(line=>{const item=index.byId[line.id];if(!item||!Number.isSafeInteger(line.quantity)||line.quantity<1)fmError_('schema_changed');return Object.assign({},item,{quantity:line.quantity});});
  const manualSlots=manual.items.reduce((n,i)=>n+i.quantity*i.slots,0),used=selected.reduce((n,i)=>n+i.quantity*i.slots,manualSlots);
  const version=fminHash_({capacity:capacity,cells:cells,saved:saved.items||[]});
  return {branchId:branch.id,chapter:branch.chapter,capacity:capacity,used:used,manualSlots:manualSlots,manualUnknown:manual.unknown,manualItems:manual.items,
    items:selected,version:version,saved:saved,headerPrefix:note.prefix,cells:cells,sheet:sheet};
}
function fminPublicPack_(pack) {return {branchId:pack.branchId,chapter:pack.chapter,capacity:pack.capacity,used:pack.used,manualSlots:pack.manualSlots,manualUnknown:pack.manualUnknown,manualItems:pack.manualItems,items:pack.items,version:pack.version};}
function fminInventory_(p,bank,report,user) {
  const character=fmCurrent_(bank,report,user);if(!character)fmError_('not_bound');
  const source=fminSource_(character);
  if(!source)return {ok:true,character:{id:character.id,name:character.name},waiting:true,notice:FMIN_WAIT,items:[],branches:[],pack:null};
  const index=fminIndex_(),owned=fminOwned_(bank,character,source,index,true);
  if(!fminStatsReady_(source))return {ok:true,character:{id:character.id,name:character.name},waiting:true,notice:'Характеристики персонажа еще не заполнены.',items:owned.items,branches:[],pack:null};
  const books={};
  const branches=FMIN_BRANCHES.map(branch=>{
    const book=SpreadsheetApp.openById(branch.book),sheet=fminFindSheet_(book,character.name);books[branch.id]={book:book,sheet:sheet};
    return {id:branch.id,chapter:branch.chapter,hasSheet:Boolean(sheet)};
  });
  const existing=branches.filter(b=>b.hasSheet),selected=p.branchId?fminBranch_(p.branchId):existing.length===1?fminBranch_(existing[0].id):null;
  const target=selected?books[selected.id].sheet:null;
  const pack=target?fminPack_(selected,target,index):null;
  return {ok:true,character:{id:character.id,name:character.name},waiting:false,notice:pack?'':'Выберите ветку!',items:owned.items,manualUnknown:owned.manualUnknown,branches:branches,pack:pack?fminPublicPack_(pack):null};
}
function fminTemplate_(branch,characterClass) {
  const candidates=[branch].concat(FMIN_BRANCHES.filter(b=>b.id!==branch.id));
  for(const b of candidates){
    const sheets=SpreadsheetApp.openById(b.book).getSheets();
    for(const s of sheets){if(fminNorm_(s.getRange('C2').getDisplayValue())===fminNorm_(characterClass)&&s.getRange('O14').getDisplayValue()==='Рюкзак')return s;}
  }
  fmError_('template_not_found');
}
function fminJoin_(p,bank,report,user) {
  const character=fmCurrent_(bank,report,user);if(!character)fmError_('not_bound');
  const source=fminSource_(character);if(!source)return {ok:true,waiting:true,notice:FMIN_WAIT,items:[],branches:[],pack:null};
  const branch=fminBranch_(p.branchId),book=SpreadsheetApp.openById(branch.book);
  if(!fminFindSheet_(book,character.name)){
    const characterClass=String(source.getRange('C2').getValue()),template=fminTemplate_(branch,characterClass);
    const stats=source.getRange('B10:B15').getValues(),skills=source.getRange('B17:B36').getValues();
    if(stats.some(row=>typeof row[0]!=='number'||!Number.isFinite(row[0])))fmError_('invalid_character_stats');
    // Copy native formulas/validation/formatting; publish the final sheet name last.
    const created=template.copyTo(book),oldName=template.getName();
    created.setName('_market_pending_'+character.id.slice(0,8));
    const ranges=created.getDataRange(),formulas=ranges.getFormulas();
    const oldQuoted="'"+oldName.replace(/'/g,"''")+"'!",newQuoted="'"+created.getName()+"'!",formulaRequests=[];
    for(let r=0;r<formulas.length;r++)for(let c=0;c<formulas[r].length;c++)if(formulas[r][c]&&formulas[r][c].indexOf(oldQuoted)>=0)formulaRequests.push({updateCells:{start:{sheetId:created.getSheetId(),rowIndex:r,columnIndex:c},rows:[{values:[{userEnteredValue:{formulaValue:formulas[r][c].split(oldQuoted).join(newQuoted)}}]}],fields:'userEnteredValue'}});
    if(formulaRequests.length)Sheets.Spreadsheets.batchUpdate({requests:formulaRequests},branch.book);
    const validations=ranges.getDataValidations();let rulesChanged=false;
    for(let r=0;r<validations.length;r++)for(let c=0;c<validations[r].length;c++){
      const rule=validations[r][c];if(!rule||String(rule.getCriteriaType())!=='VALUE_IN_RANGE')continue;
      const args=rule.getCriteriaValues(),original=args[0];
      if(original&&original.getSheet().getName()===oldName){
        validations[r][c]=rule.copy().requireValueInRange(created.getRange(original.getA1Notation()),args[1]!==false).build();rulesChanged=true;
      }
    }
    if(rulesChanged)ranges.setDataValidations(validations);
    created.getRange('A2').setValue(character.name);created.getRange('C2').setValue(characterClass);
    created.getRange('B16:B21').setValues(stats);created.getRange('B23:B42').setValues(skills);
    created.getRange('C12').setValue(source.getRange('C6').getValue());
    created.getRange('H2:H5').setValues([[0],[0],[0],[0]]);created.getRange('M2:M7').setValues([[0],[0],[0],[0],[0],[0]]);
    fminCells_(created,true).forEach(column=>column.forEach(cell=>created.getRange(cell.row,cell.col).clearContent().clearNote()));
    created.getRange('O14').clearNote();created.getRange('R11:S12').clearContent();
    const perkRules=created.getRange('F23:J40').getDataValidations();
    for(let r=0;r<perkRules.length;r++)for(let c=0;c<perkRules[r].length;c++)if(perkRules[r][c])created.getRange(r+23,c+6).setValue('пусто');
    created.setName(character.name);SpreadsheetApp.flush();
  }
  return fminInventory_(p,bank,report,user);
}
function fminSave_(p,bank,report,user) {
  const character=fmCurrent_(bank,report,user);if(!character)fmError_('not_bound');
  const source=fminSource_(character);if(!source)fmError_('character_sheet_missing');
  const branch=fminBranch_(p.branchId),book=SpreadsheetApp.openById(branch.book),sheet=fminFindSheet_(book,character.name);
  if(!sheet)fmError_('branch_sheet_missing');
  const index=fminIndex_(),owned=fminOwned_(bank,character,source,index,true),pack=fminPack_(branch,sheet,index);
  if(!Array.isArray(p.items)||p.items.length>136||typeof p.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(p.requestId))fmError_('invalid_pack');
  const seen={},chosen=p.items.map(line=>{
    if(!line||typeof line.id!=='string'||seen[line.id]||!Number.isSafeInteger(line.quantity)||line.quantity<1)fmError_('invalid_pack');
    seen[line.id]=true;const item=owned.items.find(i=>i.id===line.id);
    const alreadyPacked=pack.manualItems.filter(i=>i.id===line.id).reduce((sum,i)=>sum+i.quantity,0);
    if(!item||line.quantity+alreadyPacked>item.quantity)fmError_('item_not_owned');
    return Object.assign({},item,{quantity:line.quantity});
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const simple=chosen.map(i=>({id:i.id,quantity:i.quantity})),fingerprint=fminHash_(simple);
  if(pack.saved.requestId===p.requestId){if(pack.saved.fingerprint!==fingerprint)fmError_('id_conflict');return fminInventory_(p,bank,report,user);}
  if(p.version!==pack.version)fmError_('pack_changed');
  if(pack.manualUnknown.length)fmError_('manual_slots_unknown');
  const used=chosen.reduce((n,i)=>n+i.slots*i.quantity,pack.manualSlots);
  // A capacity decrease keeps existing contents, but new saves must fit the live formula.
  if(used>pack.capacity)fmError_('pack_full');
  const requests=fminWritePlan_(sheet,pack.cells,chosen);
  const note=pack.headerPrefix+FMIN_PACK+JSON.stringify({items:simple,requestId:p.requestId,fingerprint:fingerprint,userId:user.id,when:fmNow_()});
  requests.push({updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:13,columnIndex:14},rows:[{values:[{note:note}]}],fields:'note'}});
  Sheets.Spreadsheets.batchUpdate({requests:requests},branch.book);SpreadsheetApp.flush();
  return fminInventory_(p,bank,report,user);
}
function fmInventoryDispatch_(p,bank,report,user) {
  if(p.action==='market_inventory')return fminInventory_(p,bank,report,user);
  if(p.action==='market_branch_join')return fminJoin_(p,bank,report,user);
  if(p.action==='market_pack_save')return fminSave_(p,bank,report,user);
  fmError_('invalid_request');
}
/** Read-only schema check; no real purchases, character copies or backpack changes. */
function marketCheckInventory() {
  const book=SpreadsheetApp.openById(FMIN_BOOK),index=fminIndex_();
  const result={ok:true,inventorySheets:book.getSheets().length,branches:[]};
  FMIN_BRANCHES.forEach(branch=>{
    const sheets=SpreadsheetApp.openById(branch.book).getSheets();
    result.branches.push({branch:branch.id,sheets:sheets.length,capacities:sheets.filter(s=>s.getRange('O14').getValue()==='Рюкзак').map(s=>{
      const original=fminFindSheet_(book,s.getName());
      return !original||!fminStatsReady_(original)?{name:s.getName(),waitingStats:true}:{name:s.getName(),slots:fminPack_(branch,s,index).capacity};
    })});
  });
  console.log(JSON.stringify(result));return result;
}

/** Resumable native Sheets migration. Run only from the owner Apps Script UI. */
const SYS_TARGETS = [{"id":"1YmOn6mDm3375tWZ2bisDFo5mj3TKcA7wdZtnGs91LfE","kind":"character"},{"id":"1LNtugJ4kQJH_eke4k1MDQ4OSgYSUTPqtaJfgYpzY2LQ","kind":"character"},{"id":"17logw238OjhoCV5KqMgYBcfZHvQrmR04o3UnCfSFCkI","kind":"character"},{"id":"1euTlhENQLIdJ5Xu_Ou8fo9vpkL5qaKzBpB93xgKZGOU","kind":"character"},{"id":"1GLezYwEBwPX80J85MDup4esNcVMdzOPP7cgHfs0LkK0","kind":"character"},{"id":"1vFYidG7Xc0a8GuMxgISsoDw30a5dUpCs8qDBt8VfRFE","kind":"character"},{"id":"1N7QsDnJUbNuLhm3wkZ6UibaRoMyuCg1LDM2Vi1Cklrw","kind":"roll"},{"id":"1IpoeSbMO6jmGSEpqkwWscfbFzQ8kskJ1YT7BqMZGs1Y","kind":"roll"},{"id":"12bAxr-7gCWBPBSzx8go2-BMkhywSiLxM5BQO8AyAO0I","kind":"roll"},{"id":"1dSLx4ACITPtK-E53HO5aJ4iQkTNSrBirqZ_d3-KiMcw","kind":"roll"},{"id":"1y-NyVkifVYFxvf6yGTYErjNqARi0WPNu_rMzMxNjciA","kind":"roll"},{"id":"1awn9JhblqU-AIZMdLg2W3l4vS09hONSssLv5-isvkK8","kind":"roll"},{"id":"1FsSSct5jhivCdzqDE5VrD3TYJhFD1HDo4z1YjRJbPMc","kind":"roll"},{"id":"1Mz0FQ_4zEb7xBdOagNQIYRXbYX6hs7bfxpSclsFsL3k","kind":"roll"},{"id":"1dV84RdCiCZz7mJ6_WosST-dBVRW9AEsM70y-ea712fs","kind":"roll"},{"id":"1HHd4-NfS0xHe0_Vvqrq2T9qScF_sUQIUeQ_XgptZco4","kind":"roll"},{"id":"1TDvxDnIHfjBNK2gfaFEc9m4Hn7sJDQcvBM9jGkiW0jE","kind":"roll"},{"id":"1MAZypYsbHLjjzgWGH9huyN1IdStkc5HOf2EeemMjkM0","kind":"roll"},{"id":"1ZWrUrC8hP7YRWsbk6CW7NP90yfhqo2llaB07i0WKjXo","kind":"branch"},{"id":"1yjrofHY7lK05bquay67_s3QerANAlsUhM7boktqSWto","kind":"branch"},{"id":"1KKhAAbmpaBLfQyoqDqScRiMKpnsyy0bS3VuRudEhs0w","kind":"branch"},{"id":"17gNasLpRDTs-fBl5g2-pfaAhL-T_yzS1MRxE4dHUB3c","kind":"branch"},{"id":"1wu8bPiQA8rK8PXc7nio-aHI0eAU4CsGo-fQhuMi39_o","kind":"template"},{"id":"1xvcx6UTP2mL2Uog6tg8mTCZDLjSM0XE3crsJCfn2Mnw","kind":"template"},{"id":"1IAvZBP2KgAKLsYnIZIuh3RUlSEuGapt6pex49Wlrkzs","kind":"template"}];
function sysCol_(n) {let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function sysCellRequest_(id,row,col,value) {return {updateCells:{start:{sheetId:id,rowIndex:row-1,columnIndex:col-1},rows:[{values:[{userEnteredValue:typeof value==='object'?{stringValue:String(value.text)}:typeof value==='number'?{numberValue:value}:String(value).startsWith('=')?{formulaValue:value}:{stringValue:String(value)}}]}],fields:'userEnteredValue'}};}
function sysMakeSheet_(book,name,headers,hidden) {
  let sheet=book.getSheetByName(name);if(sheet){const actual=sheet.getRange(1,1,1,headers.length).getValues()[0];if(headers.some((v,i)=>v!==actual[i]))throw Error('schema_changed');return sheet;}
  sheet=book.insertSheet(name);if(sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#39432e').setFontColor('#ffffff').setWrap(true);
  sheet.setFrozenRows(1);sheet.setColumnWidths(1,headers.length,160);if(hidden)sheet.hideSheet();return sheet;
}
function sysBackUp_(sheet) {
  if(sheet.getName().startsWith('_market_pending_'))return;
  const book=sheet.getParent(),name='_До_связей_'+sheet.getSheetId();if(book.getSheetByName(name))return;
  const copy=sheet.copyTo(book);copy.setName(name);copy.hideSheet();
}
function sysShiftOldReferences_(f) {
  return f.replace(/'(_Связь_перков|_[^']+_данные)'!(\$?)([A-Z]+)(\$?\d+)?(?::(\$?)([A-Z]+)(\$?\d+)?)?/g,(_,name,dollar,col,row,endDollar,endCol,endRow)=>{
    const pos=s=>s.split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),move=s=>{const n=pos(s);if(n<=6)return sysCol_(n+31);if(n>=8&&n<=11)return sysCol_(n+19);if(n>=13&&n<=18)return sysCol_(n+26);throw Error('schema_changed');};
    return dollar+move(col)+(row||'')+(endCol?':'+endDollar+move(endCol)+(endRow||''):'');
  });
}
function sysNameImport_(id,range) {return '=IF($A$2="";"";IMPORTRANGE("'+id+'";"\'"&SUBSTITUTE(TRIM($A$2);"\'";"\'\'")&"\'!'+range+'"))';}
function sysCategoryFormula_(category,pack,part) {
  const column=sysCol_(46+(pack?8:3)+category);
  const lookup='XLOOKUP(TRIM($A$2);$AT$2:$AT$1000;$'+column+'$2:$'+column+'$1000;"";0)';
  return '=IF($A$2="";"";LET(text;'+lookup+';IF(text="";"";LET(lines;TRANSPOSE(SPLIT(text;CHAR(10)));IFERROR('+ (part<2?'INDEX(lines;'+(part+1)+')':'TEXTJOIN(CHAR(10);TRUE;FILTER(lines;SEQUENCE(ROWS(lines))>=3))')+';"")))))';
}
function sysConfigureSheet_(sheet,kind,defaultName,bindingsOnly) {
  sysBackUp_(sheet);
  const id=sheet.getSheetId(),book=sheet.getParent(),requests=[],isRoll=kind!=='character'&&kind!=='core';
  const originalClass=String(sheet.getRange('C2').getDisplayValue()).trim(),name=kind==='template'?'':defaultName||String(sheet.getRange('A2').getDisplayValue()).trim();
  if(sheet.getMaxColumns()<68)requests.push({appendDimension:{sheetId:id,dimension:'COLUMNS',length:68-sheet.getMaxColumns()}});
  if(sheet.getMaxRows()<1001)requests.push({appendDimension:{sheetId:id,dimension:'ROWS',length:1001-sheet.getMaxRows()}});
  requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:26,endIndex:68},properties:{hiddenByUser:true},fields:'hiddenByUser'}});
  const formulas=sheet.getRange(1,1,Math.min(926,sheet.getMaxRows()),26).getFormulas();
  formulas.forEach((row,r)=>row.forEach((f,c)=>{if(!f)return;const changed=sysShiftOldReferences_(f);if(changed!==f)requests.push(sysCellRequest_(id,r+1,c+1,changed));}));
  const put=(r,c,v)=>requests.push(sysCellRequest_(id,r,c,v));
  put(2,1,{text:name});
  if(kind!=='core'){
    put(1,27,sysNameImport_(SYS_CORE,'A1:D36'));
    put(2,3,'=IF($A$2="";"'+originalClass+'";IF(IFERROR($AA$2;"")=TRIM($A$2);$AC$2;"Нет данных"))');
    const bound=expr=>'=IF($A$2="";"";IFERROR(IF($AA$2=TRIM($A$2);'+expr+';"");""))';
    const xpRow=isRoll?12:6,pointsRow=isRoll?13:7;put(xpRow,3,bound('$AC$6'));put(pointsRow,3,bound('$AC$7'));
    if(isRoll)put(14,3,bound('$AC$4'));
    for(let r=0;r<6;r++)put((isRoll?16:10)+r,2,bound('INDEX($AB$10:$AB$15;'+(r+1)+')'));
    for(let r=0;r<20;r++)put((isRoll?23:17)+r,2,bound('INDEX($AB$17:$AB$36;'+(r+1)+')'));
    put(1,32,'=IMPORTRANGE("'+SYS_CORE+'";"\'_Связь_перков\'!A1:F1000")');
    put(1,39,'=IMPORTRANGE("'+SYS_CORE+'";"\'_Каталог_перков\'!A1:F21")');
    if(!bindingsOnly)put(1,46,'=IMPORTRANGE("'+SYS_CORE+'";"\'_Экспорт_вещей\'!A1:P1000")');
  }else{
    put(1,32,"=ARRAYFORMULA('_Связь_перков'!A1:F1000)");put(1,39,"=ARRAYFORMULA('_Каталог_перков'!A1:F21)");if(!bindingsOnly)put(1,46,"=ARRAYFORMULA('_Экспорт_вещей'!A1:P1000)");
  }
  if(!isRoll&&!bindingsOnly){
    [5,6,8,10,12].forEach((col,category)=>[25,27,29].forEach((row,part)=>put(row,col,sysCategoryFormula_(category,false,part))));
  }else if(isRoll){
    if(!bindingsOnly)[15,16,18,20,22].forEach((col,category)=>[17,19,21].forEach((row,part)=>put(row,col,sysCategoryFormula_(category,true,part))));
    // The selectors remain editable; the list of all owned perks is separate.
    put(1,63,'="пусто"');put(1,64,'="пусто"');
    const owned='XLOOKUP(TRIM($A$2);$AF$2:$AF$1000;$AK$2:$AK$1000;"";0)';
    put(2,63,'=IFNA(FILTER($A$111:$A$116;ISNUMBER(MATCH(SUBSTITUTE(LOWER($A$111:$A$116);"ё";"е");SPLIT(SUBSTITUTE(LOWER('+owned+');"ё";"е");CHAR(10));0)));"")');
    put(2,64,'=IFNA(FILTER($A$121:$A$134;ISNUMBER(MATCH(SUBSTITUTE(LOWER($A$121:$A$134);"ё";"е");SPLIT(SUBSTITUTE(LOWER('+owned+');"ё";"е");CHAR(10));0)));"")');
    [25,32].forEach((row,i)=>{
      const current=sheet.getRange(row,7).getDisplayValue();put(row,7,current||'пусто');
      requests.push({setDataValidation:{range:{sheetId:id,startRowIndex:row-1,endRowIndex:row,startColumnIndex:6,endColumnIndex:7},rule:{condition:{type:'ONE_OF_RANGE',values:[{userEnteredValue:'=$'+(i?'BL':'BK')+'$1:$'+(i?'BL':'BK')+'$30'}]},strict:true,showCustomUi:true}}});
    });
    put(45,7,'Полученные перки');put(46,7,'Тип');put(46,8,'');put(46,9,'Название');
    requests.push({mergeCells:{range:{sheetId:id,startRowIndex:44,endRowIndex:45,startColumnIndex:6,endColumnIndex:13},mergeType:'MERGE_ALL'}});
    requests.push({repeatCell:{range:{sheetId:id,startRowIndex:44,endRowIndex:46,startColumnIndex:6,endColumnIndex:13},cell:{userEnteredFormat:{backgroundColor:{red:0.25,green:0.29,blue:0.2},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}},horizontalAlignment:'CENTER',wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}});
  }
  const first=isRoll?47:34;
  if(isRoll){put(first,7,'Классовый');put(first,8,'=IF($C$2="";"";IFNA(IMAGE(VLOOKUP(TRIM($C$2);$AN$1:$AP$3;3;FALSE));""))');put(first,9,'=IF($C$2="";"";IFNA(VLOOKUP(TRIM($C$2);$AN$1:$AO$3;2;FALSE);""))');requests.push({mergeCells:{range:{sheetId:id,startRowIndex:46,endRowIndex:47,startColumnIndex:8,endColumnIndex:13},mergeType:'MERGE_ALL'}});}
  else{put(34,8,'=IF($C$2="";"";IFNA(IMAGE(VLOOKUP(TRIM($C$2);$AN$1:$AP$3;3;FALSE));""))');put(34,9,'=IF($C$2="";"";IFNA(VLOOKUP(TRIM($C$2);$AN$1:$AO$3;2;FALSE);""))');}
  const start=isRoll?48:35,howmany=isRoll?23:20;
  for(let n=0;n<howmany;n++){
    const row=start+n,all='XLOOKUP(TRIM($A$2);$AF$2:$AF$1000;$AK$2:$AK$1000;"";0)';
    put(row,9,'=IF($A$2="";"";LET(perks;'+all+';IF(perks="";"";IFERROR(INDEX(SPLIT(perks;CHAR(10));1;'+(n+1)+');""))))');
    put(row,8,'=IF(I'+row+'="";"";IFNA(IMAGE(INDEX($AM$1:$AM$21;MATCH(I'+row+';$AQ$1:$AQ$21;0)));""))');
    put(row,7,'=IF(I'+row+'="";"";IFNA(VLOOKUP(I'+row+';$AQ$1:$AR$21;2;FALSE);"Перк"))');
    if(isRoll)requests.push({mergeCells:{range:{sheetId:id,startRowIndex:row-1,endRowIndex:row,startColumnIndex:8,endColumnIndex:13},mergeType:'MERGE_ALL'}});
  }
  if(isRoll){requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:46,endIndex:71},properties:{pixelSize:36},fields:'pixelSize'}});requests.push({repeatCell:{range:{sheetId:id,startRowIndex:46,endRowIndex:71,startColumnIndex:6,endColumnIndex:13},cell:{userEnteredFormat:{wrapStrategy:'WRAP',verticalAlignment:'MIDDLE',textFormat:{fontSize:10}}},fields:'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat.fontSize'}});}
  if(kind==='core'){
    // Owner marker is copied with a sheet; copied grants are filtered during migration.
    put(40,27,String(id));put(61,5,'Выдано Смотрителем');put(62,5,'Предмет');put(62,9,'Количество');put(62,11,'Слотов');put(62,12,'Категория');
    requests.push({mergeCells:{range:{sheetId:id,startRowIndex:60,endRowIndex:61,startColumnIndex:4,endColumnIndex:12},mergeType:'MERGE_ALL'}});
    for(let row=62;row<=92;row++){
      requests.push({mergeCells:{range:{sheetId:id,startRowIndex:row-1,endRowIndex:row,startColumnIndex:4,endColumnIndex:8},mergeType:'MERGE_ALL'}});
      requests.push({mergeCells:{range:{sheetId:id,startRowIndex:row-1,endRowIndex:row,startColumnIndex:8,endColumnIndex:10},mergeType:'MERGE_ALL'}});
    }
    requests.push({repeatCell:{range:{sheetId:id,startRowIndex:60,endRowIndex:62,startColumnIndex:4,endColumnIndex:12},cell:{userEnteredFormat:{backgroundColor:{red:0.28,green:0.32,blue:0.22},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}},horizontalAlignment:'CENTER',wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}});
    requests.push({repeatCell:{range:{sheetId:id,startRowIndex:62,endRowIndex:92,startColumnIndex:4,endColumnIndex:12},cell:{userEnteredFormat:{backgroundColor:{red:0.92,green:0.92,blue:0.87},textFormat:{foregroundColor:{red:0.1,green:0.1,blue:0.08}},verticalAlignment:'TOP',wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}});
    requests.push({setDataValidation:{range:{sheetId:id,startRowIndex:62,endRowIndex:92,startColumnIndex:11,endColumnIndex:12},rule:{condition:{type:'ONE_OF_LIST',values:SYS_CATEGORIES.map(v=>({userEnteredValue:v}))},strict:true,showCustomUi:true}}});
    requests.push({setDataValidation:{range:{sheetId:id,startRowIndex:62,endRowIndex:92,startColumnIndex:8,endColumnIndex:10},rule:{condition:{type:'NUMBER_GREATER_THAN_EQ',values:[{userEnteredValue:'0'}]},strict:true,showCustomUi:true}}});
  }
  requests.push(...sysDescriptionRequests_(id,kind));
  if(isRoll)requests.push(...sysSelectionRequests_(sheet),...sysTopClassRequests_(id));
  Sheets.Spreadsheets.batchUpdate({requests:requests},book.getId());
}
function sysMigrateLegacy_() {
  const report=SpreadsheetApp.openById(SYS_REPORT),legacy=report.getSheetByName('_Старые_вещи'),packs=report.getSheetByName('Рюкзаки');
  if(legacy.getRange('A1').getNote()==='DOTD_SYSTEM_MIGRATED_V2')return;
  if(legacy.getLastRow()>1||packs.getLastRow()>1)throw Error('Migration already contains data; resume from the recorded step');
  const bank=fmBank_(),index=fminIndex_(),legacyRows=[],packRows=[],coreBook=SpreadsheetApp.openById(SYS_CORE);
  bank.characters.forEach(character=>{
    const source=fminFindSheet_(coreBook,character.name);if(!source)return;
    fminCells_(source,false).forEach((column,category)=>column.forEach(cell=>String(cell.base).split('\n').map(s=>s.trim()).filter(Boolean).forEach(line=>{
      const m=line.match(/^(.*?)\s*[×xх]\s*(\d+)\s*$/i),name=m?m[1].trim():line,item=index.byName[fminNorm_(name)];
      legacyRows.push([character.name,name,m?Number(m[2]):1,SYS_CATEGORIES[category],item?item.slots:'','Инвентарь до перенастройки']);
    })));
    const states=fminBranchStates_(character),chapters={};
    states.forEach(state=>{if(!state.sheet)return;if(chapters[state.chapter])throw Error('incorrect_branch');chapters[state.chapter]=true;
      const pack=fminPack_(fminBranch_(state.id),state.sheet,index);if(pack.manualUnknown.length)throw Error('manual_slots_unknown');
      const items={};pack.items.concat(pack.manualItems).forEach(item=>{if(!items[item.id])items[item.id]=Object.assign({},item,{quantity:0});items[item.id].quantity+=item.quantity;});
      const combined=Object.values(items),purchased=fminPurchased_(bank,character,index),owned=sysOwnedValues_(purchased,[],legacyRows,[],index,character.name);
      combined.forEach(item=>{const lack=item.quantity-(owned.find(i=>i.id===item.id)?.quantity||0);if(lack>0)legacyRows.push([character.name,item.name,lack,item.category,item.slots,'Ранее вручную внесено в рюкзак '+state.id]);});
      packRows.push([character.id,character.name,String(state.chapter),state.id,JSON.stringify(combined),'migration-'+character.id,fminHash_(combined.map(i=>({id:i.id,quantity:i.quantity}))),fmNow_()]);
    });
  });
  // Build and validate every row before the first mutation.
  const requests=[];if(legacyRows.length)requests.push({appendCells:{sheetId:legacy.getSheetId(),rows:legacyRows.map(fmRow_),fields:'userEnteredValue'}});
  if(packRows.length)requests.push({appendCells:{sheetId:packs.getSheetId(),rows:packRows.map(fmRow_),fields:'userEnteredValue'}});
  requests.push({updateCells:{start:{sheetId:legacy.getSheetId(),rowIndex:0,columnIndex:0},rows:[{values:[{note:'DOTD_SYSTEM_MIGRATED_V2'}]}],fields:'note'}});
  Sheets.Spreadsheets.batchUpdate({requests:requests},SYS_REPORT);
}
function systemInstall() {
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try{
    const props=PropertiesService.getScriptProperties(),report=SpreadsheetApp.openById(SYS_REPORT),core=SpreadsheetApp.openById(SYS_CORE),control=SpreadsheetApp.openById(SYS_CONTROL);
    props.setProperty('DOTD_SYSTEM_MIGRATING','1');
    if(!props.getProperty('DOTD_SYSTEM_PREPARED')){
      sysMakeSheet_(report,'Рюкзаки',SYS_PACK_HEADERS,false);sysMakeSheet_(report,'Инвентарь',SYS_ITEM_HEADERS,false);sysMakeSheet_(report,'Списания вещей',SYS_USE_HEADERS,false);
      sysMakeSheet_(report,'_Старые_вещи',SYS_LEGACY_HEADERS,true);sysMakeSheet_(report,'_Экспорт_вещей',SYS_EXPORT_HEADERS,true);sysMakeSheet_(core,'_Экспорт_вещей',SYS_EXPORT_HEADERS,true);
      sysMakeSheet_(report,'_Состояние_связей',['Обновлено','Листов обновлено','Проверить'],true);
      if(!core.getSheetByName('_Каталог_перков')){const s=core.insertSheet('_Каталог_перков');s.getRange('A1:F21').setValues(core.getSheetByName('Эшвейл').getRange('U100:Z120').getValues());s.hideSheet();}
      if(!control.getSheetByName('Журнал гулей')){const s=control.insertSheet('Журнал гулей');s.setFrozenRows(1);s.setColumnWidths(1,3,240);}
      sysRefreshJournal_();sysMigrateLegacy_();props.setProperty('DOTD_SYSTEM_PREPARED','1');
    }
    // A bounded number of books per invocation keeps the migration below Google's execution limit.
    const targets=[{id:SYS_CORE,kind:'core'}].concat(SYS_TARGETS),start=Number(props.getProperty('DOTD_SYSTEM_INSTALL_INDEX')||0),end=Math.min(start+3,targets.length);
    for(let i=start;i<end;i++){
      const target=targets[i],book=SpreadsheetApp.openById(target.id),sheets=book.getSheets().filter(s=>!s.getName().startsWith('_'));
      const requests=sheets.flatMap(sheet=>{const id=sheet.getSheetId(),r=[];if(sheet.getMaxColumns()<68)r.push({appendDimension:{sheetId:id,dimension:'COLUMNS',length:68-sheet.getMaxColumns()}});r.push({updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:26,endIndex:68},properties:{hiddenByUser:true},fields:'hiddenByUser'}});if(target.kind!=='core'&&target.kind!=='character')r.push(...sysSelectionRequests_(sheet),...sysTopClassRequests_(id));return r.concat(sysStockRequests_(id,target.kind),sysDescriptionRequests_(id,target.kind));});
      Sheets.Spreadsheets.batchUpdate({requests:requests},book.getId());
      props.setProperty('DOTD_SYSTEM_INSTALL_INDEX',String(i+1));
    }
    if(end===targets.length){props.setProperty('DOTD_SYSTEM_VERSION','2');props.deleteProperty('DOTD_SYSTEM_MIGRATING');const check=sysRefresh_();console.log(JSON.stringify({complete:true,checked:check}));return {complete:true,checked:check};}
    console.log(JSON.stringify({complete:false,processed:end,total:targets.length,next:'Run systemInstall again'}));return {complete:false,processed:end,total:targets.length};
  }finally{lock.releaseLock();}
}

/** Inline descriptions remain attached when a roll worksheet is copied to a branch. */
function sysDescriptionRequests_(id,kind) {
  const roll=kind!=='character'&&kind!=='core',first=roll?47:34,start=first+1,count=roll?23:20,requests=[];
  const put=(r,c,v)=>requests.push(sysCellRequest_(id,r,c,v));
  requests.push(...sysPerkLayoutRequests_(id,kind));
  put(1,65,kind==='core'?"=ARRAYFORMULA('_Описания_перков'!A1:B24)":'=IMPORTRANGE("'+SYS_CORE+'";"\'_Описания_перков\'!A1:B24")');
  put(first-1,8,'PNG');put(first-1,9,'Название и описание');
  const norm=ref=>'SUBSTITUTE(LOWER('+ref+');"ё";"е")';
  const describe=name=>'IF('+name+'="";"";'+name+'&CHAR(10)&XLOOKUP('+norm(name)+';ARRAYFORMULA('+norm('$BM$2:$BM$24')+');$BN$2:$BN$24;"Описание отсутствует в справочнике";0))';
  put(first,9,'=LET(name;IFNA(VLOOKUP(TRIM($C$2);$AN$1:$AO$3;2;FALSE);"");'+describe('name')+')');
  for(let n=0;n<count;n++){
    const row=start+n,key='$BJ'+row,all='XLOOKUP(TRIM($A$2);$AF$2:$AF$1000;$AK$2:$AK$1000;"";0)';
    put(row,62,'=IF($A$2="";"";LET(perks;'+all+';IF(perks="";"";IFERROR(INDEX(SPLIT(perks;CHAR(10));1;'+(n+1)+');""))))');
    put(row,9,'='+describe(key));
    put(row,8,'=IF('+key+'="";"";IFNA(IMAGE(INDEX($AM$1:$AM$21;MATCH('+norm(key)+';ARRAYFORMULA('+norm('$AQ$1:$AQ$21')+');0)));""))');
    put(row,7,'=IF('+key+'="";"";XLOOKUP('+norm(key)+';ARRAYFORMULA('+norm('$AQ$1:$AQ$21')+');$AR$1:$AR$21;"Перк";0))');
  }
  requests.push({repeatCell:{range:{sheetId:id,startRowIndex:first-1,endRowIndex:start+count-1,startColumnIndex:8,endColumnIndex:13},cell:{userEnteredFormat:{wrapStrategy:'WRAP',verticalAlignment:'TOP',horizontalAlignment:'LEFT',textFormat:{fontSize:10,bold:false}}},fields:'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.bold'}});
  requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:first-1,endIndex:start+count-1},properties:{pixelSize:140},fields:'pixelSize'}});
  return requests;
}

function sysStockRequests_(id,kind) {
  const roll=kind!=='core'&&kind!=='character',requests=[sysCellRequest_(id,1,46,kind==='core'?"=ARRAYFORMULA('_Экспорт_вещей'!A1:P1000)":'=IMPORTRANGE("'+SYS_CORE+'";"\'_Экспорт_вещей\'!A1:P1000")')];
  (roll?[15,16,18,20,22]:[5,6,8,10,12]).forEach((col,category)=>(roll?[17,19,21]:[25,27,29]).forEach((row,part)=>requests.push(sysCellRequest_(id,row,col,sysCategoryFormula_(category,roll,part)))));
  return requests;
}

function sysSelectionRequests_(sheet) {
  const id=sheet.getSheetId(),requests=[];
  sheet.getRange(1,1,100,26).getFormulas().forEach((row,r)=>row.forEach((f,c)=>{
    if(!f)return;const next=sysShiftOldReferences_(f).replace(/\$?G\$?(25|32)\b/g,(_,n)=>'$BP$'+n);if(next!==f)requests.push(sysCellRequest_(id,r+1,c+1,next));
  }));
  [25,32].forEach((r,i)=>requests.push(sysCellRequest_(id,r,68,'=IF(ISNUMBER(MATCH($G$'+r+';$'+(i?'BL':'BK')+'$1:$'+(i?'BL':'BK')+'$30;0));$G$'+r+';"пусто")')));
  return requests;
}

function sysPerkLayoutRequests_(id,kind) {
  const roll=kind!=='core'&&kind!=='character',title=roll?45:32,first=roll?47:34,last=roll?70:54,r=[];
  r.push({unmergeCells:{range:{sheetId:id,startRowIndex:title-1,endRowIndex:last,startColumnIndex:6,endColumnIndex:13}}});
  r.push({mergeCells:{range:{sheetId:id,startRowIndex:title-1,endRowIndex:title,startColumnIndex:6,endColumnIndex:13},mergeType:'MERGE_ALL'}});
  for(let row=title+1;row<=last;row++)r.push({mergeCells:{range:{sheetId:id,startRowIndex:row-1,endRowIndex:row,startColumnIndex:8,endColumnIndex:13},mergeType:'MERGE_ALL'}});
  r.push({repeatCell:{range:{sheetId:id,startRowIndex:first-1,endRowIndex:last,startColumnIndex:6,endColumnIndex:13},cell:{userEnteredFormat:{backgroundColor:{red:0.97,green:0.92,blue:0.94},textFormat:{foregroundColor:{red:0.1,green:0.1,blue:0.1}}}},fields:'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor'}});
  r.push({repeatCell:{range:{sheetId:id,startRowIndex:title,endRowIndex:title+1,startColumnIndex:6,endColumnIndex:13},cell:{userEnteredFormat:{backgroundColor:{red:0.55,green:0.39,blue:0.48},textFormat:{foregroundColor:{red:1,green:1,blue:1},bold:true},horizontalAlignment:'CENTER'}},fields:'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment'}});
  r.push(sysCellRequest_(id,title+1,8,'PNG'),sysCellRequest_(id,title+1,9,'Название и описание'));
  return r;
}

function sysTopClassRequests_(id) {
  return [
    sysCellRequest_(id,6,2,'=IFNA(VLOOKUP(TRIM($C$2);$AN$1:$AO$3;2;FALSE);"")'),
    sysCellRequest_(id,6,1,'=IF($B$6="";"";IFNA(IMAGE(VLOOKUP(TRIM($C$2);$AN$1:$AP$3;3;FALSE));""))'),
    sysCellRequest_(id,6,4,'=IF($B$6="";"";XLOOKUP(SUBSTITUTE(LOWER($B$6);"ё";"е");ARRAYFORMULA(SUBSTITUTE(LOWER($BM$2:$BM$24);"ё";"е"));$BN$2:$BN$24;"";0))')
  ];
}

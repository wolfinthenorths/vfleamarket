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
  const columns=kind==='character'?94:68;
  requests.push(...sysBackgroundRequests_(sheet));
  if(sheet.getMaxColumns()<columns)requests.push({appendDimension:{sheetId:id,dimension:'COLUMNS',length:columns-sheet.getMaxColumns()}});
  if(sheet.getMaxRows()<1001)requests.push({appendDimension:{sheetId:id,dimension:'ROWS',length:1001-sheet.getMaxRows()}});
  if(sheet.getMaxRows()<1001)requests.push(sysPerkPaint_(sysPerkRange_(id,sheet.getMaxRows()+1,1001,1,26),'3f3f3f','ffffff',false));
  requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:26,endIndex:columns},properties:{hiddenByUser:true},fields:'hiddenByUser'}});
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
    put(1,32,'=IMPORTRANGE("'+SYS_CORE+'";"\'_Связь_перков\'!A1:G1000")');
    put(1,39,'=IMPORTRANGE("'+SYS_CORE+'";"\'_Каталог_перков\'!A1:F21")');
    if(!bindingsOnly)put(1,46,'=IMPORTRANGE("'+SYS_CORE+'";"\'_Экспорт_вещей\'!A1:P1000")');
  }else{
    requests.push(...sysResidentSourceRequests_(book.getSheetByName('_Связь_перков')));
    put(1,32,"=ARRAYFORMULA('_Связь_перков'!A1:G1000)");put(1,39,"=ARRAYFORMULA('_Каталог_перков'!A1:F21)");if(!bindingsOnly)put(1,46,"=ARRAYFORMULA('_Экспорт_вещей'!A1:P1000)");
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
  }
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
  requests.push(...sysDescriptionRequests_(id,kind,isRoll?sysPerkOffset_(sheet):0));
  requests.push(...sysAnalysisRequests_(id,kind));
  requests.push(...sysResidentRequests_(sheet,kind));
  if(isRoll)requests.push(...sysSelectionRequests_(sheet),...sysTopClassRequests_(id,sysResidentLayout_(sheet)),...sysPerkRuleRequests_(sheet,kind,sysPerkOffset_(sheet)));
  requests.push(...sysPerkEmphasisRequests_(id,kind,sysPerkOffset_(sheet)));
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
    Sheets.Spreadsheets.batchUpdate({requests:sysResidentSourceRequests_(core.getSheetByName('_Связь_перков'))},core.getId());
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
      const requests=sheets.flatMap(sheet=>{const id=sheet.getSheetId(),r=sysBackgroundRequests_(sheet),columns=target.kind==='character'?94:68;if(sheet.getMaxColumns()<columns)r.push({appendDimension:{sheetId:id,dimension:'COLUMNS',length:columns-sheet.getMaxColumns()}});r.push({updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:26,endIndex:columns},properties:{hiddenByUser:true},fields:'hiddenByUser'}});const roll=target.kind!=='core'&&target.kind!=='character';r.push(...sysStockRequests_(id,target.kind),...sysDescriptionRequests_(id,target.kind,roll?sysPerkOffset_(sheet):0),...sysAnalysisRequests_(id,target.kind));r.push(...sysResidentRequests_(sheet,target.kind));if(roll)r.push(...sysSelectionRequests_(sheet),...sysTopClassRequests_(id,sysResidentLayout_(sheet)),...sysPerkRuleRequests_(sheet,target.kind,sysPerkOffset_(sheet)));r.push(...sysPerkEmphasisRequests_(id,target.kind,sysPerkOffset_(sheet)));return r;});
      Sheets.Spreadsheets.batchUpdate({requests:requests},book.getId());
      props.setProperty('DOTD_SYSTEM_INSTALL_INDEX',String(i+1));
    }
    if(end===targets.length){props.setProperty('DOTD_SYSTEM_VERSION','2');props.deleteProperty('DOTD_SYSTEM_MIGRATING');const check=sysRefresh_();console.log(JSON.stringify({complete:true,checked:check}));return {complete:true,checked:check};}
    console.log(JSON.stringify({complete:false,processed:end,total:targets.length,next:'Run systemInstall again'}));return {complete:false,processed:end,total:targets.length};
  }finally{lock.releaseLock();}
}

/** GM analysis follows the name, including when a personal character sheet is copied. */
function sysAnalysisRequests_(id,kind) {
  if(kind!=='character')return [];
  // Import the source name with the text so an asynchronous name change cannot show donor prose.
  const requests=[sysCellRequest_(id,1,69,sysNameImport_(SYS_CORE,'A1:Z39'))];
  const bind=(row,col)=>{
    const source='$'+sysCol_(68+col)+'$'+row;
    requests.push(sysCellRequest_(id,row,col,'=IFERROR(IF(AND($A$2<>"";$BQ$2=TRIM($A$2));IF('+source+'="";"";'+source+');"");"")'));
  };
  [2,3,5,7,9,11].forEach(row=>bind(row,8));
  [2].concat(Array.from({length:19},(_,i)=>3+i*2)).forEach(row=>bind(row,16));
  return requests;
}

/** Inline descriptions remain attached when a roll worksheet is copied to a branch. */
function sysDescriptionRequests_(id,kind,offset) {
  return [sysCellRequest_(id,1,65,kind==='core'?"=ARRAYFORMULA('_Описания_перков'!A1:B24)":'=IMPORTRANGE("'+SYS_CORE+'";"\'_Описания_перков\'!A1:B24")')].concat(sysPerkLayoutRequests_(id,kind,offset||0));
}

// Ghoul templates reserve three extra rows for Mysterium and the saving-throw calculator.
function sysPerkOffset_(sheet) {return sheet.getRange('F26').getDisplayValue()==='Пассивные перки'?3:0;}
function sysPerkNorm_(ref) {return 'SUBSTITUTE(LOWER('+ref+');"ё";"е")';}
function sysOwnedPerksExpr_() {return 'XLOOKUP(TRIM($A$2);$AF$2:$AF$1000;$AK$2:$AK$1000;"";0)';}
function sysPerkGroupFormula_(type) {
  return '=IF($A$2="";"";LET(owned;'+sysOwnedPerksExpr_()+';IF(owned="";"";IFERROR(TEXTJOIN(" • ";TRUE;FILTER($AQ$2:$AQ$21;$AR$2:$AR$21="'+type+'";ARRAYFORMULA(ISNUMBER(MATCH('+sysPerkNorm_('$AQ$2:$AQ$21')+';SPLIT('+sysPerkNorm_('owned')+';CHAR(10));0)))));""))))';
}
function sysPerkImageFormula_(name,size) {
  return '=IF(OR('+name+'="";'+name+'="пусто");"";IFNA(IMAGE(INDEX($AM$1:$AM$21;MATCH('+sysPerkNorm_(name)+';ARRAYFORMULA('+sysPerkNorm_('$AQ$1:$AQ$21')+');0))'+';1'+');""))';
}
function sysPerkRange_(id,r1,r2,c1,c2) {return {sheetId:id,startRowIndex:r1-1,endRowIndex:r2,startColumnIndex:c1-1,endColumnIndex:c2};}
function sysPerkColor_(hex) {return {red:parseInt(hex.slice(0,2),16)/255,green:parseInt(hex.slice(2,4),16)/255,blue:parseInt(hex.slice(4,6),16)/255};}
function sysPerkPaint_(range,bg,fg,bold) {
  return {repeatCell:{range:range,cell:{userEnteredFormat:{backgroundColorStyle:{rgbColor:sysPerkColor_(bg)},textFormat:{foregroundColorStyle:{rgbColor:sysPerkColor_(fg)},fontFamily:'Arial',fontSize:10,bold:!!bold},wrapStrategy:'WRAP',verticalAlignment:'MIDDLE',horizontalAlignment:bold?'CENTER':'LEFT',borders:{top:{style:'NONE'},bottom:{style:'NONE'},left:{style:'NONE'},right:{style:'NONE'}}}},fields:'userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment,userEnteredFormat.horizontalAlignment,userEnteredFormat.borders'}};
}

function sysWhiteRunRequests_(id,runs) {
  const rectangles=[],last={};
  runs.forEach(run=>{
    const key=run.c+':'+run.end,previous=last[key];
    if(previous&&previous.endRowIndex===run.r)previous.endRowIndex=run.r+1;
    else {const rect={sheetId:id,startRowIndex:run.r,endRowIndex:run.r+1,startColumnIndex:run.c,endColumnIndex:run.end};rectangles.push(rect);last[key]=rect;}
  });
  return rectangles.map(range=>({repeatCell:{range:range,cell:{userEnteredFormat:{backgroundColorStyle:{rgbColor:sysPerkColor_('3f3f3f')},textFormat:{foregroundColorStyle:{rgbColor:sysPerkColor_('ffffff')}}}},fields:'userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat.foregroundColorStyle'}}));
}
function sysBackgroundRequests_(sheet) {
  const runs=[],bounds=sheet.getRange(1,1,sheet.getMaxRows(),26),covered=new Set();
  // Covered cells in a merge report default white; only its anchor is rendered.
  bounds.getMergedRanges().forEach(merged=>{
    const top=merged.getRow()-1,left=merged.getColumn()-1;
    for(let r=top;r<top+merged.getNumRows();r++)for(let c=left;c<Math.min(26,left+merged.getNumColumns());c++)if(r!==top||c!==left)covered.add(r+':'+c);
  });
  bounds.getBackgrounds().forEach((row,r)=>{
    let start=-1;
    for(let c=0;c<=row.length;c++){
      if(c<row.length&&!covered.has(r+':'+c)&&String(row[c]).toLowerCase()==='#ffffff'){if(start<0)start=c;}
      else if(start>=0){runs.push({r:r,c:start,end:c});start=-1;}
    }
  });
  return sysWhiteRunRequests_(sheet.getSheetId(),runs);
}

function sysStockRequests_(id,kind) {
  const roll=kind!=='core'&&kind!=='character',requests=[sysCellRequest_(id,1,46,kind==='core'?"=ARRAYFORMULA('_Экспорт_вещей'!A1:P1000)":'=IMPORTRANGE("'+SYS_CORE+'";"\'_Экспорт_вещей\'!A1:P1000")')];
  (roll?[15,16,18,20,22]:[5,6,8,10,12]).forEach((col,category)=>(roll?[17,19,21]:[25,27,29]).forEach((row,part)=>requests.push(sysCellRequest_(id,row,col,sysCategoryFormula_(category,roll,part)))));
  return requests;
}

function sysSelectionRequests_(sheet) {
  const id=sheet.getSheetId(),requests=[],offset=sysPerkOffset_(sheet),passive=25+offset,active=32+offset;
  sheet.getRange(1,1,100,26).getFormulas().forEach((row,r)=>row.forEach((f,c)=>{
    if(!f)return;const next=sysShiftOldReferences_(f).replace(new RegExp('\\$?G\\$?('+passive+'|'+active+')\\b','g'),(_,n)=>'$BP$'+(Number(n)===passive?25:32));if(next!==f&&(r+1<23+offset||c<5||c>12))requests.push(sysCellRequest_(id,r+1,c+1,next));
  }));
  requests.push({setDataValidation:{range:sysPerkRange_(id,23+offset,70,6,13)}});
  if(offset)[25,32].forEach(row=>requests.push({repeatCell:{range:sysPerkRange_(id,row,row,7,7),cell:{},fields:'userEnteredValue,dataValidation'}}));
  [passive,active].forEach((r,i)=>{
    const current=String(sheet.getRange(r,7).getDisplayValue()||'пусто');
    requests.push(sysCellRequest_(id,r,7,{text:current}));
    requests.push({setDataValidation:{range:sysPerkRange_(id,r,r+(i?5:3),7,8),rule:{condition:{type:'ONE_OF_RANGE',values:[{userEnteredValue:'=$'+(i?'BL':'BK')+'$1:$'+(i?'BL':'BK')+'$30'}]},strict:true,showCustomUi:true}}});
    requests.push(sysCellRequest_(id,i?32:25,68,'=IF(ISNUMBER(MATCH($G$'+r+';$'+(i?'BL':'BK')+'$1:$'+(i?'BL':'BK')+'$30;0));$G$'+r+';"пусто")'));
  });
  return requests;
}

function sysPerkLayoutRequests_(id,kind,offset) {
  const roll=kind!=='core'&&kind!=='character',r=[],range=(a,b,c,d)=>sysPerkRange_(id,a,b,c,d);
  const put=(row,col,value)=>r.push(sysCellRequest_(id,row,col,value));
  const merge=(a,b,c,d)=>r.push({mergeCells:{range:range(a,b,c,d),mergeType:'MERGE_ALL'}});
  const heights=(a,b,pixels)=>r.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:a-1,endIndex:b},properties:{pixelSize:pixels},fields:'pixelSize'}});
  const area=roll?range(39+(offset||0),70,6,13):range(31,54,5,13);
  r.push({unmergeCells:{range:area}},{repeatCell:{range:area,cell:{},fields:'userEnteredValue,dataValidation'}},sysPerkPaint_(area,'3f3f3f','ffffff',false));
  if(roll){
    const shift=offset||0;
    [[23+shift,25+shift,28+shift,'Пассивные перки','6d855b','c4d6b4',25],[30+shift,32+shift,37+shift,'Активные перки','466d8b','bed5e5',32]].forEach(([title,first,last,label,head,bg,selected])=>{
      // Keep the template's original colors, borders, font and emphasis.
      put(title,6,label);put(title+1,6,'');put(title+1,7,'Название');put(title+1,9,'Описание');
      put(first,6,sysPerkImageFormula_('$BP$'+selected,0));
      put(first,9,'=IF(OR($BP$'+selected+'="";$BP$'+selected+'="пусто");"";XLOOKUP('+sysPerkNorm_('$BP$'+selected)+';ARRAYFORMULA('+sysPerkNorm_('$BM$2:$BM$24')+');$BN$2:$BN$24;"";0))');
    });
    const title=44,first=title+1;
    merge(title,title,6,13);put(title,6,'Полученные перки');r.push(sysPerkPaint_(range(title,title,6,13),'805b73','ffffff',true));
    // The ledger export contains purchased/awarded perks only; the class card is separate.
    for(let n=0;n<20;n++){
      const row=first+n,key='$BJ'+row;
      merge(row,row,7,8);merge(row,row,9,13);
      put(row,62,'=IF($A$2="";"";LET(perks;'+sysOwnedPerksExpr_()+';IF(perks="";"";IFERROR(INDEX(SPLIT(perks;CHAR(10));1;'+(n+1)+');""))))');
      put(row,6,sysPerkImageFormula_(key,44));
      put(row,7,sysAcquiredPerkTypeFormula_(row,n===0));
      put(row,9,sysAcquiredPerkLabelFormula_(row,n===0));
    }
    heights(38+shift,43,21);heights(44,44,32);heights(45,64,48);heights(65,70,21);
    r.push(sysReadablePerkFormat_(range(title,title,6,13),'795064','Calibri',12,true,'CENTER','ffffff'));
    r.push(sysReadablePerkFormat_(range(first,first+19,6,13),'3f3f3f','Calibri',12,false,'LEFT','ffffff'));
    r.push(sysPerkBorderRequest_(range(title,title,6,13),'795064','SOLID_MEDIUM'));
    const line={style:'SOLID',colorStyle:{rgbColor:sysPerkColor_('3f3f3f')}};
    r.push({updateBorders:{range:range(first,first+19,6,13),top:line,bottom:line,left:line,right:line,innerHorizontal:line,innerVertical:line}});
    r.push(sysPerkBorderRequest_(range(first,first,6,13),'795064','SOLID'));
  }else{
    merge(32,32,5,12);put(32,5,'Перки персонажа');r.push(sysPerkPaint_(range(32,32,5,12),'805b73','ffffff',true));
    merge(33,33,5,6);merge(33,33,8,12);put(33,5,'Тип');put(33,8,'Название');r.push(sysPerkPaint_(range(33,36,5,12),'d9becb','202020',false));
    put(34,62,'=IFNA(VLOOKUP(TRIM($C$2);$AN$1:$AO$3;2;FALSE);"")');
    put(35,62,sysPerkGroupFormula_('Пассивный'));put(36,62,sysPerkGroupFormula_('Активный'));
    ['Классовый','Пассивные','Активные'].forEach((label,i)=>{
      const row=34+i,key='$BJ'+row,first='INDEX(SPLIT('+key+';" • ";FALSE);1;1)';
      merge(row,row,5,6);merge(row,row,8,12);put(row,5,label);put(row,8,'=IF('+key+'="";"—";'+key+')');
      put(row,7,i?sysPerkImageFormula_('IFERROR('+first+';"")',44):'=IF($BJ34="";"";IFNA(IMAGE(VLOOKUP(TRIM($C$2);$AN$1:$AP$3;3;FALSE);1);""))');
    });
    heights(34,54,36);heights(32,32,32);heights(33,33,28);heights(34,36,56);
    r.push(sysReadablePerkFormat_(range(32,32,5,12),'795064','Arial',12,true,'CENTER','ffffff'));
    r.push(sysReadablePerkFormat_(range(33,33,5,12),'d9b9c8','Arial',12,true,'CENTER','202020'));
    r.push(sysReadablePerkFormat_(range(34,36,5,12),'f7eef2','Arial',12,false,'CENTER','202020'));
    r.push({repeatCell:{range:range(34,36,8,12),cell:{userEnteredFormat:{horizontalAlignment:'LEFT'}},fields:'userEnteredFormat.horizontalAlignment'}});
    r.push(sysPerkBorderRequest_(range(32,36,5,12),'795064','SOLID_MEDIUM'));
    r.push({updateBorders:{range:range(33,36,5,12),innerHorizontal:{style:'SOLID',colorStyle:{rgbColor:sysPerkColor_('c7a3b3')}},innerVertical:{style:'SOLID',colorStyle:{rgbColor:sysPerkColor_('c7a3b3')}}}});
  }
  if(kind==='character')r.push(...sysPersonalPerksRequests_(id));
  return r;
}

function sysTopClassRequests_(id,resident) {
  const requests=[
    {unmergeCells:{range:sysPerkRange_(id,5,8,1,4)}},
    {repeatCell:{range:sysPerkRange_(id,5,8,1,4),cell:{},fields:'userEnteredValue,dataValidation'}},
    {mergeCells:{range:sysPerkRange_(id,5,8,1,1),mergeType:'MERGE_ALL'}},
    {mergeCells:{range:sysPerkRange_(id,5,resident?6:8,2,4),mergeType:'MERGE_ALL'}},
    sysReadablePerkFormat_(sysPerkRange_(id,4,4,1,4),'f4c7a1','Calibri',12,true,'CENTER','202020'),
    sysReadablePerkFormat_(sysPerkRange_(id,5,8,1,4),'fff1e6','Calibri',13,true,'CENTER','202020'),
    sysCellRequest_(id,4,1,'Классовый перк'),
    sysCellRequest_(id,5,2,resident?'=IFNA(VLOOKUP(TRIM($C$2);$AN$1:$AO$3;2;FALSE);"")':sysResidentClassLabelFormula_()),
    sysCellRequest_(id,5,1,'=IF($B$5="";"";IFNA(IMAGE(VLOOKUP(TRIM($C$2);$AN$1:$AP$3;3;FALSE));""))'),
    sysPerkBorderRequest_(sysPerkRange_(id,4,8,1,4),'c98f6a','SOLID_THICK'),
    {updateBorders:{range:sysPerkRange_(id,5,8,1,1),right:{style:'SOLID',colorStyle:{rgbColor:sysPerkColor_('c98f6a')}}}}
  ];
  if(resident){
    [7,8].forEach((row,i)=>{
      requests.push({mergeCells:{range:sysPerkRange_(id,row,row,2,3),mergeType:'MERGE_ALL'}});
      requests.push(sysCellRequest_(id,row,2,i?'=$BO$4':'=IF($BO$3="";"Навыки не выбраны";$BO$3)'));
      requests.push(sysCellRequest_(id,row,4,'=IF($BO$'+(3+i)+'="";"";"+1")'));
    });
    requests.push({repeatCell:{range:sysPerkRange_(id,7,8,2,4),cell:{userEnteredFormat:{textFormat:{fontFamily:'Calibri',fontSize:12,bold:false}}},fields:'userEnteredFormat.textFormat.fontFamily,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.bold'}});
  }
  return requests;
}

function sysResidentLayout_(sheet) {return String(sheet.getRange('C2').getDisplayValue()).trim().toLowerCase()==='житель'||sheet.getName()==='Житель';}
function sysResidentClassLabelFormula_() {
  return '=IFNA(LET(name;VLOOKUP(TRIM($C$2);$AN$1:$AO$3;2;FALSE);IF(LOWER(TRIM($C$2))="житель";name&CHAR(10)&IF($BO$3="";"Навыки не выбраны";$BO$2&" (+1)");name));"")';
}
function sysResidentSourceRequests_(sheet) {
  if(!sheet)throw Error('schema_changed');
  const id=sheet.getSheetId(),requests=[];
  if(sheet.getMaxColumns()<7)requests.push({appendDimension:{sheetId:id,dimension:'COLUMNS',length:7-sheet.getMaxColumns()}});
  requests.push(sysCellRequest_(id,1,7,'Навыки классового перка'));
  requests.push(sysCellRequest_(id,2,7,'=IFERROR(LET(ledger;IMPORTRANGE("'+SYS_CONTROL+'";"\'Перки\'!I2:N");ids;FILTER(INDEX(ledger;;1);INDEX(ledger;;2)="twice_learned_chemist";INDEX(ledger;;3)="class");skills;FILTER(INDEX(ledger;;6);INDEX(ledger;;2)="twice_learned_chemist";INDEX(ledger;;3)="class");MAP($A$2:$A$1000;$B$2:$B$1000;LAMBDA(name;id;IF(name="";"";XLOOKUP(id;ids;skills;"";0;-1)))));"")'));
  return requests;
}
function sysResidentRollFormula_(formula,row) {
  if(!formula||formula.includes('DOTD_RESIDENT_ROLL_V1'))return formula;
  const legacy=new RegExp('\\+IF\\(AND\\(\\$?C\\$?2="Житель";OR\\(\\$?F\\$?'+row+'=\\$?B\\$?7;\\$?F\\$?'+row+'=\\$?B\\$?8\\)\\);1;0\\)','g');
  const base=formula.slice(1).replace(legacy,'');
  if(/\$?B\$?[78]\b/.test(base))throw Error('resident_formula_changed');
  const target='$F$'+row;
  return '=LET(base;'+base+';IF(ISNUMBER(base);base+IF(AND(LOWER(TRIM($C$2))="житель";'+target+'<>"";$BO$3<>"";OR('+target+'=$BO$3;'+target+'=$BO$4));1;0)+N("DOTD_RESIDENT_ROLL_V1");base))';
}
function sysResidentRequests_(sheet,kind) {
  const id=sheet.getSheetId(),roll=kind!=='core'&&kind!=='character',requests=[],put=(r,c,v)=>requests.push(sysCellRequest_(id,r,c,v));
  const gate='AND($A$2<>"";LOWER(TRIM($C$2))="житель"'+(kind==='core'?'':';IFERROR($AA$2;"")=TRIM($A$2)')+')';
  const allowed='^(Анализ|История|Расследование|Инженерия|Медицина|Убеждение)$';
  put(1,32,kind==='core'?"=ARRAYFORMULA('_Связь_перков'!A1:G1000)":'=IMPORTRANGE("'+SYS_CORE+'";"\'_Связь_перков\'!A1:G1000")');
  put(1,67,'Навыки классового перка');
  put(2,67,'=IF('+gate+';IFERROR(LET(raw;XLOOKUP(TRIM($A$2);$AF$2:$AF$1000;$AL$2:$AL$1000;"";0);clean;SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(raw;CHAR(34);"");"[";"");"]";"");chosen;ARRAYFORMULA(TRIM(SPLIT(clean;",")));one;INDEX(chosen;1;1);two;INDEX(chosen;1;2);IF(AND(COLUMNS(chosen)=2;one<>two;REGEXMATCH(one;"'+allowed+'");REGEXMATCH(two;"'+allowed+'"));one&", "&two;"Не выбраны"));"Не выбраны");"")');
  [3,4].forEach((r,i)=>put(r,67,'=IF(OR($BO$2="";$BO$2="Не выбраны");"";IFERROR(INDEX(SPLIT($BO$2;", ";FALSE);1;'+(i+1)+');""))'));
  if(roll){const row=16+sysPerkOffset_(sheet),formula=sheet.getRange(row,12).getFormula();if(formula)put(row,12,sysResidentRollFormula_(formula,row));}
  else if(kind==='core')put(34,8,sysResidentClassLabelFormula_());
  return requests;
}

function sysReadablePerkFormat_(range,bg,font,size,bold,align,fg) {
  return {repeatCell:{range:range,cell:{userEnteredFormat:{backgroundColorStyle:{rgbColor:sysPerkColor_(bg)},textFormat:{fontFamily:font,fontSize:size,bold:bold,foregroundColorStyle:{rgbColor:sysPerkColor_(fg)}},horizontalAlignment:align,verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'}},fields:'userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy'}};
}
function sysPerkBorderRequest_(range,color,style) {
  const border={style:style,colorStyle:{rgbColor:sysPerkColor_(color)}};
  return {updateBorders:{range:range,top:border,bottom:border,left:border,right:border}};
}
function sysPerkRuleRequests_(sheet,kind,offset) {
  if(kind==='core'||kind==='character')return [];
  const marker='DOTD_ACQUIRED_PERKS_V5';
  if(sheet.getConditionalFormatRules().some(rule=>(rule.getBooleanCondition()?.getCriteriaValues()||[]).some(v=>String(v).includes(marker))))return [];
  const first=45;
  const remove=[];sheet.getConditionalFormatRules().forEach((rule,i)=>{if((rule.getBooleanCondition()?.getCriteriaValues()||[]).some(v=>String(v).includes('DOTD_ACQUIRED_PERKS_V4')))remove.unshift({deleteConditionalFormatRule:{sheetId:sheet.getSheetId(),index:i}});});
  return remove.concat([{addConditionalFormatRule:{index:0,rule:{ranges:[sysPerkRange_(sheet.getSheetId(),first,first+19,6,13)],booleanRule:{condition:{type:'CUSTOM_FORMULA',values:[{userEnteredValue:'=AND(N("'+marker+'")=0;OR(ROW()='+first+';$BJ'+first+'<>""))'}]},format:{backgroundColorStyle:{rgbColor:sysPerkColor_('f7eef2')},textFormat:{foregroundColorStyle:{rgbColor:sysPerkColor_('202020')}}}}}}}]);
}

/** Personal sheets show acquired perks only; class details stay in the roll card. */
function sysPersonalPerksRequests_(id) {
  const r=[],range=(a,b,c,d)=>sysPerkRange_(id,a,b,c,d);
  r.push({unmergeCells:{range:range(34,36,5,12)}},{repeatCell:{range:range(34,36,5,12),cell:{},fields:'userEnteredValue,dataValidation'}});
  ['Пассивные','Активные'].forEach((label,i)=>{
    const row=34+i,last=i?36:34,key='$BJ'+row;
    [[5,6],[7,7],[8,12]].forEach(([c,d])=>r.push({mergeCells:{range:range(row,last,c,d),mergeType:'MERGE_ALL'}}));
    r.push(sysCellRequest_(id,row,62,sysPerkGroupFormula_(i?'Активный':'Пассивный')));
    r.push(sysCellRequest_(id,row,5,label),sysCellRequest_(id,row,8,'=IF('+key+'="";"—";'+key+')'));
    r.push(sysCellRequest_(id,row,7,sysPerkImageFormula_('IFERROR(INDEX(SPLIT('+key+';" • ";FALSE);1;1);"")',0)));
  });
  r.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:33,endIndex:34},properties:{pixelSize:56},fields:'pixelSize'}});
  r.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:34,endIndex:36},properties:{pixelSize:28},fields:'pixelSize'}});
  return r;
}
function sysPerkEmphasisRequests_(id,kind,offset) {
  const ranges=kind==='core'||kind==='character'?[sysPerkRange_(id,32,36,5,12)]:[sysPerkRange_(id,4,8,1,4),sysPerkRange_(id,23+offset,28+offset,6,13),sysPerkRange_(id,30+offset,37+offset,6,13),sysPerkRange_(id,44,64,6,13)];
  return ranges.map(range=>({repeatCell:{range,cell:{userEnteredFormat:{horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE',textFormat:{bold:true,fontSize:12}}},fields:'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize'}}));
}

function sysAcquiredPerkLabelFormula_(row,first) {
  const key='$BJ'+row,empty=first?'Нет полученных перков':'';
  return '=IF($A$2="";"";IF('+key+'="";"'+empty+'";'+key+'))';
}
function sysAcquiredPerkTypeFormula_(row,first) {
  const key='$BJ'+row;
  return '=IF($A$2="";"";IF('+key+'="";"'+(first?'—':'')+'";IFNA(XLOOKUP('+sysPerkNorm_(key)+';ARRAYFORMULA('+sysPerkNorm_('$AQ$2:$AQ$21')+');$AR$2:$AR$21);"Тип не указан")))';
}

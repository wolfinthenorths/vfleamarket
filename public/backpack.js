/* Inventory ownership and per-branch backpack editor. All writes are server checked. */
(() => {
  let dispose = () => {};
  // A single request survives navigation. Only display snapshots are cached;
  // branch joins and saves always go through the server's live checks.
  const snapshots=new Map(), requests=new Map(), generations=new Map();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const cacheKey=(scope,branchId)=>JSON.stringify([String(scope),branchId||'']);
  const generation=scope=>generations.get(String(scope))||0;
  function invalidate(scope){
    scope=String(scope);generations.set(scope,generation(scope)+1);
    for(const map of [snapshots,requests])for(const key of map.keys())if(JSON.parse(key)[0]===scope)map.delete(key);
  }
  function remember(scope,branchId,result){
    const entry={value:clone(result),at:Date.now()};
    snapshots.set(cacheKey(scope,branchId),entry);
    if(result.pack)snapshots.set(cacheKey(scope,result.pack.branchId),entry);
  }
  function snapshot(scope,branchId){
    const entry=snapshots.get(cacheKey(scope,branchId));
    return entry&&Date.now()-entry.at<300000?clone(entry.value):null;
  }
  function requestInventory(api,scope,branchId){
    const key=cacheKey(scope,branchId);
    if(requests.has(key))return requests.get(key);
    const epoch=generation(scope);
    const request=Promise.resolve().then(()=>api('inventory',{branchId})).then(result=>{
      if(epoch!==generation(scope))return null;
      remember(scope,branchId,result);return result;
    }).catch(error=>{if(['not_bound','unauthorized'].includes(error.code))invalidate(scope);throw error;}).finally(()=>{
      if(requests.get(key)===request)requests.delete(key);
    });
    requests.set(key,request);return request;
  }
  function preload({api,scope}){
    let branchId='';try{branchId=localStorage.getItem('flea:branch:v1:'+scope)||'';}catch{}
    const entry=snapshots.get(cacheKey(scope,branchId));
    if(entry&&Date.now()-entry.at<30000)return Promise.resolve();
    return requestInventory(api,scope,branchId).catch(()=>{});
  }
  const sorted = items => [...items].sort((a,b)=>a.id.localeCompare(b.id)).map(i=>({id:i.id,quantity:i.quantity}));
  function render(options) {
    dispose();
    const {main, api, esc, counted, scope, authenticated, catalog, notify=()=>{}} = options;
    const wrongBranch='Выберите корректную ветку';
    main.innerHTML='<h1 class="page-title">Инвентарь</h1><p class="page-lead">Все вещи персонажа и рюкзак для выбранной главы.</p><section id="backpack-view"><div class="loading-card">Открываем инвентарь…</div></section>';
    const root=document.getElementById('backpack-view');
    if(!authenticated){root.innerHTML='<section class="empty"><h2>Что удалось раздобыть?</h2><p>Откройте магазин через бота, чтобы увидеть свои вещи.</p><a class="primary" href="https://t.me/vfleamarketbot">К торговым рядам ↗</a></section>';return;}
    const key='flea:branch:v1:'+scope,pendingKey='flea:packpending:v1:'+scope;
    let data=null,draft={},branchId='',chapter='',busy=false,conflict=false,message='',pending=null,stopped=false,loading=false,receipts='';
    try{branchId=localStorage.getItem(key)||'';pending=JSON.parse(localStorage.getItem(pendingKey)||'null');if(pending)branchId=pending.branchId;}catch{}
    const asLines=()=>sorted(Object.entries(draft).filter(([,q])=>q>0).map(([id,quantity])=>({id,quantity})));
    const dirty=()=>data?.pack&&JSON.stringify(asLines())!==JSON.stringify(sorted(data.pack.items));
    const available=item=>Math.max(0,item.quantity-(data?.pack?.manualItems||[]).filter(i=>i.id===item.id).reduce((sum,i)=>sum+i.quantity,0));
    const used=()=>Object.entries(draft).reduce((sum,[id,q])=>sum+(data.items.find(i=>i.id===id)?.slots||0)*q,data?.pack?.manualSlots||0);
    const itemImages={};for(const shop of catalog.shops)for(const item of shop.items)itemImages[item.id]=item.image;
    function alive(){return !stopped&&root.isConnected;}
    function adopt(result,reset=false){
      if(!alive())return;
      const wasDirty=dirty(),old=data?.pack;
      if(result.pack){
        branchId=result.pack.branchId;chapter=result.pack.chapter;
        try{localStorage.setItem(key,branchId);}catch{}
        if(reset||!old||!wasDirty){draft=Object.fromEntries(result.pack.items.map(i=>[i.id,i.quantity]));conflict=false;}
        else if(JSON.stringify(sorted(old.items))!==JSON.stringify(sorted(result.pack.items))||JSON.stringify(old.manualItems)!==JSON.stringify(result.pack.manualItems)||JSON.stringify(old.manualUnknown)!==JSON.stringify(result.pack.manualUnknown))conflict=true;
      }
      data=result;
      if(result.incorrectBranch)message=wrongBranch;
      if(!chapter)chapter=result.branches?.at(-1)?.chapter||'';
      paint();
    }
    function paint(){
      if(!alive()||!data)return;
      if(data.waiting){root.innerHTML=`<section class="empty"><h2>${esc(data.notice||'Дождитесь своего листа или напомните о нем!')}</h2><button class="secondary" data-pack-refresh>Проверить снова</button></section>`;return;}
      const chapters=[...new Set(data.branches.map(b=>b.chapter))],branches=data.branches.filter(b=>b.chapter===chapter),pack=data.pack,current=used();
      const unavailable=busy||Boolean(pending)||!pack||conflict||Boolean(pack.manualUnknown.length);
      root.innerHTML=`<div class="backpack-controls"><label>Глава<select id="pack-chapter">${chapters.map(c=>`<option value="${esc(c)}" ${c===chapter?'selected':''}>Глава ${esc(c)}</option>`).join('')}</select></label><label>Ветка<select id="pack-branch"><option value="">Выберите ветку!</option>${branches.map(b=>`<option value="${esc(b.id)}" ${b.id===branchId?'selected':''}>${esc(b.id)}</option>`).join('')}</select></label><button class="secondary" data-pack-open ${!branchId||busy||pending?'disabled':''}>${busy?'Подключаем…':'Открыть рюкзак'}</button></div>${!pack?'<div class="backpack-notice" role="status">Выберите ветку!</div>':`<section class="pack-summary"><div><span class="eyebrow">Глава ${esc(pack.chapter)} · ветка ${esc(pack.branchId)}</span><h2>В рюкзаке: <span class="${current>pack.capacity?'pack-overflow':''}">${current} / ${pack.capacity}</span> слотов</h2></div><button class="secondary" data-pack-refresh ${busy?'disabled':''}>Обновить</button><progress max="${Math.max(1,pack.capacity)}" value="${Math.min(current,pack.capacity)}" aria-label="Занятые слоты"></progress>${current>pack.capacity?'<p class="pack-overflow" role="status">Перегруз. Уберите часть вещей перед сохранением.</p>':''}${pack.manualItems.length?`<p>Уже записано в таблице: ${pack.manualItems.map(i=>esc(i.name)+' × '+i.quantity).join(', ')}. Занято ${pack.manualSlots} сл.</p>`:''}${pack.manualUnknown.length?`<p class="pack-overflow">Нужно уточнить слоты у мастера: ${pack.manualUnknown.map(esc).join(', ')}.</p>`:''}<button class="primary" data-pack-save ${unavailable||!dirty()||current>pack.capacity?'disabled':''}>${busy?'Сохраняем…':'Сохранить рюкзак'}</button></section>`}${conflict?'<div class="backpack-notice" role="alert">Рюкзак изменился в таблице. Загрузите актуальный набор перед сохранением. <button class="text-button" data-pack-reset>Загрузить набор</button></div>':''}${message?`<p class="backpack-notice" role="status">${esc(message)}</p>`:''}${pending?'<button class="primary wide" data-pack-retry>Проверить сохранение рюкзака</button>':''}${data.manualUnknown?.length?`<p class="page-lead">В таблице также есть записи, для которых нужно уточнить предмет и слоты: ${data.manualUnknown.map(esc).join(', ')}.</p>`:''}<div class="section-head"><h2>Вещи персонажа</h2><small>${data.items.length?counted(data.items.length,'позиция','позиции','позиций'):'ПОКА ПУСТО'}</small></div>${data.items.length?`<section class="inventory-grid" aria-label="Предметы в инвентаре">${data.items.map(i=>`<article class="inventory-item">${itemImages[i.id]?`<img src="${esc(itemImages[i.id])}" alt="${esc(i.name)}" loading="lazy">`:''}<h2>${esc(i.name)}</h2><p>Всего: ${i.quantity} · ${counted(i.slots,'слот','слота','слотов')} за шт.</p><div class="inventory-pack-row"><span>В рюкзак</span><div class="quantity"><button data-pack-item="${esc(i.id)}" data-delta="-1" aria-label="Убрать из рюкзака: ${esc(i.name)}" ${unavailable||!draft[i.id]?'disabled':''}>−</button><span>${draft[i.id]||0}</span><button data-pack-item="${esc(i.id)}" data-delta="1" aria-label="В рюкзак: ${esc(i.name)}" ${unavailable||(draft[i.id]||0)>=available(i)||current+i.slots>(pack?.capacity||0)?'disabled':''}>+</button></div></div></article>`).join('')}</section>`:'<section class="empty"><h2>Пока пусто</h2><p>Покупки автоматически появятся здесь и в общей сводке.</p><a class="primary" href="#">К магазинам →</a></section>'}<details class="inventory-receipts"><summary data-pack-receipts>Квитанции</summary><div id="pack-receipts">${receipts||'<p>Открываем записи…</p>'}</div></details>`;
      root.querySelector('[data-pack-open]').remove();
      root.querySelector('.pack-summary [data-pack-refresh]')?.remove();
      root.querySelector('.pack-summary > div')?.classList.add('pack-summary-heading');
      root.querySelector('.backpack-controls').insertAdjacentHTML('beforeend',`<div class="backpack-actions"><button type="button" class="backpack-open" data-pack-open aria-label="Открыть рюкзак"><img src="/assets/ui/backpack.png" alt="" width="62" height="68"><span>${busy?'Подключаем…':'Рюкзак'}</span></button><button type="button" class="secondary pack-refresh" data-pack-refresh aria-busy="${loading}" ${busy||loading?'disabled':''}><svg class="${loading?'wallet-spinner':''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.3 7a8 8 0 0 1 13.4-1L20 12M4 12l1.3 6A8 8 0 0 0 18.7 17"/></svg><span>${loading?'Обновляем…':'Обновить'}</span></button></div>`);
      for(const select of root.querySelectorAll('select'))select.disabled=busy||Boolean(pending)||Boolean(dirty());
      root.querySelector('[data-pack-open]').disabled=!branchId||busy||Boolean(pending)||Boolean(dirty());
      if(dirty())root.insertAdjacentHTML('beforeend','<button class="text-button" data-pack-reset>Отменить изменения рюкзака</button>');
    }
    async function refresh(reset=false){
      if(loading||busy||!alive())return;loading=true;paint();
      try{const result=await requestInventory(api,scope,branchId);if(result)adopt(clone(result),reset);}catch(e){if(alive()){message=e.message;if(data)paint();else root.innerHTML=`<section class="empty"><p>${esc(message)}</p><button class="secondary" data-pack-refresh>Попробовать снова</button></section>`;}}
      finally{loading=false;paint();}
    }
    async function openBranch(){
      if(!branchId||busy||pending||dirty())return;
      const selected=data.branches.find(b=>b.id===branchId);
      if(selected&&!selected.hasSheet&&data.branches.some(b=>b.chapter===selected.chapter&&b.hasSheet)){
        message=wrongBranch;notify(message);window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');paint();return;
      }
      invalidate(scope);busy=true;message='';paint();
      try{const result=await api('branch_join',{branchId});remember(scope,branchId,result);adopt(result,true);message=result.waiting?'Дождитесь своего листа или напомните о нем!':'Рюкзак открыт.';}
      catch(e){message=e.message;if(e.code==='incorrect_branch')notify(message);}finally{busy=false;paint();}
    }
    async function save(){
      if(busy||!data?.pack)return;
      if(!pending){
        if(conflict||used()>data.pack.capacity)return;
        pending={branchId:data.pack.branchId,version:data.pack.version,items:asLines(),requestId:crypto.randomUUID()};
        try{localStorage.setItem(pendingKey,JSON.stringify(pending));}catch{pending=null;message='Не удалось сохранить запрос. Закройте приложение и откройте его снова.';paint();return;}
      }
      invalidate(scope);busy=true;message='';paint();
      try{const result=await api('pack_save',pending);pending=null;try{localStorage.removeItem(pendingKey);}catch{}remember(scope,branchId,result);adopt(result,true);message='Рюкзак сохранен в таблице.';}
      catch(e){
        message=e.message;
        if(['invalid_pack','item_not_owned','pack_full','pack_changed','manual_slots_unknown','invalid_capacity','character_sheet_missing','branch_sheet_missing','invalid_branch','incorrect_branch'].includes(e.code)){pending=null;try{localStorage.removeItem(pendingKey);}catch{}busy=false;await refresh();}
      }finally{busy=false;paint();}
    }
    root.addEventListener('change',event=>{
      if(event.target.id==='pack-chapter'){chapter=event.target.value;branchId='';data.pack=null;draft={};conflict=false;paint();}
      if(event.target.id==='pack-branch'){branchId=event.target.value;data.pack=null;draft={};conflict=false;message='';paint();}
    });
    root.addEventListener('click',async event=>{
      const button=event.target.closest('button,summary');if(!button)return;
      if(button.dataset.packItem){const item=data.items.find(i=>i.id===button.dataset.packItem),quantity=(draft[item.id]||0)+Number(button.dataset.delta);if(!busy&&!pending&&!conflict&&data.pack&&quantity>=0&&quantity<=available(item)&&(Number(button.dataset.delta)<0||used()+item.slots<=data.pack.capacity)){draft[item.id]=quantity;message='';paint();}}
      else if(button.hasAttribute('data-pack-open'))await openBranch();
      else if(button.hasAttribute('data-pack-save')||button.hasAttribute('data-pack-retry'))await save();
      else if(button.hasAttribute('data-pack-refresh'))await refresh();
      else if(button.hasAttribute('data-pack-reset'))await refresh(true);
      else if(button.hasAttribute('data-pack-receipts')&&!receipts){
        try{const result=await api('history');receipts=result.orders.map(o=>`<article class="history-card"><div class="history-head"><h3>${esc(o.shopName)}</h3><span>${esc(o.when)}</span></div><ul class="history-list">${o.lines.map(i=>`<li><span>${esc(i.name)} × ${i.quantity}</span><span>${i.total} кр.</span></li>`).join('')}</ul><p>Всего: ${o.total} кр.</p></article>`).join('')||'<p>Покупок пока нет.</p>';if(alive())root.querySelector('#pack-receipts').innerHTML=receipts;}catch(e){if(alive())root.querySelector('#pack-receipts').textContent=e.message;}
      }
    });
    const focus=()=>{const entry=snapshots.get(cacheKey(scope,branchId));if(document.visibilityState!=='hidden'&&(!entry||Date.now()-entry.at>=30000))refresh();};
    const timer=setInterval(focus,30000);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    dispose=()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
    const cached=snapshot(scope,branchId);if(cached&&!pending)adopt(cached,true);
    const entry=snapshots.get(cacheKey(scope,branchId));
    if(pending||!cached||!entry||Date.now()-entry.at>=30000)refresh().then(()=>{if(alive()&&pending&&data?.pack)save();});
  }
  window.BackpackView={render,preload,invalidate,stop:()=>dispose()};
})();

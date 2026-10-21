"use strict";
(() => {
  const $ = s => document.querySelector(s);
  const main = $('#main'), dialog = $('#sheet'), sheet = $('#sheet-content');
  const tg = window.Telegram?.WebApp;
  const hashData = new URLSearchParams(location.hash.replace(/^#/, ''));
  const initialData = tg?.initData || hashData.get('tgWebAppData') || '';
  const authenticated = Boolean(initialData);
  const scope = tg?.initDataUnsafe?.user?.id || 'guest';
  const cartKey = `flea:cart:v1:${scope}`, pendingKey = `flea:pending:v1:${scope}`;
  let catalog, byId = {}, carts = {}, state = null, pending = null, busy = false, stateLoading = null;
  const identityKey=`flea:identity:v1:${scope}`;
  let rememberedName='';
  try{const saved=JSON.parse(localStorage.getItem(identityKey)||'null');if(typeof saved?.name==='string'&&saved.name.length<=100)rememberedName=saved.name;}catch{}
  let category = 'Все', query = '', sort = 'default', activeShop = '', toastTimer;
  const pagePositions=new Map(),shopViews=new Map();
  let renderedRoute=null,restoringPosition=false,renderVersion=0;
  if(typeof history!=='undefined')history.scrollRestoration='manual';
  function rememberPosition(){if(!restoringPosition&&renderedRoute===routeValue())pagePositions.set(renderedRoute,window.scrollY||0);}
  addEventListener('scroll',rememberPosition,{passive:true});
  const esc = value => String(value ?? '').replace(/\u0451/g,'е').replace(/\u0401/g,'Е').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const caps = value => new Intl.NumberFormat('ru-RU').format(value);
  const counted = (n,one,few,many) => `${n} ${n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many}`;
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 8 2 12h14l2-12H3Zm4 0 5-6 5 6M8 12v4m4-4v4m4-4v4"/></svg>';
  const arrowIcon='<svg class="wallet-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
  const loadingIcon='<svg class="wallet-icon wallet-spinner" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7"/></svg>';
  // Touch and programmatic dialog focus should not draw browser focus frames.
  document.addEventListener('keydown',e=>{if(e.key==='Tab')document.documentElement.dataset.input='keyboard';});
  document.addEventListener('pointerdown',()=>{delete document.documentElement.dataset.input;},true);
  try { carts = JSON.parse(localStorage.getItem(cartKey) || '{}'); pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { carts = {}; }
  if (!carts || typeof carts !== 'object' || Array.isArray(carts)) carts = {};
  try { tg?.ready(); tg?.expand(); tg?.setHeaderColor('#1b241d'); tg?.setBackgroundColor('#1b241d'); tg?.disableVerticalSwipes?.(); } catch {}

  function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200); }
  function saveCart() { try { localStorage.setItem(cartKey, JSON.stringify(carts)); } catch {} updateCount(); }
  function updateCount() { const n = Object.values(carts).reduce((sum,c) => sum + Object.values(c || {}).reduce((s,q) => s + q,0),0); $('#cart-count').textContent = n; $('#cart-count').hidden = !n;const total=$('#cart-total');if(total){total.hidden=!n;total.textContent=caps(grandTotal())+' кр.';} }
  const shopOf = id => catalog.shops.find(s => s.id === id);
  function linesFor(id) { return Object.entries(carts[id] || {}).filter(([key,q]) => byId[key]?.shopId === id && Number.isInteger(q) && q > 0 && q <= 99).map(([key,q]) => ({...byId[key],quantity:q,total:q*byId[key].price})); }
  const totalFor = id => linesFor(id).reduce((s,i) => s+i.total,0);
  const grandTotal = () => (catalog?.shops||[]).reduce((sum,s)=>sum+totalFor(s.id),0);
  const countFor = id => linesFor(id).reduce((s,i) => s+i.quantity,0);
  const quantityControl = (id,quantity,context='') => `<div class="quantity" aria-label="Количество"><button data-change="${id}" data-delta="-1" data-context="${context}" aria-label="Убрать одну штуку">−</button><span>${quantity}</span><button data-change="${id}" data-delta="1" data-context="${context}" aria-label="Добавить одну штуку" ${quantity>=99?'disabled':''}>+</button></div>`;
  function picture(s) { return s.banner ? `<div class="shop-art"><img src="${s.banner}" data-poster="${s.poster || ''}" alt="${esc(s.name)}" loading="lazy"></div>` : `<div class="shop-art nuka-art" aria-label="Автомат Нюка-Колы">${[s.items[0],s.items[1],s.items[7]].map(i=>`<img src="${i.image}" alt="" loading="lazy">`).join('')}</div>`; }
  function applyMotion() { if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll('img[data-poster]').forEach(img => { if(img.dataset.poster) img.src = img.dataset.poster; }); }
  function wallet() {
    const loading=Boolean(stateLoading);
    $('#player-label').textContent=state?.character?.name||(authenticated?rememberedName||'Ваш персонаж':'Личный счет');
    $('#balance-label').innerHTML=loading?`<span class="wallet-status">Загружается…${loadingIcon}</span>`:state?.character?`${caps(state.balance)} <span class="unit">крышек</span>`:`<span class="wallet-status">${authenticated?'Выбрать':'Войти'}${arrowIcon}</span>`;
    $('#wallet').setAttribute('aria-busy',String(loading));
  }
  function showNote(message='') { $('#service-note').textContent=message; $('#service-note').hidden=!message; }
  async function api(path,body={}) {
    if(path==='inventory'&&stateLoading)await stateLoading;
    const abort = new AbortController(), timer=setTimeout(()=>abort.abort(),62000);
    try {
      const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'tma '+initialData},body:JSON.stringify(body),signal:abort.signal,credentials:'same-origin',cache:'no-store'});
      let data; try {data=await r.json();} catch {throw Object.assign(new Error('Касса временно не отвечает. Повторите проверку покупки.'),{code:'connection_failed'});}
      if(!r.ok || !data.ok) throw Object.assign(new Error(data.message || 'Не удалось связаться с кассой.'),{code:data.error || 'connection_failed'});
      return data;
    } catch(e) { if(e.name==='AbortError') throw Object.assign(new Error('Ответ кассы задерживается. Проверьте покупку еще раз.'),{code:'connection_failed'}); throw e; }
    finally {clearTimeout(timer);}
  }
  async function loadState() {
    if(!authenticated) return null;
    if(stateLoading)return stateLoading;
    stateLoading=api('state').then(result=>{if(state&&state.character?.id!==result.character?.id)window.BackpackView?.invalidate(scope);state=result;rememberIdentity();if(state.character)window.BackpackView?.preload({api,scope});showNote('');return result;}).finally(()=>{stateLoading=null;wallet();});
    wallet();
    return stateLoading;
  }
  function rememberIdentity(){rememberedName=state?.character?.name||'';try{if(rememberedName)localStorage.setItem(identityKey,JSON.stringify({name:rememberedName}));else localStorage.removeItem(identityKey);}catch{}}
  function routeValue() { const h=location.hash.slice(1); return h.startsWith('tgWebApp')?'':h; }
  function go(hash) { rememberPosition();if(routeValue()===hash) render(); else location.hash=hash; }
  function render() {
    if(!catalog) return;
    window.BackpackView?.stop();
    const route=routeValue();
    const position=route===renderedRoute?(window.scrollY||0):(pagePositions.get(route)||0),version=++renderVersion;
    if(activeShop)shopViews.set(activeShop,{category,query,sort});
    renderedRoute=route;restoringPosition=true;
    document.querySelectorAll('[data-nav]').forEach(a=>{ const current=a.dataset.nav==='market' ? !route || route.startsWith('shop/') : route.startsWith(a.dataset.nav) || a.dataset.nav==='inventory' && route==='history'; a.toggleAttribute('aria-current',current); if(current)a.setAttribute('aria-current','page'); });
    try { if(route) tg?.BackButton.show(); else tg?.BackButton.hide(); } catch {}
    if(route.startsWith('shop/') && shopOf(route.split('/')[1])) renderStore(route.split('/')[1]);
    else if(route.startsWith('carts')) renderCarts();
    else if(route==='inventory'||route==='history') renderInventory();
    else renderHome();
    updateCount(); applyMotion();
    const restore=()=>{if(version!==renderVersion)return;window.scrollTo({top:position,behavior:'instant'});restoringPosition=false;};
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(restore);else restore();
  }
  function renderHome() {
    activeShop='';
    main.innerHTML=`<section class="intro"><div><span class="eyebrow">Торговые ряды Блошиного рынка</span><h1>Впервые у нас,<br>Выживший?</h1><p>Скорее подходи к торговым рядам!</p><span class="market-stamp">6 магазинов · 136 товаров</span></div><figure class="market-art"><img src="/assets/banners/market.gif" data-poster="/assets/banners/market.webp" alt="Блошиный рынок Dawn of the Dead"><figcaption><span>FLEA MARKET</span><span>НАЙДЕТСЯ ВСЕ!</span></figcaption></figure></section><div class="section-head"><h2>Торговые ряды</h2><small>ВЫБЕРИТЕ МАГАЗИН</small></div><section class="shops-grid" aria-label="Магазины">${catalog.shops.map((s,n)=>`<a class="shop-card" href="#shop/${s.id}" >${picture(s)}<div class="shop-info"><span class="eyebrow">0${n+1} / ${esc(s.tagline)}</span><h3>${esc(s.name)}</h3><p>${esc(s.shortDescription)}</p><div class="shop-foot"><span>${counted(s.items.length,'товар','товара','товаров')}${countFor(s.id)?` · в корзине ${countFor(s.id)}`:''}</span><span class="arrow" aria-hidden="true">↗</span></div></div></a>`).join('')}</section>${!authenticated?'<p class="guest-note">Каталог открыт для просмотра. Для покупок и своего баланса откройте магазин в <a href="https://t.me/vfleamarketbot">@vfleamarketbot ↗</a>.</p>':''}`;
  }
  function renderStore(id) {
    if(activeShop!==id){const saved=shopViews.get(id);category=saved?.category||'Все';query=saved?.query||'';sort=saved?.sort||'default';activeShop=id;}
    const s=shopOf(id);
    main.innerHTML=`<a class="back-link" href="#"><span>←</span> Все магазины</a><section class="store-hero"><div><span class="eyebrow">${esc(s.tagline)} / БЛОШИНЫЙ РЫНОК</span><h1>${esc(s.name)}</h1><p>${esc(s.description)}</p><span class="store-badge">${counted(s.items.length,'товар','товара','товаров')} <span aria-hidden="true">·</span> Оплата крышками</span></div>${picture(s)}</section><div class="shop-toolbar"><div class="search-row"><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="search" type="search" placeholder="Найти предмет…" aria-label="Найти предмет" value="${esc(query)}" autocomplete="off"></label><select id="sort" aria-label="Сортировка"><option value="default">По порядку</option><option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option><option value="name">По названию</option></select></div><div class="category-list" aria-label="Категории">${['Все',...new Set(s.items.map(i=>i.category))].map(c=>`<button class="category" data-category="${esc(c)}" aria-pressed="${c===category}">${esc(c)}</button>`).join('')}</div></div><div class="product-meta"><span id="results-count"></span><span>Нажмите на товар — подробнее</span></div><section id="products" class="products" aria-label="Товары"></section><div id="store-cart-holder"></div>`;
    $('#sort').value=sort; $('#search').addEventListener('input',e=>{query=e.target.value;renderProducts();}); $('#sort').addEventListener('change',e=>{sort=e.target.value;renderProducts();});
    renderProducts(); renderStoreCart();
  }
  function renderProducts() {
    const s=shopOf(activeShop); if(!s || !$('#products'))return;
    const normalize=x=>x.toLocaleLowerCase('ru').replace(/\u0451/g,'е');
    let items=s.items.filter(i=>(category==='Все'||i.category===category) && normalize([i.name,i.category,...i.effects].join(' ')).includes(normalize(query.trim())));
    if(sort==='price-asc') items.sort((a,b)=>a.price-b.price); if(sort==='price-desc')items.sort((a,b)=>b.price-a.price); if(sort==='name')items.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    $('#results-count').textContent=`Найдено: ${items.length}`;
    $('#products').innerHTML=items.map(i=>`<article class="product"><button class="product-open" data-detail="${i.id}" aria-label="${esc(i.name)} — подробнее"><span class="product-image"><img src="${i.image}" alt="" loading="lazy"></span><span class="product-kicker">${esc(i.category)} · ${i.slots} сл.</span><h3>${esc(i.name)}</h3><span class="product-effect">${esc(i.effects[0]?.replace(/^Баффы: /,'') || i.description.split('.')[0])}</span></button><div class="product-foot"><span class="price">${caps(i.price)} <small>кр.</small></span>${carts[activeShop]?.[i.id]?quantityControl(i.id,carts[activeShop][i.id]):`<button class="add-button" data-change="${i.id}" data-delta="1" aria-label="В корзину: ${esc(i.name)}">+</button>`}</div></article>`).join('');
    if(!items.length)$('#products').innerHTML='<p class="page-lead">Ничего не нашлось. Попробуйте другое название.</p>';
  }
  function renderStoreCart(){if(!$('#store-cart-holder'))return;const total=grandTotal(),n=countFor(activeShop);$('#store-cart-holder').innerHTML=total?`<a href="#carts" class="store-cart-bar"><span>Все корзины<small>${n?`Этот магазин: ${caps(totalFor(activeShop))} кр.`:'Из всех магазинов'}</small></span><span>${caps(total)} кр. <span aria-hidden="true">→</span></span></a>`:'';}
  function pendingHtml(){return pending?'<section class="pending-box"><h2>Проверяем покупку</h2><p>Касса еще не подтвердила результат. Сохранен номер заказа — повторная проверка не спишет крышки еще раз.</p><button class="primary" data-retry '+(busy?'disabled':'')+'>'+(busy?'Получаем ответ…':'Проверить результат')+'</button></section>':'';}
  function renderCarts() {
    activeShop='';const only=routeValue().split('/')[1];let groups=catalog.shops.filter(s=>linesFor(s.id).length);if(only&&groups.some(s=>s.id===only))groups=groups.filter(s=>s.id===only);
    main.innerHTML=`<h1 class="page-title">Ваши корзины</h1><p class="page-lead">Каждый магазин оформляет свою покупку отдельно.</p>${pendingHtml()}${groups.length?groups.map(s=>{const lines=linesFor(s.id),total=totalFor(s.id);return `<section class="cart-group"><div class="cart-group-head"><h2>${esc(s.name)}</h2><a href="#shop/${s.id}">В магазин ↗</a></div>${lines.map(i=>`<div class="cart-row"><img src="${i.image}" alt=""><div><h3>${esc(i.name)}</h3><p>${caps(i.price)} кр. за шт. · ${i.slots} сл.</p></div><div><div class="row-total">${caps(i.total)} <small>кр.</small></div>${quantityControl(i.id,i.quantity,'cart')}</div></div>`).join('')}<div class="cart-foot"><div><small>${counted(countFor(s.id),'предмет','предмета','предметов')} · ${counted(lines.reduce((n,i)=>n+i.slots*i.quantity,0),'слот','слота','слотов')}</small><span class="price">${caps(total)} <small>крышек</small></span></div><button class="primary" data-checkout="${s.id}" ${busy||pending?'disabled':''}>${authenticated ? state?.character ? 'К покупке →' : 'Выбрать персонажа' : 'Открыть в Telegram ↗'}</button>${state?.character?`<div class="balance-check ${state.balance<total?'insufficient':''}"><span>На счете: ${caps(state.balance)} кр.</span><span>${state.balance<total?`Не хватает ${caps(total-state.balance)} кр.`:`После покупки: ${caps(state.balance-total)} кр.`}</span></div>`:''}</div></section>`;}).join(''):`<section class="empty">${icon}<h2>Пока пусто</h2><p>Загляните в торговые ряды и добавьте понравившиеся предметы.</p><a class="primary" href="#">К магазинам →</a></section>`}`;
    if(grandTotal())main.insertAdjacentHTML('afterbegin',`<section class="cart-overview" aria-label="Общая сумма всех корзин"><span>Всего во всех корзинах</span><strong>${caps(grandTotal())} <small>крышек</small></strong></section>`);
    if(only)main.insertAdjacentHTML('beforeend','<a class="text-button" href="#carts">Все корзины</a>');
  }
  function renderInventory() {
    activeShop='';
    window.BackpackView.render({main,api,esc,counted,scope,authenticated,catalog,notify:toast});
  }
  function openSheet(html,entry=false) { dialog.classList.toggle('entry-screen',entry);sheet.innerHTML=`<div class="sheet-body"><button class="close-sheet" data-close aria-label="Закрыть">×</button>${html}</div>`;if(!dialog.open)dialog.showModal();applyMotion(); }
  function detail(id){const i=byId[id];if(!i)return;openSheet(`<div class="detail-image"><img src="${i.image}" alt="${esc(i.name)}"></div><span class="eyebrow">${esc(i.category)} / ${esc(shopOf(i.shopId).name)}</span><h2 id="sheet-title">${esc(i.name)}</h2><p class="detail-description">${esc(i.description)}</p>${i.effects.map(l=>{const n=l.indexOf(':');return `<p class="effect-line">${n>=0?`<strong>${esc(l.slice(0,n+1))}</strong>${esc(l.slice(n+1))}`:esc(l)}</p>`;}).join('')}<div class="detail-footer"><div><span class="price">${caps(i.price)} <small>крышек</small></span><small>Слотов: ${i.slots}</small></div>${carts[i.shopId]?.[id]?quantityControl(id,carts[i.shopId][id],'detail'):'<span class="eyebrow">В наличии</span>'}</div><button class="primary wide" data-add-detail="${id}">Добавить в корзину</button>`);}
  function change(id,delta,context=''){const i=byId[id];if(!i || busy || pending){if(pending)toast('Сначала проверьте результат предыдущей покупки.');return;}const c=carts[i.shopId]||(carts[i.shopId]={});const value=Math.max(0,Math.min(99,(c[id]||0)+delta));if(value)c[id]=value;else delete c[id];if(!Object.keys(c).length)delete carts[i.shopId];saveCart();if(routeValue().startsWith('shop/')){renderProducts();renderStoreCart();}else render();if(context==='detail')detail(id);try{tg?.HapticFeedback?.selectionChanged();}catch{}}
  async function profile(){
    if(!authenticated){openSheet('<span class="eyebrow">Личный счет</span><h2 id="sheet-title">Загляните через Telegram</h2><p class="detail-description">Бот узнает ваш аккаунт и покажет баланс персонажа.</p><a class="primary wide" href="https://t.me/vfleamarketbot">Открыть @vfleamarketbot ↗</a>');return;}
    openSheet('<h2 id="sheet-title">Личный счет</h2><p>Проверяем баланс…</p>');
    try{await loadState();if(state.character){openSheet(`<span class="eyebrow">Ваш персонаж</span><h2 id="sheet-title">${esc(state.character.name)}</h2><div class="profile-detail"><span>Крышек на счете</span><strong>${caps(state.balance)}</strong></div><p class="detail-description">Баланс обновляется из игровой таблицы. Если меняете персонажа, попросите мастера изменить привязку аккаунта.</p><button class="primary wide" data-close>Вернуться на рынок</button>`);}else showBind();}catch(e){openSheet(`<h2 id="sheet-title">Касса недоступна</h2><p class="detail-description">${esc(e.message)}</p><button class="secondary wide" data-profile>Попробовать снова</button>`);}
  }
  function showBind(){
    const characters=state.availableCharacters||[];
    if(!characters.length){openSheet(`<span class="eyebrow">Добро пожаловать на Блошиный рынок!</span><h2 id="sheet-title">Проверим имя в списке?</h2><p class="detail-description">${esc(state.bindingNotice||'Попросите мастера указать ваш Telegram username рядом с персонажем на листе «Игроки».')}</p><button class="primary wide" data-profile>Проверить снова</button><button class="text-button wide" data-close>Посмотреть каталог</button>`,true);return;}
    openSheet(`<span class="eyebrow">Добро пожаловать на Блошиный рынок!</span><h2 id="sheet-title">Назови свое имя и торговцы сразу же предложат товар!</h2><p class="detail-description">Крышки будут списаны с баланса персонажа автоматически.</p><span id="character-label">Персонаж</span><div class="character-picker"><button type="button" class="character-select" id="character-trigger" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-controls="character-options" aria-labelledby="character-label character-selected" data-character-toggle><span id="character-selected">Выберите имя</span><span aria-hidden="true">⌄</span></button><input type="hidden" id="character"><div class="character-options" id="character-options" role="listbox" aria-label="Персонаж" hidden>${characters.map(c=>`<button type="button" role="option" aria-selected="false" data-character="${c.id}">${esc(c.name)}</button>`).join('')}</div></div><label class="check-label"><input id="own-character" type="checkbox"><span>Это мой персонаж.</span></label><div id="bind-error" class="form-error" role="alert"></div><button class="primary wide" id="bind-button" data-bind>К торговым рядам →</button>`,true);
  }
  function showEntry(){if(!state.character){showBind();return;}openSheet(`<span class="eyebrow">Добро пожаловать на Блошиный рынок!</span><h2 id="sheet-title">${esc(state.character.name)}</h2><p class="detail-description">Крышки будут списаны с баланса персонажа автоматически.</p><div class="profile-detail"><span>На счете</span><strong>${caps(state.balance)} крышек</strong></div><button class="primary wide" data-close>К торговым рядам →</button>`,true);}
  function toggleCharacters(open){const list=$('#character-options');if(!list)return;list.hidden=!open;$('#character-trigger').setAttribute('aria-expanded',String(open));}
  function selectCharacter(id){const option=[...document.querySelectorAll('[data-character]')].find(b=>b.dataset.character===id);if(!option)return;$('#character').value=id;$('#character-selected').textContent=option.textContent;document.querySelectorAll('[data-character]').forEach(b=>b.setAttribute('aria-selected',String(b===option)));toggleCharacters(false);$('#character-trigger').focus();}
  dialog.addEventListener('keydown',e=>{const list=$('#character-options'),trigger=$('#character-trigger');if(!list||!trigger)return;const options=[...list.querySelectorAll('[data-character]')];if(e.key==='Escape'&&!list.hidden){e.preventDefault();e.stopPropagation();toggleCharacters(false);trigger.focus();return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||!(e.target===trigger||list.contains(e.target)))return;e.preventDefault();toggleCharacters(true);const index=options.indexOf(document.activeElement);const target=e.key==='Home'?0:e.key==='End'?options.length-1:index<0?(e.key==='ArrowUp'?options.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[target]?.focus();});
  async function bind(){const id=$('#character')?.value;if(!id || !$('#own-character')?.checked){$('#bind-error').textContent='Выберите имя и подтвердите, что это ваш персонаж.';return;}const b=$('#bind-button');b.disabled=true;b.textContent='Запоминаем…';try{state=await api('bind',{characterId:id});window.BackpackView?.invalidate(scope);window.BackpackView?.preload({api,scope});rememberIdentity();wallet();dialog.close();render();toast('Счет персонажа подключен.');}catch(e){$('#bind-error').textContent=e.message;b.disabled=false;b.textContent='К торговым рядам →';}}
  async function checkout(id){
    if(!authenticated){location.href='https://t.me/vfleamarketbot';return;}if(busy||pending)return;
    busy=true;renderCarts();
    try{if(!state?.character)await loadState();if(!state.character){showBind();return;}const lines=linesFor(id),total=totalFor(id);if(!lines.length)return;if(state.balance<total)await loadState();if(state.balance<total){toast(`Не хватает ${caps(total-state.balance)} крышек.`);return;}
      openSheet(`<span class="eyebrow">${esc(shopOf(id).name)}</span><h2 id="sheet-title">Все верно?</h2><p class="detail-description">Покупатель: ${esc(state.character.name)}</p><ul class="confirm-lines">${lines.map(i=>`<li><span>${esc(i.name)} × ${i.quantity}</span><span>${caps(i.total)} кр.</span></li>`).join('')}</ul><div class="confirm-total"><span>К оплате</span><span class="price">${caps(total)} <small>крышек</small></span></div><p class="confirm-balance">На счете ${caps(state.balance)} → останется ${caps(state.balance-total)} кр.</p><button class="primary wide" data-confirm="${id}">Списать ${caps(total)} крышек</button><button class="text-button wide" data-close>Вернуться к корзине</button>`);
    }catch(e){toast(e.message);}finally{busy=false;if(routeValue().startsWith('carts'))renderCarts();}
  }
  async function confirm(id){
    if(busy||pending)return;
    const payload={orderId:crypto.randomUUID(),shopId:id,revision:catalog.revision,expectedTotal:totalFor(id),items:linesFor(id).map(i=>({id:i.id,quantity:i.quantity}))};
    try{localStorage.setItem(pendingKey,JSON.stringify(payload));if(localStorage.getItem(pendingKey)!==JSON.stringify(payload))throw new Error();}catch{toast('Не удалось сохранить номер заказа. Закройте и снова откройте приложение.');return;}
    pending=payload;dialog.close();await submitPending();
  }
  async function submitPending(){
    if(busy||!pending)return;busy=true;render();
    try{const r=await api('checkout',pending),o=r.order;
      window.BackpackView?.invalidate(scope);window.BackpackView?.preload({api,scope});
      const old=carts[pending.shopId]||{};for(const i of pending.items){old[i.id]=Math.max(0,(old[i.id]||0)-i.quantity);if(!old[i.id])delete old[i.id];}if(!Object.keys(old).length)delete carts[pending.shopId];
      pending=null;try{localStorage.removeItem(pendingKey);}catch{}saveCart();state={...(state||{}),character:o.character,balance:o.balanceAfter};wallet();showNote('');
      openSheet(`<div class="success-sheet"><div class="receipt-seal" aria-hidden="true">✓</div><span class="eyebrow">${esc(o.shopName)}</span><h2 id="sheet-title">Сделка состоялась.</h2><p>Предметы куплены, крышки списаны.<br>Предметы появились в инвентаре.</p><div class="confirm-total"><span>Списано</span><span class="price">${caps(o.total)} <small>кр.</small></span></div><p>Остаток: <strong>${caps(o.balanceAfter)} крышек</strong></p><p class="receipt-number">Заказ ${esc(o.id.slice(0,8))} · ${esc(o.when)}</p><button class="primary wide" data-receipts>Открыть инвентарь</button><button class="text-button wide" data-close>Продолжить покупки</button></div>`);try{tg?.HapticFeedback?.notificationOccurred('success');}catch{}
    }catch(e){const definite=['invalid_cart','catalog_changed','not_enough_caps','character_not_found','not_bound','balance_formula','invalid_balance'];if(definite.includes(e.code)){pending=null;try{localStorage.removeItem(pendingKey);}catch{}}toast(e.message);if(e.code==='catalog_changed')showNote('Каталог изменился. Закройте и снова откройте магазин, чтобы увидеть новые цены.');}
    finally{busy=false;render();}
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('button,a');if(!b)return;
    if(b.tagName==='A'&&b.getAttribute('href')?.startsWith('#'))rememberPosition();
    if(b.hasAttribute('data-character-toggle'))toggleCharacters($('#character-options').hidden);
    else if(b.dataset.character)selectCharacter(b.dataset.character);
    else if(b.hasAttribute('data-close'))dialog.close();
    else if(b.dataset.detail)detail(b.dataset.detail);
    else if(b.dataset.change)change(b.dataset.change,Number(b.dataset.delta),b.dataset.context);
    else if(b.dataset.addDetail){change(b.dataset.addDetail,1);dialog.close();toast('Предмет добавлен в корзину.');}
    else if(b.dataset.category){category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(c=>c.setAttribute('aria-pressed',c.dataset.category===category));renderProducts();}
    else if(b.hasAttribute('data-profile'))profile();
    else if(b.hasAttribute('data-bind'))bind();
    else if(b.dataset.checkout)checkout(b.dataset.checkout);
    else if(b.dataset.confirm)confirm(b.dataset.confirm);
    else if(b.hasAttribute('data-retry'))submitPending();
    else if(b.hasAttribute('data-receipts')){dialog.close();go('inventory');}
    else if(b.hasAttribute('data-refresh-history'))renderInventory();
    else if(b.hasAttribute('data-reload'))location.reload();
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  $('#wallet').addEventListener('click',profile);
  addEventListener('hashchange',render);
  try{tg?.BackButton.onClick(()=>{if(dialog.open)dialog.close();else go('');});}catch{}
  async function init(){
    if(authenticated&&!pending)openSheet(`<span class="eyebrow">Добро пожаловать на Блошиный рынок!</span><h2 id="sheet-title">${rememberedName?esc(rememberedName):'Назови свое имя и торговцы сразу же предложат товар!'}</h2><p class="detail-description">${rememberedName?'Обновляем счет…':'Подготавливаем список персонажей…'}</p><button class="primary wide" data-close>К торговым рядам →</button>`,true);
    // Start identity lookup immediately, independently of catalog/image loading.
    // Remembered names are presentation only: state and purchases use verified API data.
    const identity=authenticated&&!pending?loadState().then(value=>({value}),error=>({error})):null;
    try{
      const response=await fetch('/catalog.json',{cache:'no-cache'});if(!response.ok)throw new Error();catalog=await response.json();
      for(const s of catalog.shops)for(const i of s.items)byId[i.id]={...i,shopId:s.id};
      for(const sid of Object.keys(carts)){
        if(!shopOf(sid)||!carts[sid]||typeof carts[sid]!=='object'||Array.isArray(carts[sid])){delete carts[sid];continue;}
        for(const [id,q] of Object.entries(carts[sid]))if(!byId[id]||byId[id].shopId!==sid||!Number.isInteger(q)||q<1||q>99)delete carts[sid][id];
      }
      saveCart();render();wallet();
      if(authenticated&&pending){submitPending();return;}
      if(authenticated){
        const result=await identity;
        const entryStillOpen=dialog.open&&dialog.classList.contains('entry-screen');
        if(result.error){
          showNote(result.error.message);
          if(!pending&&entryStillOpen)openSheet(`<h2 id="sheet-title">Проверим счет еще раз?</h2><p class="detail-description">${esc(result.error.message)}</p><button class="primary wide" data-profile>Повторить проверку</button><button class="text-button wide" data-close>Посмотреть каталог</button>`);
        }else{
          // Do not interrupt shopping or discard an inventory draft when lookup finishes.
          if(routeValue().startsWith('carts'))renderCarts();
          if(!pending&&entryStillOpen)showEntry();
        }
        if(pending)submitPending();
      }
    }catch{dialog.close();main.innerHTML='<section class="empty"><h2>Ряды еще закрыты</h2><p>Каталог не загрузился. Обновите приложение через несколько секунд.</p><button class="primary" data-reload>Обновить</button></section>';}
  }
  init();
})();


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
  let catalog, byId = {}, carts = {}, state = null, pending = null, busy = false;
  let category = 'Все', query = '', sort = 'default', activeShop = '', toastTimer;
  const esc = value => String(value ?? '').replace(/\u0451/g,'е').replace(/\u0401/g,'Е').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const caps = value => new Intl.NumberFormat('ru-RU').format(value);
  const counted = (n,one,few,many) => `${n} ${n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many}`;
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 8 2 12h14l2-12H3Zm4 0 5-6 5 6M8 12v4m4-4v4m4-4v4"/></svg>';
  try { carts = JSON.parse(localStorage.getItem(cartKey) || '{}'); pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { carts = {}; }
  if (!carts || typeof carts !== 'object' || Array.isArray(carts)) carts = {};
  try { tg?.ready(); tg?.expand(); tg?.setHeaderColor('#eee5d2'); tg?.setBackgroundColor('#eee5d2'); tg?.disableVerticalSwipes?.(); } catch {}

  function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200); }
  function saveCart() { try { localStorage.setItem(cartKey, JSON.stringify(carts)); } catch {} updateCount(); }
  function updateCount() { const n = Object.values(carts).reduce((sum,c) => sum + Object.values(c || {}).reduce((s,q) => s + q,0),0); $('#cart-count').textContent = n; $('#cart-count').hidden = !n; }
  const shopOf = id => catalog.shops.find(s => s.id === id);
  function linesFor(id) { return Object.entries(carts[id] || {}).filter(([key,q]) => byId[key]?.shopId === id && Number.isInteger(q) && q > 0 && q <= 99).map(([key,q]) => ({...byId[key],quantity:q,total:q*byId[key].price})); }
  const totalFor = id => linesFor(id).reduce((s,i) => s+i.total,0);
  const countFor = id => linesFor(id).reduce((s,i) => s+i.quantity,0);
  const quantityControl = (id,quantity,context='') => `<div class="quantity" aria-label="Количество"><button data-change="${id}" data-delta="-1" data-context="${context}" aria-label="Убрать одну штуку">−</button><span>${quantity}</span><button data-change="${id}" data-delta="1" data-context="${context}" aria-label="Добавить одну штуку" ${quantity>=99?'disabled':''}>+</button></div>`;
  function picture(s) { return s.banner ? `<div class="shop-art"><img src="${s.banner}" data-poster="${s.poster || ''}" alt="${esc(s.name)}" loading="lazy"></div>` : `<div class="shop-art nuka-art" aria-label="Автомат Нюка-Колы">${[s.items[0],s.items[1],s.items[7]].map(i=>`<img src="${i.image}" alt="" loading="lazy">`).join('')}</div>`; }
  function applyMotion() { if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll('img[data-poster]').forEach(img => { if(img.dataset.poster) img.src = img.dataset.poster; }); }
  function wallet() { $('#player-label').textContent = state?.character?.name || (authenticated ? 'Ваш персонаж' : 'Личный счет'); $('#balance-label').innerHTML = state?.character ? `${caps(state.balance)} <span class="unit">крышек</span>` : authenticated ? 'Выбрать ↗' : 'Войти ↗'; }
  function showNote(message='') { $('#service-note').textContent=message; $('#service-note').hidden=!message; }
  async function api(path,body={}) {
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
    const result=await api('state'); state=result; wallet(); showNote(''); return result;
  }
  function routeValue() { const h=location.hash.slice(1); return h.startsWith('tgWebApp')?'':h; }
  function go(hash) { if(routeValue()===hash) render(); else location.hash=hash; }
  function render() {
    if(!catalog) return;
    const route=routeValue();
    document.querySelectorAll('[data-nav]').forEach(a=>{ const current=a.dataset.nav==='market' ? !route || route.startsWith('shop/') : route.startsWith(a.dataset.nav) || a.dataset.nav==='history' && route==='history'; a.toggleAttribute('aria-current',current); if(current)a.setAttribute('aria-current','page'); });
    try { if(route) tg?.BackButton.show(); else tg?.BackButton.hide(); } catch {}
    if(route.startsWith('shop/') && shopOf(route.split('/')[1])) renderStore(route.split('/')[1]);
    else if(route.startsWith('carts')) renderCarts();
    else if(route==='history') renderHistory();
    else renderHome();
    updateCount(); applyMotion();
  }
  function renderHome() {
    activeShop='';
    main.innerHTML=`<section class="intro"><div><span class="eyebrow">Торговые ряды Блошиного рынка</span><h1>Впервые у нас,<br>Выживший?</h1><p>Скорее подходи к торговым рядам!</p><span class="market-stamp">6 магазинов · 136 товаров</span></div><figure class="market-art"><img src="/assets/banners/market.gif" data-poster="/assets/banners/market.webp" alt="Блошиный рынок Dawn of the Dead"><figcaption><span>FLEA MARKET</span><span>НАЙДЕТСЯ ВСЕ!</span></figcaption></figure></section><div class="section-head"><h2>Торговые ряды</h2><small>ВЫБЕРИТЕ МАГАЗИН</small></div><section class="shops-grid" aria-label="Магазины">${catalog.shops.map((s,n)=>`<a class="shop-card" href="#shop/${s.id}" style="--accent:${s.accent}">${picture(s)}<div class="shop-info"><span class="eyebrow">0${n+1} / ${esc(s.tagline)}</span><h3>${esc(s.name)}</h3><p>${esc(s.shortDescription)}</p><div class="shop-foot"><span>${counted(s.items.length,'товар','товара','товаров')}${countFor(s.id)?` · в корзине ${countFor(s.id)}`:''}</span><span class="arrow" aria-hidden="true">↗</span></div></div></a>`).join('')}</section>${!authenticated?'<p class="guest-note">Каталог открыт для просмотра. Для покупок и своего баланса откройте магазин в <a href="https://t.me/vfleamarketbot">@vfleamarketbot ↗</a>.</p>':''}`;
  }
  function renderStore(id) {
    if(activeShop!==id){category='Все';query='';sort='default';activeShop=id;}
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
  function renderStoreCart(){if(!$('#store-cart-holder'))return;const n=countFor(activeShop);$('#store-cart-holder').innerHTML=n?`<a href="#carts/${activeShop}" class="store-cart-bar"><span>В корзине: ${n}<small>${esc(shopOf(activeShop).name)}</small></span><span>${caps(totalFor(activeShop))} кр. <span aria-hidden="true">→</span></span></a>`:'';}
  function pendingHtml(){return pending?'<section class="pending-box"><h2>Проверяем покупку</h2><p>Касса еще не подтвердила результат. Сохранен номер заказа — повторная проверка не спишет крышки еще раз.</p><button class="primary" data-retry '+(busy?'disabled':'')+'>'+(busy?'Получаем ответ…':'Проверить результат')+'</button></section>':'';}
  function renderCarts() {
    activeShop='';const only=routeValue().split('/')[1];let groups=catalog.shops.filter(s=>linesFor(s.id).length);if(only&&groups.some(s=>s.id===only))groups=groups.filter(s=>s.id===only);
    main.innerHTML=`<h1 class="page-title">Ваши корзины</h1><p class="page-lead">Каждый магазин оформляет свою покупку отдельно.</p>${pendingHtml()}${groups.length?groups.map(s=>{const lines=linesFor(s.id),total=totalFor(s.id);return `<section class="cart-group"><div class="cart-group-head"><h2>${esc(s.name)}</h2><a href="#shop/${s.id}">В магазин ↗</a></div>${lines.map(i=>`<div class="cart-row"><img src="${i.image}" alt=""><div><h3>${esc(i.name)}</h3><p>${caps(i.price)} кр. за шт. · ${i.slots} сл.</p></div><div><div class="row-total">${caps(i.total)} <small>кр.</small></div>${quantityControl(i.id,i.quantity,'cart')}</div></div>`).join('')}<div class="cart-foot"><div><small>${counted(countFor(s.id),'предмет','предмета','предметов')} · ${counted(lines.reduce((n,i)=>n+i.slots*i.quantity,0),'слот','слота','слотов')}</small><span class="price">${caps(total)} <small>крышек</small></span></div><button class="primary" data-checkout="${s.id}" ${busy||pending?'disabled':''}>${authenticated ? state?.character ? 'К покупке →' : 'Выбрать персонажа' : 'Открыть в Telegram ↗'}</button>${state?.character?`<div class="balance-check ${state.balance<total?'insufficient':''}"><span>На счете: ${caps(state.balance)} кр.</span><span>${state.balance<total?`Не хватает ${caps(total-state.balance)} кр.`:`После покупки: ${caps(state.balance-total)} кр.`}</span></div>`:''}</div></section>`;}).join(''):`<section class="empty">${icon}<h2>Пока пусто</h2><p>Загляните в торговые ряды и добавьте понравившиеся предметы.</p><a class="primary" href="#">К магазинам →</a></section>`}`;
    if(only)main.insertAdjacentHTML('beforeend','<a class="text-button" href="#carts">Все корзины</a>');
  }
  async function renderHistory() {
    activeShop='';main.innerHTML=`<h1 class="page-title">Ваши покупки</h1><p class="page-lead">Квитанции из всех торговых рядов.</p>${pendingHtml()}<div id="history-list"><div class="loading-card">Смотрим записи…</div></div>`;
    if(!authenticated){$('#history-list').innerHTML='<section class="empty"><h2>Ваши квитанции — в Telegram</h2><p>Откройте магазин через бота, чтобы увидеть историю покупок.</p><a class="primary" href="https://t.me/vfleamarketbot">Открыть бота ↗</a></section>';return;}
    try{const r=await api('history');if(!$('#history-list'))return;$('#history-list').innerHTML=r.orders.length?r.orders.map(o=>`<article class="history-card"><div class="history-head"><div><span class="eyebrow">${esc(o.when)}</span><h3>${esc(o.shopName)}</h3><span class="status-paid">ОПЛАЧЕНО · ${esc(o.character.name)}</span></div><span class="price">−${caps(o.total)} <small>кр.</small></span></div><ul class="history-list">${o.lines.map(i=>`<li><span>${esc(i.name)} × ${i.quantity}</span><span>${caps(i.total)} кр.</span></li>`).join('')}</ul><div class="history-bottom"><span>Заказ ${esc(o.id.slice(0,8))}</span><span>Остаток ${caps(o.balanceAfter)} кр.</span></div></article>`).join(''):'<section class="empty"><h2>Первая сделка еще впереди</h2><p>После покупки здесь останется квитанция с товарами, суммой и остатком крышек.</p><a class="primary" href="#">На рынок →</a></section>';}catch(e){if($('#history-list'))$('#history-list').innerHTML=`<section class="empty"><p>${esc(e.message)}</p><button class="secondary" data-refresh-history>Обновить</button></section>`;}
  }
  function openSheet(html) { sheet.innerHTML=`<div class="sheet-body"><button class="close-sheet" data-close aria-label="Закрыть">×</button>${html}</div>`;if(!dialog.open)dialog.showModal();applyMotion(); }
  function detail(id){const i=byId[id];if(!i)return;openSheet(`<div class="detail-image"><img src="${i.image}" alt="${esc(i.name)}"></div><span class="eyebrow">${esc(i.category)} / ${esc(shopOf(i.shopId).name)}</span><h2 id="sheet-title">${esc(i.name)}</h2><p class="detail-description">${esc(i.description)}</p>${i.effects.map(l=>{const n=l.indexOf(':');return `<p class="effect-line">${n>=0?`<strong>${esc(l.slice(0,n+1))}</strong>${esc(l.slice(n+1))}`:esc(l)}</p>`;}).join('')}<div class="detail-footer"><div><span class="price">${caps(i.price)} <small>крышек</small></span><small>Слотов: ${i.slots}</small></div>${carts[i.shopId]?.[id]?quantityControl(id,carts[i.shopId][id],'detail'):'<span class="eyebrow">В наличии</span>'}</div><button class="primary wide" data-add-detail="${id}">Добавить в корзину</button>`);}
  function change(id,delta,context=''){const i=byId[id];if(!i || busy || pending){if(pending)toast('Сначала проверьте результат предыдущей покупки.');return;}const c=carts[i.shopId]||(carts[i.shopId]={});const value=Math.max(0,Math.min(99,(c[id]||0)+delta));if(value)c[id]=value;else delete c[id];if(!Object.keys(c).length)delete carts[i.shopId];saveCart();if(routeValue().startsWith('shop/')){renderProducts();renderStoreCart();}else render();if(context==='detail')detail(id);try{tg?.HapticFeedback?.selectionChanged();}catch{}}
  async function profile(){
    if(!authenticated){openSheet('<span class="eyebrow">Личный счет</span><h2 id="sheet-title">Загляните через Telegram</h2><p class="detail-description">Бот узнает ваш аккаунт и покажет баланс персонажа.</p><a class="primary wide" href="https://t.me/vfleamarketbot">Открыть @vfleamarketbot ↗</a>');return;}
    openSheet('<h2 id="sheet-title">Личный счет</h2><p>Проверяем баланс…</p>');
    try{await loadState();if(state.character){openSheet(`<span class="eyebrow">Ваш персонаж</span><h2 id="sheet-title">${esc(state.character.name)}</h2><div class="profile-detail"><span>Крышек на счете</span><strong>${caps(state.balance)}</strong></div><p class="detail-description">Баланс обновляется из игровой таблицы. Если меняете персонажа, попросите мастера изменить привязку аккаунта.</p><button class="primary wide" data-close>Вернуться на рынок</button>`);}else showBind();}catch(e){openSheet(`<h2 id="sheet-title">Касса недоступна</h2><p class="detail-description">${esc(e.message)}</p><button class="secondary wide" data-profile>Попробовать снова</button>`);}
  }
  function showBind(){
    const characters=state.availableCharacters||[];
    if(!characters.length){openSheet(`<span class="eyebrow">Знакомство с торговцем</span><h2 id="sheet-title">Проверим имя в списке?</h2><p class="detail-description">${esc(state.bindingNotice||'Попросите мастера указать ваш Telegram username рядом с персонажем на листе «Игроки».')}</p><button class="primary wide" data-profile>Проверить снова</button><button class="text-button wide" data-close>Посмотреть каталог</button>`);return;}
    openSheet(`<span class="eyebrow">Знакомство с торговцем</span><h2 id="sheet-title">Представься, Выживший.</h2><p class="detail-description">Выберите своего персонажа. Список проверен по вашему аккаунту Telegram.</p><span id="character-label">Персонаж</span><div class="character-picker"><button type="button" class="character-select" id="character-trigger" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-controls="character-options" aria-labelledby="character-label character-selected" data-character-toggle><span id="character-selected">Выберите имя</span><span aria-hidden="true">⌄</span></button><input type="hidden" id="character"><div class="character-options" id="character-options" role="listbox" aria-label="Персонаж" hidden>${characters.map(c=>`<button type="button" role="option" aria-selected="false" data-character="${c.id}">${esc(c.name)}</button>`).join('')}</div></div><label class="check-label"><input id="own-character" type="checkbox"><span>Это мой персонаж. Покупки будут списываться с его баланса.</span></label><div id="bind-error" class="form-error" role="alert"></div><button class="primary wide" id="bind-button" data-bind>Сохранить персонажа</button>`);
  }
  function showEntry(){if(!state.character){showBind();return;}openSheet(`<span class="eyebrow">Ваш персонаж</span><h2 id="sheet-title">${esc(state.character.name)}</h2><p class="detail-description">На счете: <strong>${caps(state.balance)} крышек</strong>. Покупки будут записаны на этого персонажа.</p><button class="primary wide" data-close>Войти на рынок →</button>`);}
  function toggleCharacters(open){const list=$('#character-options');if(!list)return;list.hidden=!open;$('#character-trigger').setAttribute('aria-expanded',String(open));}
  function selectCharacter(id){const option=[...document.querySelectorAll('[data-character]')].find(b=>b.dataset.character===id);if(!option)return;$('#character').value=id;$('#character-selected').textContent=option.textContent;document.querySelectorAll('[data-character]').forEach(b=>b.setAttribute('aria-selected',String(b===option)));toggleCharacters(false);$('#character-trigger').focus();}
  dialog.addEventListener('keydown',e=>{const list=$('#character-options'),trigger=$('#character-trigger');if(!list||!trigger)return;const options=[...list.querySelectorAll('[data-character]')];if(e.key==='Escape'&&!list.hidden){e.preventDefault();e.stopPropagation();toggleCharacters(false);trigger.focus();return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||!(e.target===trigger||list.contains(e.target)))return;e.preventDefault();toggleCharacters(true);const index=options.indexOf(document.activeElement);const target=e.key==='Home'?0:e.key==='End'?options.length-1:index<0?(e.key==='ArrowUp'?options.length-1:0):(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[target]?.focus();});
  async function bind(){const id=$('#character')?.value;if(!id || !$('#own-character')?.checked){$('#bind-error').textContent='Выберите имя и подтвердите, что это ваш персонаж.';return;}const b=$('#bind-button');b.disabled=true;b.textContent='Запоминаем…';try{state=await api('bind',{characterId:id});wallet();dialog.close();render();toast('Счет персонажа подключен.');}catch(e){$('#bind-error').textContent=e.message;b.disabled=false;b.textContent='Сохранить персонажа';}}
  async function checkout(id){
    if(!authenticated){location.href='https://t.me/vfleamarketbot';return;}if(busy||pending)return;
    busy=true;renderCarts();
    try{await loadState();if(!state.character){showBind();return;}const lines=linesFor(id),total=totalFor(id);if(!lines.length)return;if(state.balance<total){toast(`Не хватает ${caps(total-state.balance)} крышек.`);return;}
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
      const old=carts[pending.shopId]||{};for(const i of pending.items){old[i.id]=Math.max(0,(old[i.id]||0)-i.quantity);if(!old[i.id])delete old[i.id];}if(!Object.keys(old).length)delete carts[pending.shopId];
      pending=null;try{localStorage.removeItem(pendingKey);}catch{}saveCart();state={...(state||{}),character:o.character,balance:o.balanceAfter};wallet();showNote('');
      openSheet(`<div class="success-sheet"><div class="receipt-seal" aria-hidden="true">✓</div><span class="eyebrow">${esc(o.shopName)}</span><h2 id="sheet-title">Сделка состоялась.</h2><p>Предметы куплены, крышки списаны.<br>Квитанция сохранена в ваших покупках.</p><div class="confirm-total"><span>Списано</span><span class="price">${caps(o.total)} <small>кр.</small></span></div><p>Остаток: <strong>${caps(o.balanceAfter)} крышек</strong></p><p class="receipt-number">Заказ ${esc(o.id.slice(0,8))} · ${esc(o.when)}</p><button class="primary wide" data-receipts>Посмотреть квитанцию</button><button class="text-button wide" data-close>Продолжить покупки</button></div>`);try{tg?.HapticFeedback?.notificationOccurred('success');}catch{}
    }catch(e){const definite=['invalid_cart','catalog_changed','not_enough_caps','character_not_found','not_bound','balance_formula','invalid_balance'];if(definite.includes(e.code)){pending=null;try{localStorage.removeItem(pendingKey);}catch{}}toast(e.message);if(e.code==='catalog_changed')showNote('Каталог изменился. Закройте и снова откройте магазин, чтобы увидеть новые цены.');}
    finally{busy=false;render();}
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('button,a');if(!b)return;
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
    else if(b.hasAttribute('data-receipts')){dialog.close();go('history');}
    else if(b.hasAttribute('data-refresh-history'))renderHistory();
    else if(b.hasAttribute('data-reload'))location.reload();
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  $('#wallet').addEventListener('click',profile);
  addEventListener('hashchange',()=>{render();window.scrollTo({top:0});});
  try{tg?.BackButton.onClick(()=>{if(dialog.open)dialog.close();else go('');});}catch{}
  async function init(){if(authenticated&&!pending)openSheet('<span class="eyebrow">Знакомство с торговцем</span><h2 id="sheet-title">Представься, Выживший.</h2><p class="detail-description">Сверяем персонажа с вашим аккаунтом Telegram…</p>');try{const response=await fetch('/catalog.json',{cache:'no-cache'});if(!response.ok)throw new Error();catalog=await response.json();for(const s of catalog.shops)for(const i of s.items)byId[i.id]={...i,shopId:s.id};for(const sid of Object.keys(carts)){if(!shopOf(sid)||!carts[sid]||typeof carts[sid]!=='object'||Array.isArray(carts[sid])){delete carts[sid];continue;}for(const [id,q] of Object.entries(carts[sid]))if(!byId[id]||byId[id].shopId!==sid||!Number.isInteger(q)||q<1||q>99)delete carts[sid][id];}saveCart();render();wallet();if(authenticated){try{await loadState();render();if(!pending)showEntry();}catch(e){showNote(e.message);if(!pending)openSheet(`<h2 id="sheet-title">Проверим счет еще раз?</h2><p class="detail-description">${esc(e.message)}</p><button class="primary wide" data-profile>Повторить проверку</button><button class="text-button wide" data-close>Посмотреть каталог</button>`);}if(pending)submitPending();}}catch{dialog.close();main.innerHTML='<section class="empty"><h2>Ряды еще закрыты</h2><p>Каталог не загрузился. Обновите приложение через несколько секунд.</p><button class="primary" data-reload>Обновить</button></section>';}}
  init();
})();

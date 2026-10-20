"""Compose a UI proposal from supplied images and an actual Fallout screenshot.
No AI image creation or image synthesis is involved.
"""
import base64
import html
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ASSETS = HERE / 'assets'
catalog = json.loads((ROOT / 'public/catalog.json').read_text())
shops = catalog['shops']
INK = '#302b22'
PAPER = '#e8ddc3'
AMBER = '#d0ac65'
CREAM = '#ece0c5'
MUTED = '#b8b1a0'

def font(size, bold=False, serif=False):
    name = 'DejaVuSerif' if serif else 'DejaVuSans'
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/' + name + ('-Bold' if bold else '') + '.ttf', size)

def paste_fit(canvas, path, box, contain=False):
    src = Image.open(path).convert('RGB')
    size = (box[2]-box[0], box[3]-box[1])
    src = ImageOps.contain(src, size) if contain else ImageOps.fit(src, size)
    canvas.paste(src, (box[0]+(size[0]-src.width)//2, box[1]+(size[1]-src.height)//2))

def backdrop(size, shade=0.38):
    im = ImageOps.fit(Image.open(ASSETS/'rivet-city-market.jpg').convert('RGB'), size)
    return Image.blend(im, Image.new('RGB', size, '#151a17'), shade)

def banner(s):
    return ASSETS/'nuka.webp' if s['id']=='nuka' else ROOT/'public/assets/banners'/f"{s['id']}.webp"

def text(d, xy, value, size=16, fill=CREAM, bold=False, serif=False):
    d.text(xy, value, font=font(size,bold,serif), fill=fill)

def wrap(d, value, max_width, size, bold=False, serif=False):
    lines=[]
    for para in value.split('\n'):
        line=''
        for word in para.split():
            test=(line+' '+word).strip()
            if d.textlength(test,font=font(size,bold,serif))>max_width and line:
                lines.append(line);line=word
            else: line=test
        lines.append(line)
    return lines

def paragraph(d,xy,value,width,size=15,fill=MUTED,leading=23,bold=False,serif=False):
    y=xy[1]
    for line in wrap(d,value,width,size,bold,serif):
        text(d,(xy[0],y),line,size,fill,bold,serif);y+=leading
    return y

def desktop():
    im=backdrop((1100,1100),.48);d=ImageDraw.Draw(im)
    d.rectangle((0,0,1100,76),fill='#1d2420');d.line((35,75,1065,75),fill='#697061')
    text(d,(36,19),'БЛОШИНЫЙ РЫНОК',23,bold=True)
    text(d,(37,49),'D A W N   O F   T H E   D E A D',10,AMBER)
    text(d,(858,23),'ВАШ ПЕРСОНАЖ',10,MUTED)
    text(d,(858,43),'Выбрать имя  ↗',16)
    text(d,(36,112),'ТОРГОВЫЕ РЯДЫ БЛОШИНОГО РЫНКА',11,AMBER,bold=True)
    paragraph(d,(33,145),'Впервые у нас,\nВыживший?',610,43,CREAM,55,False,True)
    text(d,(36,274),'Скорее подходи к торговым рядам!',19)
    text(d,(36,313),'6 МАГАЗИНОВ     /     136 ТОВАРОВ',11,AMBER,bold=True)
    d.rectangle((791,115,1064,326),fill='#202923',outline='#73745e',width=2)
    paste_fit(im,ROOT/'public/assets/banners/market.webp',(801,125,1054,286))
    text(d,(806,300),'НАЙДЕТСЯ ВСЕ!',16,AMBER,bold=True)
    d.line((36,367,1064,367),fill='#8b876b')
    text(d,(36,387),'Торговые ряды',30,CREAM,serif=True)
    text(d,(874,404),'ВЫБЕРИТЕ ЛАВКУ',11,AMBER)
    for i,s in enumerate(shops):
        x=36+(i%3)*346;y=454+(i//3)*268;w=336
        d.rectangle((x+3,y+4,x+w+3,y+254),fill='#111714')
        d.rectangle((x,y,x+w,y+250),fill=PAPER,outline='#867c60',width=1)
        d.rectangle((x+6,y+6,x+w-6,y+153),fill='#1e211b')
        paste_fit(im,banner(s),(x+6,y+6,x+w-6,y+153),contain=True)
        text(d,(x+15,y+166),f'0{i+1} / '+s['tagline'].upper().replace('ё','е'),9,'#756849',bold=True)
        title_size=20 if len(s['name'])<23 else 17
        paragraph(d,(x+14,y+184),s['name'].replace('ё','е'),w-28,title_size,INK,23,False,True)
        text(d,(x+15,y+226),str(len(s['items']))+' товаров',10,'#786b54')
        text(d,(x+w-36,y+218),'↗',22,'#92553c')
    d.rectangle((0,1012,1100,1100),fill='#1c241f')
    text(d,(36,1027),'STARFIELD • 2238',10,AMBER)
    text(d,(649,1027),'Не дай хромому Джеку тебя надуть!',12,MUTED)
    text(d,(328,1061),'Рынок       /       Корзины       /       Покупки',14,CREAM)
    return im

def mobile():
    im=backdrop((430,1000),.56);d=ImageDraw.Draw(im)
    d.rectangle((0,0,430,84),fill='#202821')
    text(d,(24,23),'БЛОШИНЫЙ РЫНОК',19,bold=True)
    text(d,(24,53),'STARFIELD • 2238',11,AMBER)
    text(d,(24,119),'ЗНАКОМСТВО С ТОРГОВЦЕМ',10,AMBER,bold=True)
    paragraph(d,(23,151),'Представься,\nВыживший.',380,33,CREAM,44,False,True)
    paragraph(d,(25,265),'На чье имя записывать покупки? Выбери своего персонажа.',365,15,CREAM,24)
    d.rectangle((24,350,406,404),fill='#e8ddc3',outline='#bfa36b',width=2)
    text(d,(40,367),'Выберите имя',17,INK);text(d,(371,365),'⌄',20,INK)
    d.rectangle((24,411,406,688),fill='#e8ddc3',outline='#a39068',width=1)
    for j,name in enumerate(['Авантюрин','Альбедо','Бай Чжу','Блэйд','Далия','Дань Хэн']):
        y=419+j*44
        if j==0:d.rectangle((30,y,400,y+42),fill='#d3bd8f')
        text(d,(42,y+10),name,16,INK)
        if j==0:text(d,(369,y+9),'→',19,'#895536')
    text(d,(25,716),'Покупки спишутся с баланса персонажа.',12,MUTED)
    d.rectangle((24,767,406,825),fill='#b68a4d',outline='#d2b176')
    text(d,(106,785),'ВОЙТИ НА РЫНОК  →',14,'#191e18',bold=True)
    paragraph(d,(25,859),'Найдется все!\nНе дай хромому Джеку тебя надуть!',377,13,CREAM,24)
    return im

def data_url(path):
    mime='image/gif' if Path(path).suffix=='.gif' else 'image/webp'
    return 'data:'+mime+';base64,'+base64.b64encode(Path(path).read_bytes()).decode()

def make_html():
    # Compress a copy for the preview, leaving the original screenshot untouched.
    Image.open(ASSETS/'rivet-city-market.jpg').save(ASSETS/'rivet-city-market.webp',quality=82)
    cards=''
    for i,s in enumerate(shops):
        source=ASSETS/'nuka.gif' if s['id']=='nuka' else banner(s)
        name=s['name'].replace('ё','е')
        cards+=f'<article><div class="art"><img src="{data_url(source)}" alt="{html.escape(name)}"></div><div class="info"><small>0{i+1} / {html.escape(s["tagline"].upper().replace("ё","е"))}</small><h3>{html.escape(name)}</h3><p>{html.escape(s["shortDescription"].replace("ё","е"))}</p><footer>{len(s["items"])} товаров <span>↗</span></footer></div></article>'
    bg=data_url(ASSETS/'rivet-city-market.webp');market=data_url(ROOT/'public/assets/banners/market.webp')
    names=['Авантюрин','Альбедо','Бай Чжу','Блэйд','Далия','Дань Хэн','Лоча','Мавуика','Митя','Цифер','Черный Лебедь','Эшвейл']
    options=''.join(f'<button role="option" type="button" aria-selected="false">{n}</button>' for n in names)
    doc='''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Блошиный рынок — предварительный макет</title><style>
*{box-sizing:border-box}body{margin:0;color:#ece0c5;background:#171f1a;font:15px/1.6 system-ui,sans-serif}body:before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(#151b16a0,#151b16df),url(__BACKGROUND__) center/cover no-repeat}button{font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #d2b176;outline-offset:3px}h1,h2,h3{font-family:Georgia,serif;font-weight:400;line-height:1.12}button,article{border-radius:0}.notice{background:#b68a4d;color:#172018;text-align:center;padding:8px 14px;font-size:12px}.shell{max-width:1120px;margin:auto;padding:0 30px 40px}header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:23px 0;border-bottom:1px solid #7b8064}.brand{font-size:21px;font-weight:750;letter-spacing:.6px}.brand small{display:block;font-size:9px;letter-spacing:3px;color:#cfac68}.wallet{border:0;background:none;color:#ece0c5;text-align:right;font-size:13px}.wallet small{display:block;color:#bdb59f;font-size:10px;letter-spacing:1px}.hero{display:grid;grid-template-columns:1.5fr 1fr;gap:50px;align-items:center;padding:44px 0 34px}.eyebrow{color:#d0ac65;font-size:10px;letter-spacing:1.4px;font-weight:650}.hero h1{font-size:clamp(36px,5vw,56px);margin:19px 0}.hero p{font-size:19px;margin-bottom:24px}.hero .count{font-size:11px;letter-spacing:2px;color:#d0ac65}.hero figure{margin:0;border:1px solid #74775e;padding:8px;background:#202923da;transform:rotate(-1deg)}.hero figure img{display:block;width:100%;aspect-ratio:1.65;object-fit:cover}.hero figcaption{padding:7px 5px 2px;display:flex;justify-content:space-between;font-size:10px;color:#d0ac65;letter-spacing:1px}.section-head{border-top:1px solid #86866c;padding:23px 0;display:flex;align-items:center;justify-content:space-between}.section-head h2{font-size:31px;margin:0}.section-head small{font-size:10px;color:#d0ac65;letter-spacing:1px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}article{color:#302b22;background:#e8ddc3;border:1px solid #8d7f60;box-shadow:4px 5px 0 #10171396;padding:6px 6px 0;display:flex;flex-direction:column;min-width:0}.art{background:#20211b;aspect-ratio:2;overflow:hidden;display:grid;place-items:center}.art img{display:block;width:100%;height:100%;object-fit:contain}.info{padding:16px 12px 0;display:flex;flex-direction:column;flex:1}.info small{font-size:8px;letter-spacing:.8px;color:#7b6747;font-weight:600}.info h3{font-size:25px;margin:9px 0 14px}.info p{font-size:11px;color:#776a53;margin:0 0 17px;flex:1}.info footer{border-top:1px solid #c4b592;display:flex;justify-content:space-between;align-items:center;font-size:10px;padding:10px 0}.info footer span{font-size:25px;color:#8b5339}.colophon{display:flex;justify-content:space-between;gap:15px;margin-top:34px;border-top:1px solid #72765e;padding-top:18px;color:#c6bca3;font-size:11px}nav{display:flex;justify-content:center;gap:30px;margin-top:25px}nav button{color:#ece0c5;background:#273026;border:1px solid #66715c;padding:10px 18px}dialog{padding:0;border:1px solid #8a8a69;background:#222c24;color:#ece0c5;width:min(92vw,460px);max-height:90vh;overflow:auto;box-shadow:0 25px 80px #000a}dialog::backdrop{background:#101612bd;backdrop-filter:blur(3px)}.gate{padding:30px}.gate h2{font-size:36px;margin:18px 0}.gate p{color:#c5bca5;font-size:14px;margin:0 0 24px}.combo{position:relative}.select{border:1px solid #bfa36b;width:100%;background:#e8ddc3;color:#302b22;display:flex;justify-content:space-between;padding:14px 16px;text-align:left}.options{background:#e8ddc3;border:1px solid #ad9667;margin-top:6px;padding:5px;max-height:220px;overflow:auto;scrollbar-color:#9d875d #e8ddc3}.options[hidden]{display:none}.options button{border:0;background:transparent;color:#302b22;display:block;text-align:left;width:100%;padding:10px 12px}.options button:hover,.options button:focus,.options button[aria-selected=true]{background:#d3bd8f;outline-offset:-2px}.enter{margin-top:20px;padding:14px;width:100%;color:#182017;background:#b68a4d;border:1px solid #d2b176;font-size:13px;font-weight:650;letter-spacing:1px}.enter:disabled{opacity:.4;cursor:default}.gate .hint{font-size:11px;margin:19px 0 0}.source{font-size:10px;margin-top:28px;color:#a79f8b}.source a{color:inherit}.selected{font-size:12px;color:#d0ac65;margin-top:12px;min-height:20px}
@media(max-width:650px){.shell{padding:0 18px 24px}.notice{font-size:10px}.brand{font-size:15px}.brand small{font-size:7px;letter-spacing:1.5px}header{padding:18px 0}.hero{display:block;padding:30px 0 23px}.hero h1{font-size:39px}.hero p{font-size:16px}.hero figure{margin-top:28px}.hero figure img{aspect-ratio:2}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.info{padding:13px 7px 0}.info h3{font-size:21px}.info small{font-size:7px;letter-spacing:.1px}.info p{font-size:10px}.section-head h2{font-size:26px}.section-head small{font-size:8px}.colophon{font-size:9px;display:block}.colophon span{display:block;margin:6px 0}nav{gap:8px}nav button{padding:9px 13px;font-size:12px}.gate{padding:24px}.gate h2{font-size:34px}.source{font-size:9px}}
</style><body><div class="notice">ПРЕДВАРИТЕЛЬНЫЙ МАКЕТ · покупки и привязки здесь не выполняются</div><main class="shell"><header><div class="brand">БЛОШИНЫЙ РЫНОК<small>DAWN OF THE DEAD</small></div><button class="wallet" id="identity"><small>ВАШ ПЕРСОНАЖ</small><span id="player-name">Выбрать имя ↗</span></button></header><section class="hero"><div><span class="eyebrow">ТОРГОВЫЕ РЯДЫ БЛОШИНОГО РЫНКА</span><h1>Впервые у нас,<br>Выживший?</h1><p>Скорее подходи к торговым рядам!</p><span class="count">6 МАГАЗИНОВ / 136 ТОВАРОВ</span></div><figure><img src="__MARKET__" alt="Предоставленный баннер рынка"><figcaption><span>FLEA MARKET</span><span>НАЙДЕТСЯ ВСЕ!</span></figcaption></figure></section><div class="section-head"><h2>Торговые ряды</h2><small>ВЫБЕРИТЕ ЛАВКУ</small></div><section class="grid">__CARDS__</section><footer class="colophon"><span>Starfield • 2238</span><span>Не дай хромому Джеку тебя надуть!</span></footer><nav aria-label="Образец навигации"><button type="button">Рынок</button><button type="button">Корзины</button><button type="button">Покупки</button></nav><p class="source">Фон: игровой скриншот <a href="https://fallout.wiki/wiki/Rivet_City_Market">Rivet City Market, Fallout 3</a>, Bethesda. Вывески — предоставленные материалы проекта. Макет без генерации изображений. В рабочий магазин оформление еще не перенесено.</p></main><dialog id="welcome" aria-labelledby="gate-title"><form method="dialog" class="gate"><span class="eyebrow">ЗНАКОМСТВО С ТОРГОВЦЕМ</span><h2 id="gate-title">Представься,<br>Выживший.</h2><p>На чье имя записывать покупки?<br>Выбери своего персонажа.</p><div class="combo"><button type="button" class="select" id="select-name" aria-expanded="false" aria-controls="names" aria-haspopup="listbox"><span>Выберите имя</span><span aria-hidden="true">⌄</span></button><div class="options" id="names" role="listbox" aria-label="Персонаж" hidden>__OPTIONS__</div></div><div class="selected" id="selection" aria-live="polite"></div><button class="enter" id="enter" disabled>ВОЙТИ НА РЫНОК →</button><p class="hint">Это только пример оформления. Имя в этом макете не связывается с Telegram.</p></form></dialog><script>
const gate=document.querySelector('#welcome'),select=document.querySelector('#select-name'),list=document.querySelector('#names'),enter=document.querySelector('#enter'),choices=[...list.querySelectorAll('button')];
function toggle(open){list.hidden=!open;select.setAttribute('aria-expanded',String(open));if(open)choices.find(b=>b.getAttribute('aria-selected')==='true')?.focus();}
select.addEventListener('click',()=>toggle(list.hidden));
list.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;choices.forEach(c=>c.setAttribute('aria-selected',String(c===b)));select.querySelector('span').textContent=b.textContent;document.querySelector('#player-name').textContent=b.textContent;document.querySelector('#selection').textContent='Персонаж выбран: '+b.textContent;enter.disabled=false;toggle(false);select.focus();});
select.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();toggle(true);choices[e.key==='ArrowUp'?choices.length-1:0].focus();}});
list.addEventListener('keydown',e=>{const i=choices.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();choices[(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length].focus();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();toggle(false);select.focus();}});
document.querySelector('#identity').addEventListener('click',()=>gate.showModal());gate.showModal();
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{document.querySelector('.notice').textContent='Это предварительный макет оформления. Рабочая корзина доступна в боте.';}));
</script></body></html>'''
    doc=doc.replace('__BACKGROUND__',bg).replace('__MARKET__',market).replace('__CARDS__',cards).replace('__OPTIONS__',options)
    # All displayed text follows the owner's spelling preference.
    (HERE/'index.html').write_text(doc.replace('ё','е').replace('Ё','Е'))

if __name__=='__main__':
    board=Image.new('RGB',(1660,1270),'#101813');d=ImageDraw.Draw(board)
    text(d,(40,25),'БЛОШИНЫЙ РЫНОК',27,bold=True)
    text(d,(41,66),'ПРЕДВАРИТЕЛЬНЫЙ МАКЕТ / игровой скриншот Fallout 3 + материалы проекта',14,AMBER)
    board.paste(desktop(),(40,116));board.paste(mobile(),(1180,116))
    text(d,(1180,1133),'ТЕЛЕФОН / ПЕРВЫЙ ВХОД',12,AMBER,bold=True)
    paragraph(d,(1180,1160),'Список и выбранное имя оформлены в стиле рынка.',425,13,MUTED,21)
    text(d,(40,1233),'Фон: Rivet City Market, Fallout 3 / Bethesda.   Макет еще не внедрен.',12,MUTED)
    board.save(HERE/'preview.jpg',quality=93)
    make_html()
    print('Created preview.jpg and standalone index.html')

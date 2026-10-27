"""Telegram authentication, catalog validation and the signed Sheets connection."""
import hashlib
import hmac
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
CATALOG = json.loads((ROOT / "public/catalog.json").read_text()) if (ROOT / "public/catalog.json").exists() else {}
ITEMS = {i["id"]: {**i, "shopId": s["id"], "shopName": s["name"]} for s in CATALOG.get("shops", []) for i in s["items"]}

ERRORS = {
    "unauthorized": "Откройте магазин кнопкой в Telegram-боте.",
    "session_expired": "Сессия истекла. Закройте приложение и откройте магазин снова.",
    "not_configured": "Касса еще подключается. Каталог уже можно посмотреть.",
    "connection_failed": "Касса временно не отвечает. Повторите проверку покупки.",
    "busy": "Касса занята. Повторите через несколько секунд.",
    "invalid_cart": "Проверьте содержимое корзины.",
    "catalog_changed": "Каталог обновился. Проверьте цены и подтвердите покупку снова.",
    "not_enough_caps": "Для этой покупки не хватает крышек.",
    "invalid_balance": "Не удалось прочитать баланс. Обратитесь к Смотрителю.",
    "balance_formula": "Не удалось завершить покупку. Попробуйте позже.",
    "schema_changed": "Касса временно недоступна. Попробуйте позже.",
    "character_not_found": "Выживший не найден в реестре системы.",
    "character_taken": "Этот Выживший уже зарегистрирован на другой аккаунт. Обратитесь к Смотрителю.",
    "character_not_allowed": "Не удалось выбрать Выжившего.",
    "username_required": "Для регистрации нужно имя пользователя Telegram. Укажите его в настройках Telegram и сообщите Смотрителю.",
    "already_bound": "Выживший уже выбран.",
    "not_bound": "Сначала выберите Выжившего.",
    "id_conflict": "Не удалось завершить покупку. Проверьте результат.",
    "invalid_request": "Не удалось обработать запрос.",
    "order_not_found": "Покупка еще не зарегистрирована.",
    "invalid_branch": "Выберите ветку!",
    "incorrect_branch": "Выберите корректную ветку",
    "invalid_pack": "Проверьте количество предметов в рюкзаке.",
    "pack_full": "Все выбранные предметы не помещаются. Вместимость могла измениться — обновите рюкзак.",
    "pack_changed": "Рюкзак или вместимость изменились. Обновите данные перед сохранением.",
    "item_not_owned": "В инвентаре нет нужного количества этого предмета.",
    "invalid_capacity": "Не удалось открыть рюкзак. Попробуйте позже.",
    "inventory_formula": "Не удалось сохранить рюкзак. Попробуйте позже.",
    "inventory_too_large": "Не удалось сохранить рюкзак. Попробуйте позже.",
    "character_sheet_missing": "Дождитесь своего листа или напомните о нем!",
    "branch_sheet_missing": "Выберите ветку!",
    "template_not_found": "Рюкзак пока недоступен. Попробуйте позже.",
    "invalid_character_stats": "В реестре системы пока не заполнены характеристики Выжившего. Ожидайте.",
    "manual_slots_unknown": "Не удалось сохранить рюкзак. Попробуйте позже.",
}

class MarketError(RuntimeError):
    def __init__(self, code, status=400):
        self.code = code if code in ERRORS else "connection_failed"
        self.status = status
        super().__init__(ERRORS[self.code])

def authenticate(init_data, token, now=None):
    if not token or not isinstance(init_data, str) or not 1 <= len(init_data) <= 16000:
        raise MarketError("unauthorized", 401)
    try:
        pairs = urllib.parse.parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
        values = dict(pairs)
        if len(values) != len(pairs):
            raise ValueError("duplicate fields")
        received = values.pop("hash")
        # Telegram's HMAC check includes all received fields except hash.
        check = "\n".join(k + "=" + values[k] for k in sorted(values))
        key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
        expected = hmac.new(key, check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, received):
            raise ValueError("signature")
        auth_date = int(values["auth_date"])
        current = int(time.time() if now is None else now)
        if current - auth_date > 86400 or auth_date > current + 30:
            raise MarketError("session_expired", 401)
        user = json.loads(values["user"])
        if not isinstance(user, dict) or type(user.get("id")) is not int or not 0 < user["id"] < 2**53:
            raise ValueError("user")
        return {"id": str(user["id"]), "username": str(user.get("username", ""))[:64],
                "firstName": str(user.get("first_name", ""))[:100]}
    except MarketError:
        raise
    except Exception:
        raise MarketError("unauthorized", 401) from None

def validate_cart(body):
    shop_id = body.get("shopId")
    if body.get("revision") != CATALOG.get("revision"):
        raise MarketError("catalog_changed", 409)
    raw = body.get("items")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 40:
        raise MarketError("invalid_cart")
    seen = set()
    lines = []
    for row in raw:
        if not isinstance(row, dict):
            raise MarketError("invalid_cart")
        item = ITEMS.get(row.get("id"))
        qty = row.get("quantity")
        if not item or item["shopId"] != shop_id or item["id"] in seen or type(qty) is not int or not 1 <= qty <= 99:
            raise MarketError("invalid_cart")
        seen.add(item["id"])
        lines.append({"id": item["id"], "name": item["name"], "quantity": qty,
                      "price": item["price"], "total": item["price"] * qty, "slots": item["slots"] * qty})
    lines.sort(key=lambda i: i["id"])
    total = sum(i["total"] for i in lines)
    if type(body.get("expectedTotal")) is not int or body["expectedTotal"] != total:
        raise MarketError("catalog_changed", 409)
    return {"shopId": shop_id, "items": [{"id": i["id"], "quantity": i["quantity"]} for i in lines],
            "revision": CATALOG["revision"], "expectedTotal": total}, lines

def validate_order_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}", value):
        raise MarketError("invalid_request")
    return value

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        if parsed.scheme != "https" or parsed.hostname not in ("script.google.com", "script.googleusercontent.com") or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise MarketError("connection_failed", 503)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

class SheetsBridge:
    def __init__(self, url="", secret=""):
        self.url, self.secret = url, secret
        self.opener = urllib.request.build_opener(SafeRedirect())

    @property
    def configured(self):
        return bool(re.fullmatch(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec", self.url) and len(self.secret) >= 32)

    def call(self, action, user=None, **fields):
        if not self.configured:
            raise MarketError("not_configured", 503)
        if action not in ("state", "bind", "checkout", "order", "history", "verify", "reconcile", "inventory", "branch_join", "pack_save"):
            raise MarketError("invalid_request")
        payload = json.dumps({"action": "market_" + action, **({"user": user} if user else {}), **fields}, ensure_ascii=True, separators=(",", ":"))
        timestamp = int(time.time() * 1000)
        signature = hmac.new(self.secret.encode(), f"{timestamp}\n{payload}".encode(), hashlib.sha256).hexdigest()
        wire = json.dumps({"timestamp": timestamp, "payload": payload, "signature": signature}).encode()
        try:
            request = urllib.request.Request(self.url, data=wire, headers={"Content-Type": "application/json"})
            with self.opener.open(request, timeout=50) as response:
                raw = response.read(250001)
            if len(raw) > 250000:
                raise ValueError("too large")
            result = json.loads(raw)
        except MarketError:
            raise
        except Exception:
            raise MarketError("connection_failed", 503) from None
        if not isinstance(result, dict) or result.get("ok") is not True:
            code = result.get("error", "connection_failed") if isinstance(result, dict) else "connection_failed"
            raise MarketError(code, 503 if code in ("connection_failed", "busy", "not_configured", "schema_changed") else 409)
        if "bindingNotice" in result:
            result["bindingNotice"] = "Если вашего Выжившего нет в списке, то обратитесь к Смотрителю."
        if result.get("notice") == "Характеристики персонажа еще не заполнены.":
            result["notice"] = ERRORS["invalid_character_stats"]
        return result

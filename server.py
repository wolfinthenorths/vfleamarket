"""Fleamarket Mini App. Google is the authoritative financial ledger."""
import json
import mimetypes
import os
from pathlib import Path
import signal
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from market import CATALOG, ERRORS, MarketError, SheetsBridge, authenticate, validate_cart, validate_order_id

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
TOKEN = os.environ.get("BOT_TOKEN", "")
APP_URL = os.environ.get("APP_URL", "").rstrip("/")
DATA = Path(os.environ.get("DATA_DIR", str(ROOT / "local-data")))
BRIDGE = SheetsBridge(os.environ.get("SHEETS_BRIDGE_URL", ""), os.environ.get("SHEETS_BRIDGE_SECRET", ""))
STOP = threading.Event()
BRIDGE_STATUS = {"connected": False, "checkedAt": None}

def db():
    connection = sqlite3.connect(DATA / "market.sqlite3", timeout=15)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=15000")
    return connection

def init_db():
    DATA.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        con.execute("CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, receipt TEXT NOT NULL, recorded_at INTEGER NOT NULL)")

def mirror_order(user, order):
    # A mirror failure never changes the outcome of an already committed sale.
    try:
        with db() as con:
            con.execute("INSERT OR IGNORE INTO receipts VALUES(?,?,?,?)", (order["id"], user["id"], json.dumps(order, ensure_ascii=False), int(time.time())))
    except Exception:
        print("Local receipt mirror delayed; authoritative Google receipt retained", flush=True)

def telegram(method, payload):
    if not TOKEN:
        return None
    request = urllib.request.Request("https://api.telegram.org/bot" + TOKEN + "/" + method,
        data=json.dumps(payload, ensure_ascii=False).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            result = json.load(response)
        return result.get("result") if result.get("ok") else None
    except Exception:
        # Never log the URL, request, token or external error body.
        return None

def bot_worker():
    if not TOKEN or not APP_URL:
        return
    telegram("setChatMenuButton", {"menu_button": {"type": "web_app", "text": "Блошиный рынок", "web_app": {"url": APP_URL}}})
    telegram("setMyCommands", {"commands": [{"command": "start", "description": "Открыть Блошиный рынок"}, {"command": "shop", "description": "Магазины и корзины"}, {"command": "help", "description": "Как покупать за крышки"}]})
    telegram("setMyDescription", {"description": "Блошиный рынок Dawn of the Dead. Шесть магазинов, игровые предметы и снаряжение. Собирайте корзину и покупайте за внутриигровые крышки."})
    telegram("setMyShortDescription", {"short_description": "Торговые ряды Блошиного рынка. Предметы, снаряжение и покупки за крышки."})
    with db() as con:
        row = con.execute("SELECT value FROM settings WHERE key='telegram_offset'").fetchone()
    offset = int(row[0]) if row else 0
    while not STOP.is_set():
        updates = telegram("getUpdates", {"offset": offset, "timeout": 25, "allowed_updates": ["message"], "limit": 30})
        if updates is None:
            STOP.wait(5)
            continue
        for update in updates:
            message = update.get("message", {})
            text = message.get("text", "").split()[0].split("@")[0] if message.get("text") else ""
            private = message.get("chat", {}).get("type") == "private"
            if private and text in ("/start", "/shop", "/help"):
                answer = ("Блошиный рынок открыт.\n\nВыберите магазин, соберите корзину и подтвердите покупку. Оплата — внутриигровыми крышками с баланса вашего персонажа.\n\nПриобретенные предметы и квитанции остаются в разделе «Инвентарь».")
                result = telegram("sendMessage", {"chat_id": message["chat"]["id"], "text": answer,
                    "reply_markup": {"inline_keyboard": [[{"text": "Открыть торговые ряды", "web_app": {"url": APP_URL}}]]}})
                if result is None:
                    break
            offset = update["update_id"] + 1
            with db() as con:
                con.execute("INSERT INTO settings VALUES('telegram_offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(offset),))
        if not updates:
            STOP.wait(.2)

def reconcile_worker():
    while not STOP.is_set():
        if BRIDGE.configured:
            try:
                verification = BRIDGE.call("verify")
                if verification.get("revision") != CATALOG.get("revision"):
                    raise MarketError("catalog_changed", 503)
                BRIDGE.call("reconcile")
                BRIDGE_STATUS.update(connected=True, checkedAt=int(time.time()))
            except MarketError:
                BRIDGE_STATUS.update(connected=False, checkedAt=int(time.time()))
        STOP.wait(60)

class RateLimit:
    def __init__(self):
        self.rows, self.lock = {}, threading.Lock()

    def allowed(self, key):
        now = time.monotonic()
        with self.lock:
            if len(self.rows) > 2000:
                self.rows = {k: v for k, v in self.rows.items() if now - v[0] < 60}
            started, count = self.rows.get(key, (now, 0))
            if now - started >= 60:
                started, count = now, 0
            self.rows[key] = (started, count + 1)
            return count < 60

LIMIT = RateLimit()

class Handler(BaseHTTPRequestHandler):
    server_version = "Fleamarket"

    def log_message(self, format, *args):
        # Do not retain URLs, query strings, Telegram initData or user IDs.
        return

    def common_headers(self, content_type, size, no_store=True):
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org")
        self.send_header("Cache-Control", "no-store" if no_store else "public, max-age=86400")
        self.end_headers()

    def reply(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.common_headers("application/json; charset=utf-8", len(data))
        self.wfile.write(data)

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/health":
            self.reply({"ok": True, "service": "vfleamarket", "catalogItems": sum(len(s["items"]) for s in CATALOG.get("shops", [])),
                        "cashierConfigured": BRIDGE.configured, "cashierConnected": BRIDGE_STATUS["connected"]})
            return
        if path.startswith("/api/"):
            self.reply({"ok": False, "error": "invalid_request", "message": ERRORS["invalid_request"]}, 405)
            return
        target = (PUBLIC / urllib.parse.unquote(path).lstrip("/")).resolve() if path != "/" else PUBLIC / "index.html"
        if not target.is_relative_to(PUBLIC.resolve()) or not target.is_file() or target.name.startswith("."):
            self.reply({"ok": False, "error": "not_found"}, 404)
            return
        data = target.read_bytes()
        kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if kind.startswith("text/") or kind in ("application/javascript", "application/json"):
            kind += "; charset=utf-8"
        self.send_response(200)
        self.common_headers(kind, len(data), no_store=target.suffix in (".html", ".js", ".json", ".css"))
        self.wfile.write(data)

    def do_POST(self):
        try:
            path = urllib.parse.urlsplit(self.path).path
            if path not in ("/api/state", "/api/bind", "/api/checkout", "/api/order", "/api/history", "/api/inventory", "/api/branch_join", "/api/pack_save"):
                self.reply({"ok": False, "error": "not_found"}, 404)
                return
            if self.headers.get("Origin") and APP_URL and self.headers.get("Origin") != APP_URL:
                raise MarketError("unauthorized", 403)
            # Both Telegram Web and Desktop may omit Origin; their signed initData is still required.
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("tma "):
                raise MarketError("unauthorized", 401)
            user = authenticate(auth[4:], TOKEN)
            if not LIMIT.allowed(user["id"]):
                raise MarketError("busy", 429)
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16000 or self.headers.get_content_type() != "application/json":
                raise MarketError("invalid_request")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise MarketError("invalid_request")
            action = path.rsplit("/", 1)[-1]
            if action in ("state", "history"):
                result = BRIDGE.call(action, user)
            elif action in ("inventory", "branch_join", "pack_save"):
                branch_id = body.get("branchId", "")
                if not isinstance(branch_id, str) or len(branch_id) > 32:
                    raise MarketError("invalid_branch")
                if action == "pack_save":
                    items = body.get("items")
                    if not isinstance(items, list) or len(items) > 136:
                        raise MarketError("invalid_pack")
                    result = BRIDGE.call(action, user, branchId=branch_id, items=items,
                                        version=body.get("version"), requestId=validate_order_id(body.get("requestId")))
                else:
                    result = BRIDGE.call(action, user, branchId=branch_id)
            elif action == "bind":
                character_id = body.get("characterId")
                if not isinstance(character_id, str) or len(character_id) != 36:
                    raise MarketError("invalid_request")
                result = BRIDGE.call("bind", user, characterId=character_id)
            elif action == "order":
                result = BRIDGE.call("order", user, orderId=validate_order_id(body.get("orderId")))
            else:
                order_id = validate_order_id(body.get("orderId"))
                # Resolve an uncertain prior commit BEFORE checking today's prices.
                # A catalog update must never hide an already-paid receipt.
                try:
                    result = BRIDGE.call("order", user, orderId=order_id)
                    order = result["order"]
                    requested = sorted((i.get("id"), i.get("quantity")) for i in body.get("items", []) if isinstance(i, dict))
                    purchased = sorted((i["id"], i["quantity"]) for i in order["lines"])
                    if requested != purchased or body.get("shopId") != order["shopId"] or body.get("revision") != order["revision"] or body.get("expectedTotal") != order["total"]:
                        raise MarketError("id_conflict", 409)
                    result["replayed"] = True
                except MarketError as error:
                    if error.code != "order_not_found":
                        raise
                    cart, _ = validate_cart(body)
                    result = BRIDGE.call("checkout", user, orderId=order_id, **cart)
                mirror_order(user, result["order"])
            self.reply(result)
        except MarketError as error:
            self.reply({"ok": False, "error": error.code, "message": str(error)}, error.status)
        except (ValueError, TypeError, json.JSONDecodeError):
            self.reply({"ok": False, "error": "invalid_request", "message": ERRORS["invalid_request"]}, 400)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception:
            self.reply({"ok": False, "error": "connection_failed", "message": ERRORS["connection_failed"]}, 503)

def main():
    if os.environ.get("RAILWAY_ENVIRONMENT_ID"):
        if not TOKEN or not APP_URL or not os.environ.get("DATA_DIR") or not os.path.ismount(DATA):
            raise RuntimeError("Production requires bot configuration and a persistent data volume")
    if not CATALOG.get("shops"):
        raise RuntimeError("Catalog is missing")
    init_db()
    for worker in (bot_worker, reconcile_worker):
        threading.Thread(target=worker, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler)
    server.daemon_threads = True
    def shutdown(*_):
        STOP.set()
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    print("Fleamarket server ready", flush=True)
    server.serve_forever()

if __name__ == "__main__":
    main()

import hashlib
import hmac
import json
from pathlib import Path
import sys
import time
import unittest
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from market import authenticate, CATALOG, ITEMS, MarketError, validate_cart, validate_order_id

def signed(token="test-token", **extra):
    data = {"auth_date": str(int(time.time())), "user": json.dumps({"id": 12345, "username": "player"}), "signature": "ed25519-field-is-also-covered-by-hmac", **extra}
    check = "\n".join(k + "=" + str(data[k]) for k in sorted(data))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode(data)

class MarketTests(unittest.TestCase):
    def test_telegram_signature_and_user(self):
        self.assertEqual(authenticate(signed(), "test-token")["id"], "12345")

    def test_tampering_and_duplicate_fields_rejected(self):
        for data in (signed().replace("12345", "99999"), signed() + "&auth_date=1"):
            with self.assertRaises(MarketError): authenticate(data, "test-token")

    def test_expired_and_future_signature(self):
        for timestamp in (1, int(time.time()) + 100):
            with self.assertRaises(MarketError) as e: authenticate(signed(auth_date=str(timestamp)), "test-token")
            self.assertEqual(e.exception.code, "session_expired")

    def cart(self, **changes):
        return {"shopId": "count", "revision": CATALOG["revision"], "items": [{"id": "count-01", "quantity": 2}], "expectedTotal": 460, **changes}

    def test_prices_are_authoritative(self):
        _, lines = validate_cart(self.cart())
        self.assertEqual(lines[0]["total"], 460)
        with self.assertRaises(MarketError): validate_cart(self.cart(expectedTotal=1))

    def test_cross_shop_duplicate_boolean_and_bad_quantity(self):
        for rows in ([{"id": "kirk-01", "quantity": 1}], [{"id":"count-01", "quantity":True}], [{"id":"count-01","quantity":0}], [{"id":"count-01","quantity":100}], [{"id":"count-01","quantity":1}]*2):
            with self.assertRaises(MarketError): validate_cart(self.cart(items=rows))

    def test_order_ids_are_v4(self):
        self.assertEqual(validate_order_id("11111111-1111-4111-8111-111111111111"), "11111111-1111-4111-8111-111111111111")
        for value in ("test", 123, "11111111-1111-1111-1111-111111111111"):
            with self.assertRaises(MarketError): validate_order_id(value)

    def test_complete_catalog_and_assets(self):
        self.assertEqual(len(CATALOG["shops"]), 6)
        self.assertEqual(len(ITEMS), 136)
        for item in ITEMS.values():
            self.assertIs(type(item["price"]), int)
            self.assertGreater(item["price"], 0)
            self.assertTrue((Path(__file__).resolve().parents[1] / "public" / item["image"].lstrip("/")).is_file())

if __name__ == "__main__": unittest.main()

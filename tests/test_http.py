import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from test_market import signed

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.old_data, cls.old_token = server.DATA, server.TOKEN
        server.DATA, server.TOKEN = Path(cls.temp.name), "test-token"
        server.init_db()
        cls.server = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
        server.DATA, server.TOKEN = cls.old_data, cls.old_token
        cls.temp.cleanup()

    def request(self, method, path, data=None, auth=False):
        con = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        headers = {"Content-Type": "application/json"}
        if auth: headers["Authorization"] = "tma " + signed()
        con.request(method, path, json.dumps(data or {}) if method == "POST" else None, headers)
        response = con.getresponse(); raw = response.read()
        result = (response.status, dict(response.getheaders()), raw)
        con.close(); return result

    def test_static_site_and_security_headers(self):
        status, headers, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("Блошиный рынок".encode(), body)
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertNotIn(b"BOT_TOKEN", body)

    def test_private_api_requires_signed_telegram(self):
        status, _, body = self.request("POST", "/api/state", {})
        self.assertEqual(status, 401)
        self.assertEqual(json.loads(body)["error"], "unauthorized")

    def test_paid_receipt_resolves_before_current_catalog(self):
        order={"id":"11111111-1111-4111-8111-111111111111","shopId":"count","revision":"older-catalog","total":230,"userId":"12345","lines":[{"id":"count-01","quantity":1}]}
        body={"orderId":order["id"],"shopId":"count","revision":"older-catalog","expectedTotal":230,"items":[{"id":"count-01","quantity":1}]}
        with patch.object(server.BRIDGE,"call",return_value={"ok":True,"order":order}) as call:
            status, _, raw=self.request("POST","/api/checkout",body,auth=True)
        self.assertEqual(status,200)
        self.assertTrue(json.loads(raw)["replayed"])
        call.assert_called_once_with("order",unittest.mock.ANY,orderId=order["id"])

    def test_wrong_cart_cannot_reuse_receipt(self):
        order={"id":"11111111-1111-4111-8111-111111111111","shopId":"count","revision":"older","total":230,"userId":"12345","lines":[{"id":"count-01","quantity":1}]}
        with patch.object(server.BRIDGE,"call",return_value={"ok":True,"order":order}):
            status,_,raw=self.request("POST","/api/checkout",{"orderId":order["id"],"items":[]},auth=True)
        self.assertEqual(status,409)
        self.assertEqual(json.loads(raw)["error"],"id_conflict")

if __name__ == "__main__": unittest.main()

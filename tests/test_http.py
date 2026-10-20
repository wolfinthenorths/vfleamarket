import http.client
import gzip
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

    def setUp(self):
        server.SESSION_CHARACTERS.clear()

    def test_inventory_reuses_verified_launch_character_and_ignores_client_claim(self):
        auth={"Authorization": "tma " + signed()}
        character={"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","name":"Test Survivor"}
        def bridge(action, user, **fields):
            return {"ok":True,"character":character} if action=="state" else {"ok":True,"items":[]}
        with patch.object(server.BRIDGE,"call",side_effect=bridge) as call:
            self.assertEqual(self.request("POST","/api/state",extra_headers=auth)[0],200)
            for _ in range(2):
                self.assertEqual(self.request("POST","/api/inventory",{"sessionCharacter":{"id":"forged"}},extra_headers=auth)[0],200)
                self.assertEqual(call.call_args.kwargs["sessionCharacter"],character)
            self.assertEqual([c.args[0] for c in call.call_args_list],["state","inventory","inventory"])
            # A different signed launch must not inherit the previous binding.
            other={"Authorization":"tma "+signed(query_id="different-launch")}
            self.request("POST","/api/inventory",extra_headers=other)
            self.assertNotIn("sessionCharacter",call.call_args.kwargs)

    def request(self, method, path, data=None, auth=False, extra_headers=None):
        con = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        headers = {"Content-Type": "application/json"}
        if auth: headers["Authorization"] = "tma " + signed()
        headers.update(extra_headers or {})
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

    def test_static_compression_revalidation_and_private_no_store(self):
        status, headers, raw = self.request("GET", "/catalog.json")
        self.assertEqual(status, 200)
        status, compressed, body = self.request("GET", "/catalog.json", extra_headers={"Accept-Encoding":"gzip, deflate"})
        self.assertEqual(status, 200)
        self.assertEqual(gzip.decompress(body), raw)
        self.assertLess(len(body), len(raw) / 2)
        self.assertEqual(compressed["Content-Encoding"], "gzip")
        self.assertNotEqual(headers["ETag"], compressed["ETag"])
        status, _, body = self.request("GET", "/catalog.json", extra_headers={"Accept-Encoding":"gzip", "If-None-Match":compressed["ETag"]})
        self.assertEqual(status, 304)
        self.assertEqual(body, b"")
        self.assertEqual(compressed["Cache-Control"], "no-cache")
        _, private, _ = self.request("POST", "/api/state")
        self.assertEqual(private["Cache-Control"], "no-store")

    def test_backpack_routes_require_signature_and_ignore_spoofed_owner(self):
        for route in ("inventory", "branch_join", "pack_save"):
            status, _, _ = self.request("POST", "/api/" + route, {})
            self.assertEqual(status, 401)
        with patch.object(server.BRIDGE, "call", return_value={"ok": True, "items": []}) as call:
            status, _, _ = self.request("POST", "/api/inventory", {"branchId": "2.4", "user": {"id": "999"}, "characterId": "forged"}, auth=True)
        self.assertEqual(status, 200)
        args, kwargs = call.call_args
        self.assertEqual(args[0], "inventory")
        self.assertEqual(args[1]["id"], "12345")
        self.assertEqual(kwargs, {"branchId": "2.4"})

    def test_pack_save_is_bounded_and_sent_to_signed_bridge(self):
        payload = {"branchId": "2.4", "version": "test-version", "requestId": "11111111-1111-4111-8111-111111111111", "items": [{"id": "count-01", "quantity": 1}]}
        with patch.object(server.BRIDGE, "call", return_value={"ok": True}) as call:
            status, _, _ = self.request("POST", "/api/pack_save", payload, auth=True)
        self.assertEqual(status, 200)
        self.assertEqual(call.call_args.args[0], "pack_save")
        self.assertEqual(call.call_args.kwargs["items"], payload["items"])
        payload["items"] = [{}] * 137
        status, _, body = self.request("POST", "/api/pack_save", payload, auth=True)
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "invalid_pack")

    def test_paid_receipt_resolves_before_current_catalog(self):
        order={"id":"11111111-1111-4111-8111-111111111111","shopId":"count","revision":"older-catalog","total":230,"userId":"12345","lines":[{"id":"count-01","quantity":1}]}
        body={"orderId":order["id"],"shopId":"count","revision":"older-catalog","expectedTotal":230,"items":[{"id":"count-01","quantity":1}]}
        with patch.object(server.BRIDGE,"call",return_value={"ok":True,"order":order}) as call:
            status, _, raw=self.request("POST","/api/checkout",body,auth=True)
        self.assertEqual(status,200)
        self.assertTrue(json.loads(raw)["replayed"])
        call.assert_called_once_with("order",unittest.mock.ANY,orderId=order["id"])

    def test_valid_cart_uses_one_bridge_call_and_wakes_mirror(self):
        item=server.CATALOG["shops"][0]["items"][0]
        order={"id":"22222222-2222-4222-8222-222222222222","shopId":"count","revision":server.CATALOG["revision"],"total":item["price"],"userId":"12345","lines":[{"id":item["id"],"quantity":1}]}
        body={"orderId":order["id"],"shopId":"count","revision":order["revision"],"expectedTotal":order["total"],"items":order["lines"]}
        server.RECONCILE_WAKE.clear()
        with patch.object(server.BRIDGE,"call",return_value={"ok":True,"order":order}) as call:
            status,_,_=self.request("POST","/api/checkout",body,auth=True)
        self.assertEqual(status,200)
        self.assertEqual(call.call_count,1)
        self.assertEqual(call.call_args.args[0],"checkout")
        self.assertTrue(server.RECONCILE_WAKE.is_set())

    def test_wrong_cart_cannot_reuse_receipt(self):
        order={"id":"11111111-1111-4111-8111-111111111111","shopId":"count","revision":"older","total":230,"userId":"12345","lines":[{"id":"count-01","quantity":1}]}
        with patch.object(server.BRIDGE,"call",return_value={"ok":True,"order":order}):
            status,_,raw=self.request("POST","/api/checkout",{"orderId":order["id"],"items":[]},auth=True)
        self.assertEqual(status,409)
        self.assertEqual(json.loads(raw)["error"],"id_conflict")

if __name__ == "__main__": unittest.main()

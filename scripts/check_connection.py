"""Read-only deployment checks; accept the bot token via hidden stdin, never argv."""
import hashlib
import hmac
import json
import sys
import termios
import time
import urllib.error
import urllib.parse
import urllib.request

def request(url, payload=None, headers=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type":"application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)

def main():
    fd=sys.stdin.fileno(); old=termios.tcgetattr(fd); modified=termios.tcgetattr(fd); modified[3]&=~termios.ECHO; termios.tcsetattr(fd,termios.TCSANOW,modified)
    print("Ready for hidden verification input",flush=True)
    try: settings=json.loads(sys.stdin.readline())
    finally: termios.tcsetattr(fd,termios.TCSANOW,old)
    token=settings["token"]; app=settings["url"]
    try:
        me=request("https://api.telegram.org/bot"+token+"/getMe")["result"]
        print(json.dumps({"bot_username":me["username"],"expected_identity":me["username"].lower()=="vfleamarketbot"}),flush=True)
        if me["username"].lower()!="vfleamarketbot":raise ValueError("Bot identity mismatch")
        info=request("https://api.telegram.org/bot"+token+"/getWebhookInfo")["result"]
        print(json.dumps({"webhook_present":bool(info.get("url")),"pending_updates":info.get("pending_update_count")}),flush=True)
        menu=request("https://api.telegram.org/bot"+token+"/getChatMenuButton")["result"]
        print(json.dumps({"menu_type":menu.get("type"),"menu_url":menu.get("web_app",{}).get("url"),"menu_matches":str(menu.get("web_app",{}).get("url", "")).rstrip("/")==app.rstrip("/")}),flush=True)
        print(json.dumps({"health":request(app+"/health")}),flush=True)
        fields={"auth_date":str(int(time.time())),"user":json.dumps({"id":9007199254740000,"first_name":"Connection check"},separators=(",",":"))}
        check="\n".join(k+"="+fields[k] for k in sorted(fields));key=hmac.new(b"WebAppData",token.encode(),hashlib.sha256).digest();fields["hash"]=hmac.new(key,check.encode(),hashlib.sha256).hexdigest()
        result=request(app+"/api/state",{}, {"Authorization":"tma "+urllib.parse.urlencode(fields),"Origin":app})
        print(json.dumps({"signed_state_ok":result.get("ok"),"available_characters":len(result.get("availableCharacters",[])),"test_account_unbound":result.get("character") is None}),flush=True)
    except urllib.error.HTTPError as error:
        info={"verification_http_status":error.code}
        try:
            raw=json.loads(error.read(2000));info["provider_error_code"]=raw.get("error_code");info["provider_description"]=str(raw.get("description", ""))[:160]
        except Exception:pass
        print(json.dumps(info),flush=True)
        return 1
    except Exception as error:
        # Requests contain credentials. Never print urllib exceptions or URLs.
        print(json.dumps({"verification_error":type(error).__name__}),flush=True)
        return 1
    return 0

if __name__=="__main__":sys.exit(main())

"""Materialize only the pinned, owner-supplied image assets at build time."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def valid_image(data, mime):
    return ((mime == "image/webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP") or
            (mime == "image/png" and data.startswith(b"\x89PNG\r\n\x1a\n")) or
            (mime == "image/jpeg" and data.startswith(b"\xff\xd8\xff")) or
            (mime == "image/gif" and data[:6] in (b"GIF87a", b"GIF89a")))

def download(asset):
    target = ROOT / "public" / asset["path"].lstrip("/")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == asset.get("sha256"):
        return
    for attempt in range(4):
        try:
            request = urllib.request.Request(
                "https://drive.google.com/uc?export=download&id=" + asset["driveId"],
                headers={"User-Agent": "Starfield-Fleamarket/1.0"})
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read(12_000_001)
            if len(data) > 12_000_000 or not valid_image(data, asset["mime"]):
                raise ValueError("Asset is not a supported image")
            if asset.get("sha256") and hashlib.sha256(data).hexdigest() != asset["sha256"]:
                raise ValueError("Asset content changed; rebuild the verified manifest")
            target.write_bytes(data)
            return
        except Exception:
            if attempt == 3:
                raise RuntimeError("Cannot download verified asset: " + asset["path"]) from None
            time.sleep(attempt + 1)

if __name__ == "__main__":
    manifest = json.loads((ROOT / "data/assets.json").read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(download, manifest))
    from PIL import Image
    for asset in manifest:
        if asset["mime"] == "image/gif":
            target = ROOT / "public" / asset["path"].lstrip("/")
            with Image.open(target) as source:
                source.seek(0)
                source.convert("RGB").save(target.with_suffix(".webp"), quality=90)
    print("Verified image assets:", len(manifest))


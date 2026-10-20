"""Export a provided UI cutout at the small size used by the app."""
import argparse
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("source")
parser.add_argument("destination")
args = parser.parse_args()
with Image.open(args.source) as original:
    image = original.convert("RGBA")
    image.thumbnail((160, 160), Image.Resampling.LANCZOS)
    image.save(args.destination, "WEBP", quality=90, method=6)

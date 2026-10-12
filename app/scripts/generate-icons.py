"""Draws the Polycast mark as app icons: the brand version and one per flag (orange pole + three flag bars).
Run: npx tsx scripts/icon-data.ts | python3 scripts/generate-icons.py"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

data = json.load(sys.stdin)
INK = data["ink"]
POLE = data["pole"]
out = Path(__file__).resolve().parent.parent / "assets" / "icons"
out.mkdir(parents=True, exist_ok=True)

# Geometry of the mark from Finlay's original SVG (viewBox 71 x 105).
BARS = [(0, 0, 105), (19, 8, 67), (38, 19, 47), (57, 28, 30)]  # x, y, height; width 14, radius 7

OUTLINED = {c.upper() for c in data["outlined"]}  # decided by needsOutline() in @polycast/core

def outline_needed(hex_):
    return hex_.upper() in OUTLINED

def draw(colours, size=1024, background=True, mark_height=0.55):
    img = Image.new("RGBA", (size, size), INK if background else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size * mark_height / 105
    ox = (size - 71 * s) / 2
    oy = (size - 105 * s) / 2
    for (x, y, h), c in zip(BARS, colours):
        box = [ox + x * s, oy + y * s, ox + (x + 14) * s, oy + (y + h) * s]
        if outline_needed(c):
            pad = 2.5 * s / 5
            d.rounded_rectangle([box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad], radius=7 * s + pad, fill="#5A5A66")
        d.rounded_rectangle(box, radius=7 * s, fill=c)
    return img

brand = [POLE] + data["brand"]
draw(brand).convert("RGB").save(out.parent / "icon.png")
draw(brand, background=False, mark_height=0.42).save(out.parent / "splash-icon.png")
draw(brand, background=False, mark_height=0.42).save(out.parent / "android-icon-foreground.png")
for f in data["flags"]:
    draw([POLE] + f["bars"]).convert("RGB").save(out / f"flag-{f['id']}.png")
print(f"Wrote brand icon and {len(data['flags'])} flag icons to {out}")

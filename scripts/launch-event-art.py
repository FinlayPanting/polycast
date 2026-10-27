"""
Draws the launch-week App Store art (PC-1025-09): the in-app event's card (16:9) and details page
(9:16), and the product page header (21:9) plus a 16:9 universal header/search asset for the Asset
Library. Run: python3 scripts/launch-event-art.py  (needs Python Playwright; writes docs/app-store/).
Colours and the mark come from packages/core/src/flags.ts and app/src/lib/markGeometry.ts.
"""
import base64
import pathlib
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "app-store"
FONT = ROOT / "node_modules" / "@expo-google-fonts" / "figtree"
NAVY, ORANGE, CORAL, MAGENTA, VIOLET = "#1A1A30", "#FF9C18", "#FA6752", "#D23193", "#7F6FA4"
BARS = [(0, 0, 105), (19, 8, 67), (38, 19, 47), (57, 28, 30)]
FLAGS = {  # the six launch languages' marks
    "es": ["#AA151B", "#F1BF00", "#AA151B"], "fr": ["#0055A4", "#FFFFFF", "#EF4135"],
    "de": ["#000000", "#DD0000", "#FFCE00"], "it": ["#009246", "#FFFFFF", "#CE2B37"],
    "pt": ["#046A38", "#DA291C", "#FFE900"], "sv": ["#006AA7", "#FECC02", "#006AA7"],
}


def mark(colours, unit):
    bars = []
    for i, (x, y, h) in enumerate(BARS):
        c = colours[i]
        outline = "box-shadow: inset 0 0 0 %.1fpx #5A5A66;" % max(1, unit * 0.6) if c.upper() in ("#FFFFFF", "#000000") else ""
        bars.append(f'<div style="position:absolute;left:{x*unit}px;top:{y*unit}px;width:{14*unit}px;height:{h*unit}px;border-radius:{7*unit}px;background:{c};{outline}"></div>')
    return f'<div style="position:relative;width:{71*unit}px;height:{105*unit}px">{"".join(bars)}</div>'


def font_faces():
    # Inlined, because a page set from a string can't load local files.
    out = []
    for weight, name in ((400, "400Regular"), (500, "500Medium"), (600, "600SemiBold")):
        data = base64.b64encode((FONT / name / f"Figtree_{name}.ttf").read_bytes()).decode()
        out.append(f"@font-face {{ font-family: Figtree; font-weight: {weight}; src: url(data:font/ttf;base64,{data}); }}")
    return "\n".join(out)


def page(w, h, layout):
    s = min(w, h) / 1080  # one design unit per 1080 px of the short side
    hero = mark([ORANGE, CORAL, MAGENTA, VIOLET], 3.1 * s)
    flags = "".join(f'<div style="opacity:.95">{mark([ORANGE] + c, 0.9 * s)}</div>' for c in FLAGS.values())
    subtitle = f"""
      <div style="background:#24243D;border-radius:{28*s}px;padding:{34*s}px {40*s}px;max-width:{720*s}px;box-shadow:0 {20*s}px {60*s}px rgba(0,0,0,.35)">
        <div style="font:500 {44*s}px Figtree;color:#EDEBE7;line-height:1.25">Ska vi ta en <span style="color:{CORAL};text-decoration:underline;text-decoration-thickness:{4*s}px;text-underline-offset:{8*s}px">fika</span> sen?</div>
        <div style="font:400 {30*s}px Figtree;color:#9A98A3;margin-top:{12*s}px">Shall we grab a coffee later?</div>
      </div>
      <div style="display:flex;align-items:center;gap:{18*s}px;margin-top:{26*s}px">
        <div style="width:{18*s}px;height:{18*s}px;border-radius:50%;background:{MAGENTA}"></div>
        <div style="font:600 {32*s}px Figtree;color:#EE6FB8">Mia</div>
        <div style="font:400 {30*s}px Figtree;color:#EDEBE7">“Fika” is a coffee break, and a Swedish institution.</div>
      </div>"""
    if layout == "wide":
        body = f"""<div style="display:flex;align-items:center;justify-content:center;gap:{120*s}px;height:100%">
            <div>{hero}</div><div>{subtitle}<div style="display:flex;gap:{36*s}px;margin-top:{70*s}px">{flags}</div></div></div>"""
    else:
        body = f"""<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:{90*s}px;height:100%;padding:0 {70*s}px">
            <div>{hero}</div><div>{subtitle}</div><div style="display:flex;gap:{36*s}px">{flags}</div></div>"""
    glow = f"radial-gradient(ellipse at 30% 40%, rgba(255,156,24,.16), transparent 55%), radial-gradient(ellipse at 75% 70%, rgba(210,49,147,.14), transparent 50%)"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
      {font_faces()}
      html,body {{ margin:0; width:{w}px; height:{h}px; background:{NAVY}; overflow:hidden }}
      body {{ background-image: {glow} }}
    </style></head><body>{body}</body></html>"""


ART = [
    ("event-card-1920x1080.png", 1920, 1080, "wide"),
    ("event-details-1080x1920.png", 1080, 1920, "tall"),
    ("product-page-header-3840x1646.png", 3840, 1646, "wide"),
    ("universal-header-5244x2950.png", 5244, 2950, "wide"),
]

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, w, h, layout in ART:
            pg = browser.new_page(viewport={"width": w, "height": h})
            pg.set_content(page(w, h, layout))
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / name), omit_background=False)
            pg.close()
            # Opaque RGB (the App Store refuses transparency), saved as small as PNG allows.
            Image.open(OUT / name).convert("RGB").save(OUT / name, optimize=True)
            print("wrote", OUT / name)
        browser.close()

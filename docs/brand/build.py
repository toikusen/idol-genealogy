"""Build the Idol Maps logo masters with real boolean geometry and outlined type.

Requires: pip install skia-pathops fonttools, plus CormorantGaramond[wght].ttf
(github.com/google/fonts, ofl/cormorantgaramond) next to this script.
"""
import math
import pathops
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import RecordingPen

PINK, DEEP, INK = "#dc6390", "#4b3a8f", "#2d2440"
K = 0.5522847498  # cubic circle constant

# --- geometry in the upright mic frame, then one affine to the final canvas -------------------
A = math.radians(45)
def place(x, y):
    # rotate(45 128 136) translate(0 4), then translate(128 124) translate(-134.4 -137.1)
    y += 4
    x, y = x - 128, y - 136
    x, y = x * math.cos(A) - y * math.sin(A) + 128, x * math.sin(A) + y * math.cos(A) + 136
    return x - 6.4, y - 9.1

def poly(pts):
    p = pathops.Path(); pen = p.getPen()
    pen.moveTo(place(*pts[0]))
    for q in pts[1:]: pen.lineTo(place(*q))
    pen.closePath(); return p

def circle(cx, cy, r):
    p = pathops.Path(); pen = p.getPen(); k = K * r
    pen.moveTo(place(cx + r, cy))
    for (x1, y1, x2, y2, x3, y3) in [(cx+r, cy+k, cx+k, cy+r, cx, cy+r), (cx-k, cy+r, cx-r, cy+k, cx-r, cy),
                                     (cx-r, cy-k, cx-k, cy-r, cx, cy-r), (cx+k, cy-r, cx+r, cy-k, cx+r, cy)]:
        pen.curveTo(place(x1, y1), place(x2, y2), place(x3, y3))
    pen.closePath(); return p

def handle(r_end=16):
    # tapered grip with a round end: straight sides, semicircle at the bottom
    p = pathops.Path(); pen = p.getPen(); cx, cy, k = 128, 226, K * r_end
    pen.moveTo(place(100, 128)); pen.lineTo(place(156, 128)); pen.lineTo(place(144, 226))
    pen.curveTo(place(144, 226 + k), place(cx + k, cy + r_end), place(cx, cy + r_end))
    pen.curveTo(place(cx - k, cy + r_end), place(112, 226 + k), place(112, 226))
    pen.closePath(); return p

def union(*ps): return pathops.op(ps[0], pathops.union(ps[1:]) if len(ps) > 2 else ps[1], pathops.PathOp.UNION) if len(ps) > 1 else ps[0]
def U(ps):
    out = ps[0]
    for q in ps[1:]: out = pathops.op(out, q, pathops.PathOp.UNION)
    return out
def minus(a, b): return pathops.op(a, b, pathops.PathOp.DIFFERENCE)

def flower(cx, cy, r, d):
    return U([circle(cx, cy, d)] + [circle(cx + d * math.cos(math.radians(-90 + 72 * k)),
                                           cy + d * math.sin(math.radians(-90 + 72 * k)), r) for k in range(5)])

def mark(band_h=10, r=19, d=23, hole=7, halo=5, cx=182, cy=150):
    band = poly([(70, 67 - band_h / 2), (186, 67 - band_h / 2), (186, 67 + band_h / 2), (70, 67 + band_h / 2)])
    mic = minus(U([circle(128, 68, 50), handle()]), band)
    mic = minus(mic, flower(cx, cy, r + halo, d))
    bloom = flower(cx, cy, r, d)
    if hole: bloom = minus(bloom, circle(cx, cy, hole))
    return mic, bloom

def d_of(p):
    pen = SVGPathPen(None); p.draw(pen); return pen.getCommands()

def svg(view, body, title="Idol Maps"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}"><title>{title}</title>{body}</svg>\n'

def two_tone(mic, bloom, c1=DEEP, c2=PINK):
    return f'<path fill="{c1}" d="{d_of(mic)}"/><path fill="{c2}" d="{d_of(bloom)}"/>'

# --- wordmark: "Idol Maps" in Cormorant Garamond Medium, outlined ------------------------------
def wordmark(size=128, tracking=2):
    f = instantiateVariableFont(TTFont("CormorantGaramond[wght].ttf"), {"wght": 650})
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    s = size / f["head"].unitsPerEm
    parts, x = {"Idol": [], "Maps": []}, 0.0
    for word in ("Idol", "Maps"):
        for ch in word:
            g = cmap[ord(ch)]
            pen = SVGPathPen(gs)
            gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, 0)))
            parts[word].append(pen.getCommands())
            x += hmtx[g][0] * s + tracking
        if word == "Idol": x += hmtx[cmap[32]][0] * s - tracking * 0.5
    asc = f["OS/2"].sCapHeight * s
    return parts, x - tracking, asc

if __name__ == "__main__":
    mic, bloom = mark()
    open("idolmaps-symbol.svg", "w").write(svg("0 0 256 256", two_tone(mic, bloom)))
    # small-size cut: thicker grille gap, bigger halo, no flower centre hole (it closes below 32 px)
    smic, sbloom = mark(band_h=16, halo=8, hole=0, r=21, d=25)
    open("idolmaps-symbol-small.svg", "w").write(svg("0 0 256 256", two_tone(smic, sbloom)))
    # reversed (on dark): lighter purple so the mic doesn't sink into the background
    open("idolmaps-symbol-reversed.svg", "w").write(svg("0 0 256 256", two_tone(mic, bloom, "#9d90f7", "#e879a0")))

    parts, width, cap = wordmark()
    words = lambda c1, c2: (f'<path fill="{c1}" d="{" ".join(parts["Idol"])}"/>'
                            f'<path fill="{c2}" d="{" ".join(parts["Maps"])}"/>')
    # horizontal: symbol 256 tall, cap height centred on the symbol's optical middle
    base = 128 + cap / 2
    W = int(248 + width + 8)
    h = f'<g>{two_tone(mic, bloom)}</g><g transform="translate(248 {base:.1f})">{words(INK, PINK)}</g>'
    open("idolmaps-horizontal.svg", "w").write(svg(f"32 0 {W-32} 256", h))
    hr = f'<g>{two_tone(mic, bloom, "#9d90f7", "#e879a0")}</g><g transform="translate(248 {base:.1f})">{words("#ffffff", "#e879a0")}</g>'
    open("idolmaps-horizontal-reversed.svg", "w").write(svg(f"32 0 {W-32} 256", hr))
    # stacked: symbol above, wordmark centred
    SW = max(256, int(width + 32)); sx = (SW - 256) / 2; tx = (SW - width) / 2
    st = f'<g transform="translate({sx:.1f} 0)">{two_tone(mic, bloom)}</g><g transform="translate({tx:.1f} {256 + 24 + cap:.1f})">{words(INK, PINK)}</g>'
    open("idolmaps-stacked.svg", "w").write(svg(f"0 0 {SW} {int(256 + 24 + cap + 40)}", st))
    open("idolmaps-wordmark.svg", "w").write(svg(f"0 0 {int(width + 8)} {int(cap + 44)}", f'<g transform="translate(4 {cap + 8:.1f})">{words(INK, PINK)}</g>'))
    print("ok, wordmark width", round(width), "cap", round(cap))

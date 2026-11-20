#!/usr/bin/env python3
"""Build every final image in public/assets/ from the raw generations in assets_src/gen/.

Implements GAME_DESIGN.md sections 13.4 (badge sheet cutting), 13.5 (card face
compositing and derivations) and 13.6 (final file list).

Usage:
  tools/.venv/bin/python tools/art/build.py [step ...]
Steps: cutouts suits cards backs badges fore portraits env ui contact optimize all
(default: all). Raw inputs are never modified. Cut-outs are cached in
assets_src/gen/_cut/<gen_id>.png (delete one, or run the `cutouts` step, to force a fresh rembg pass).
"""
import math
import os
import warnings
import shutil
import subprocess
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

warnings.filterwarnings("ignore", category=DeprecationWarning)

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / "assets_src" / "gen"
CUT = ROOT / "assets_src" / "gen" / "_cut"
OUT = ROOT / "public" / "assets"
SRC = ROOT / "assets_src"
REMBG = os.environ.get("REMBG", shutil.which("rembg") or os.path.expanduser("~/.local/bin/rembg"))

OCHRE = (0xD9, 0xA4, 0x41)   # contact-sheet ring colour

SUITS = ["kupe", "bate", "spade", "dinari"]
RANKS = ["3", "2", "a", "k", "c", "f", "7", "6", "5", "4"]
INDEX_TEXT = {"a": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7",
              "f": "11", "c": "12", "k": "13"}
W, H = 480, 768
SS = 4  # supersampling factor for drawn vector shapes

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/Library/Fonts/DejaVuSerif-Bold.ttf",
]


# --------------------------------------------------------------------------- helpers

def font(size):
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def raw(gid):
    p = GEN / f"{gid}.png"
    if not p.exists():
        raise FileNotFoundError(p)
    return Image.open(p).convert("RGBA")


def have(gid):
    return (GEN / f"{gid}.png").exists()


def resize(img, size):
    """Lanczos resize with premultiplied alpha (no dark/grey fringes)."""
    if img.mode == "RGBA":
        return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")
    return img.resize(size, Image.LANCZOS)


def crop_to_card(img):
    """1024x1536 (1.5) -> centre crop to ratio 1.6 -> 480x768."""
    w, h = img.size
    cw = round(h / 1.6)
    if cw < w:
        x0 = (w - cw) // 2
        img = img.crop((x0, 0, x0 + cw, h))
    else:
        ch = round(w * 1.6)
        y0 = (h - ch) // 2
        img = img.crop((0, y0, w, y0 + ch))
    return resize(img, (W, H))


def save_png(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def trim(img, thr=16):
    a = np.asarray(img.getchannel("A"))
    ys, xs = np.nonzero(a > thr)
    if len(xs) == 0:
        return img
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def pad_square(img, margin_frac=0.0):
    w, h = img.size
    s = int(round(max(w, h) * (1 + 2 * margin_frac)))
    c = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    c.alpha_composite(img, ((s - w) // 2, (s - h) // 2))
    return c


def fit_box(img, box_w, box_h):
    w, h = img.size
    k = min(box_w / w, box_h / h)
    return resize(img, (max(1, round(w * k)), max(1, round(h * k))))


def paste_center(canvas, img, cx, cy):
    w, h = img.size
    x, y = round(cx - w / 2), round(cy - h / 2)
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    layer.paste(img, (x, y), img)
    canvas.alpha_composite(layer)


def ss_layer():
    return Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))


def ss_down(layer):
    return resize(layer, (W, H))


# --------------------------------------------------------------------------- cut-outs

def bg_colour(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3),
                             a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    return np.median(border, axis=0)


def _propagate_rows(m, r):
    h, w = m.shape
    mm = np.concatenate([m, np.zeros((h, 1), bool)], 1).ravel()
    rr = np.concatenate([r, np.zeros((h, 1), bool)], 1).ravel()
    starts = mm & ~np.concatenate([[False], mm[:-1]])
    lab = np.cumsum(starts) * mm
    hit = np.bincount(lab[rr & mm], minlength=int(lab.max()) + 1) > 0
    hit[0] = False
    return (hit[lab] & mm).reshape(h, w + 1)[:, :w]


def flood_from_border(m):
    """Pixels of boolean mask `m` 4-connected to the image border (run-based
    flood fill, alternating row and column passes until stable)."""
    r = np.zeros_like(m)
    r[0], r[-1], r[:, 0], r[:, -1] = m[0], m[-1], m[:, 0], m[:, -1]
    prev = -1
    while True:
        r = _propagate_rows(m, r)
        r = _propagate_rows(m.T.copy(), r.T.copy()).T
        n = int(r.sum())
        if n == prev:
            return r
        prev = n


CUTOUT_HOLES = ()              # gen ids whose enclosed background pockets are cut out
CUTOUT_HOLES_PREFIX = ("ace_", "tri_")


def cutout(gid, force=False):
    """rembg cut-out + defringe against the flat generation background."""
    CUT.mkdir(parents=True, exist_ok=True)
    out = CUT / f"{gid}.png"
    if out.exists() and not force:
        return Image.open(out).convert("RGBA")
    src = GEN / f"{gid}.png"
    tmp = CUT / f"{gid}_rembg.png"
    subprocess.run([REMBG, "i", "-m", "u2net", str(src), str(tmp)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    orig = Image.open(src).convert("RGBA")
    bg = bg_colour(orig)
    cut = np.asarray(Image.open(tmp).convert("RGBA")).astype(np.float32)
    rgb = np.asarray(orig.convert("RGB")).astype(np.float32)
    a_rembg = Image.fromarray(cut[..., 3].astype(np.uint8), "L")
    # rembg's mask is upsampled from 320 px and has soft, blurry edges. Sharpen
    # it with a colour key against the flat background: inside the eroded rembg
    # mask keep 1, in the edge band use the key, outside the dilated mask use 0.
    k = max(3, (min(orig.size) // 200) | 1)
    core = np.asarray(a_rembg.filter(ImageFilter.MinFilter(k * 2 + 1))).astype(np.float32) / 255.0
    zone = np.asarray(a_rembg.point(lambda v: 255 if v > 8 else 0).filter(
        ImageFilter.MaxFilter(k * 2 + 1))).astype(np.float32) / 255.0
    dist = np.sqrt(((rgb - bg[None, None, :]) ** 2).sum(-1))
    key = np.clip((dist - 10.0) / 45.0, 0.0, 1.0)
    # background reachable from the image border through near-bg pixels is
    # always transparent (also clears narrow gaps between touching seals)
    outside = flood_from_border(dist < 10.0)
    ornate = gid in CUTOUT_HOLES or gid.startswith(CUTOUT_HOLES_PREFIX)
    if ornate:
        # rembg drops thin scrolls that float free of the main body, so for
        # ornate emblems the colour key alone decides outside rembg's mask
        zone = np.ones_like(zone)
    a = np.maximum(core, key) * zone * (~outside)
    if ornate:
        # ornate emblems enclose pockets of background between their scrolls;
        # every (non-speck) pure-background pocket is a hole, keyed at its rim
        near = Image.fromarray(((dist < 10.0) & ~outside).astype(np.uint8) * 255)
        near = near.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
        holes = np.asarray(near) > 0
        rim = np.asarray(near.filter(ImageFilter.MaxFilter(k * 2 + 1))) > 0
        a = np.where(rim, key * zone, a)
        a[holes] = 0.0
    a = a[..., None]
    # clean alpha: kill faint noise, solidify the nearly-opaque core
    a = np.where(a < 0.04, 0.0, a)
    a = np.where(a > 0.96, 1.0, a)
    # un-mix the grey background from semi-transparent edge pixels
    safe = np.maximum(a, 1e-3)
    fg = (rgb - (1.0 - a) * bg[None, None, :]) / safe
    fg = np.where(a > 0.0, fg, rgb)
    fg = np.clip(fg, 0, 255)
    res = np.concatenate([fg, a * 255.0], axis=-1).astype(np.uint8)
    img = Image.fromarray(res)
    img.save(out)
    tmp.unlink(missing_ok=True)
    return img


# --------------------------------------------------------------------------- Triestine faces
#
# The faces follow the Triestine pattern (GAME_DESIGN.md section 13.5): a white card, a thin
# black frame line, a black serif numeral top-left and rotated bottom-right, flat red/blue/
# yellow print art. Pips are generated once as cut-outs and placed, rotated, mirrored and
# recoloured in code, so every count is exact; the sword ovals are drawn in code; courts are
# generated half figures made double-ended here; text (court banners, numerals) is drawn here.

# flat print colours, sampled from the generated pips (tri_coin)
RED = (234, 46, 24)
BLUE = (8, 92, 222)
YELLOW = (250, 208, 10)
BLACK = (12, 12, 12)
WHITE = (255, 255, 255)

FRAME_INSET, FRAME_R, FRAME_W = 20, 12, 3   # thin black frame line (keep in sync with FACE in placeholders.ts)
INDEX_FONT = ("/System/Library/Fonts/Supplemental/Bodoni 72.ttc", 2)   # Bodoni 72 Bold
INDEX_PX = 60
INDEX_C = (54, 58)     # ink-box centre of a one-digit numeral; two digits sit 8 px further right
INDEX_HALO = 3         # px white outline round the numeral (keeps it legible over court art)
LABEL_FONT = ("/System/Library/Fonts/Supplemental/Times New Roman.ttf", 0)
LABEL_PX = 32
BANNER = (362, 406)    # court name banner, y0..y1
LABEL_RANK = {"f": "FANTE", "c": "CAVAL", "k": "RE"}
LABEL_SUIT = {"kupe": "COPPE", "bate": "BASTONI", "spade": "SPADE", "dinari": "DANARI"}
INNER = (FRAME_INSET + FRAME_W, FRAME_INSET + FRAME_W,
         W - FRAME_INSET - FRAME_W, H - FRAME_INSET - FRAME_W)   # art area inside the frame line


def tfont(spec, size):
    path, idx = spec
    if Path(path).exists():
        return ImageFont.truetype(path, size, index=idx)
    return font(size)


def whiten_rgba(img, thr=226):
    """Snap near-white, unsaturated pixels of a cut-out to pure white (the generations print
    their whites at ~248, which would read as grey on the white card)."""
    a = np.asarray(img.convert("RGBA")).copy()
    rgb = a[..., :3].astype(np.int16)
    m = (rgb.min(-1) >= thr) & ((rgb.max(-1) - rgb.min(-1)) < 22)
    a[..., :3][m] = 255
    return Image.fromarray(a)


def white_art(gid):
    """A generation drawn on plain white, levelled so its background is pure white (RGB)."""
    im = raw(gid).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3),
                             a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bright = border[border.min(-1) > 200]
    paper = np.median(bright, axis=0) if len(bright) else np.array([255.0, 255.0, 255.0])
    a = np.clip(a * (255.0 / np.maximum(paper, 1.0))[None, None, :], 0, 255)
    m = (a.min(-1) >= 238) & ((a.max(-1) - a.min(-1)) < 20)
    a[m] = 255
    return Image.fromarray(a.astype(np.uint8), "RGB")


def ink_bbox(rgb, thr=236):
    """Bounding box of the non-white pixels of an RGB art."""
    a = np.asarray(rgb)
    m = a.min(-1) < thr
    ys, xs = np.nonzero(m)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def multiply_onto(card, art_rgb, x, y):
    """Multiply a white-background RGB art onto the (white) card at (x, y)."""
    x, y = round(x), round(y)
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(card.width, x + art_rgb.width), min(card.height, y + art_rgb.height)
    if x1 <= x0 or y1 <= y0:
        return
    region = np.asarray(card.crop((x0, y0, x1, y1))).astype(np.float32)
    art = np.asarray(art_rgb.crop((x0 - x, y0 - y, x1 - x, y1 - y))).astype(np.float32)
    region[..., :3] = region[..., :3] * art / 255.0
    card.paste(Image.fromarray(region.astype(np.uint8), "RGBA"), (x0, y0))


def recolour(img, mapping):
    """Swap the flat print colours of a cut-out, e.g. {"red": "blue", "blue": "red"}.
    Pixels are classed by hue; each keeps its brightness relative to the source colour."""
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb = a[..., :3]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    hue = np.asarray(img.convert("RGB").convert("HSV"))[..., 0].astype(np.float32) * 360.0 / 255.0
    colourful = sat > 0.3
    classes = {
        "red": colourful & ((hue < 25) | (hue > 335)),
        "yellow": colourful & (hue >= 35) & (hue < 75),
        "blue": colourful & (hue >= 190) & (hue < 260),
    }
    ref = {"red": RED, "yellow": YELLOW, "blue": BLUE}
    out = a.copy()
    for src, m in classes.items():
        dst = mapping.get(src)
        if not dst or not m.any():
            continue
        k = (mx[m] / max(ref[src]))[:, None]
        out[..., :3][m] = np.clip(np.array(ref[dst], np.float32)[None, :] * k, 0, 255)
    return Image.fromarray(out.astype(np.uint8))


_pip_cache = {}

# Widening of the generated pips: the cup came out taller and the baton and sword slimmer
# than their printed counterparts; the flat art takes a mild horizontal stretch well.
PIP_WIDEN = {"tri_cup": 1.4, "tri_baton": 1.45, "tri_sword": 1.6, "tri_coin": 1.0, "tri_hilt": 1.0}


def pip_art(gid, colours=None):
    """Trimmed, whitened, widened cut-out of a pip generation, optionally recoloured."""
    key = (gid, tuple(sorted((colours or {}).items())))
    if key not in _pip_cache:
        im = whiten_rgba(trim(cutout(gid), 24))
        k = PIP_WIDEN.get(gid, 1.0)
        if k != 1.0:
            im = resize(im, (round(im.width * k), im.height))
        if colours:
            im = recolour(im, colours)
        _pip_cache[key] = im
    return _pip_cache[key]


def fit_height(img, h):
    return resize(img, (max(1, round(img.width * h / img.height)), round(h)))


def rotated(img, deg):
    """Rotate counter-clockwise by deg (premultiplied, expand)."""
    return img.convert("RGBa").rotate(deg, resample=Image.BICUBIC, expand=True).convert("RGBA")


# ---- text, frame, mask

def text_ink_centered(d, txt, f, cx, cy, fill, track=0, stroke=0, stroke_fill=None):
    """Draw txt with its ink box centred on (cx, cy); `track` adds px between glyphs."""
    widths = [f.getlength(ch) for ch in txt]
    x = 0.0
    l = t = 1e9
    r = b = -1e9
    for ch, wch in zip(txt, widths):
        bl, bt, br, bb = d.textbbox((x, 0), ch, font=f, anchor="ls")
        l, t, r, b = min(l, bl), min(t, bt), max(r, br), max(b, bb)
        x += wch + track
    ox, oy = cx - (l + r) / 2, cy - (t + b) / 2
    x = ox
    for ch, wch in zip(txt, widths):
        d.text((x, oy), ch, font=f, fill=fill, anchor="ls",
               stroke_width=stroke, stroke_fill=stroke_fill)
        x += wch + track


def index_layer(rank):
    """Top-left numeral plus its 180° copy bottom-right, on a transparent full-card layer."""
    txt = INDEX_TEXT[rank]
    lay = ss_layer()
    d = ImageDraw.Draw(lay)
    two = len(txt) > 1
    cx = INDEX_C[0] + (8 if two else 0)
    text_ink_centered(d, txt, tfont(INDEX_FONT, INDEX_PX * SS), cx * SS, INDEX_C[1] * SS,
                      BLACK + (255,), track=(-2 * SS) if two else 0,
                      stroke=INDEX_HALO * SS, stroke_fill=WHITE + (255,))
    lay = ss_down(lay)
    out = lay.copy()
    out.alpha_composite(lay.rotate(180))
    return out


def frame_layer():
    lay = ss_layer()
    i = FRAME_INSET * SS
    ImageDraw.Draw(lay).rounded_rectangle([i, i, W * SS - i - 1, H * SS - i - 1], radius=FRAME_R * SS,
                                          outline=BLACK + (255,), width=FRAME_W * SS)
    return ss_down(lay)


def rounded_mask_ss(r=24, inset=0.0):
    m = Image.new("L", (W * SS, H * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [inset * SS, inset * SS, (W - inset) * SS - 1, (H - inset) * SS - 1],
        radius=(r - inset) * SS, fill=255)
    return m


def apply_card_mask(img, edge=(0, 0, 0), edge_alpha=0.22):
    """Rounded-rect alpha (r 24) and a faint 2 px edge stroke (the card's cut edge)."""
    img = img.convert("RGBA")
    outer = rounded_mask_ss(24, 0)
    inner = rounded_mask_ss(24, 2)
    ring = np.asarray(outer).astype(np.int16) - np.asarray(inner).astype(np.int16)
    ring = Image.fromarray(np.clip(ring, 0, 255).astype(np.uint8), "L").resize((W, H), Image.LANCZOS)
    mask = outer.resize((W, H), Image.LANCZOS)
    stroke = Image.new("RGBA", (W, H), edge + (0,))
    stroke.putalpha(ring.point(lambda v: int(v * edge_alpha)))
    img.alpha_composite(stroke)
    a = np.minimum(np.asarray(img.getchannel("A")), np.asarray(mask))
    img.putalpha(Image.fromarray(a.astype(np.uint8), "L"))
    return img


def blank_card():
    return Image.new("RGBA", (W, H), WHITE + (255,))


def finish(card, rank):
    card.alpha_composite(frame_layer())
    card.alpha_composite(index_layer(rank))
    return apply_card_mask(card)


def number_diamond(card, cx, cy, w, h, txt, px, upside_down=False):
    """Yellow diamond with a black outline, an inner hairline and the numeral."""
    lay = ss_layer()
    d = ImageDraw.Draw(lay)
    X, Y, w2, h2 = cx * SS, cy * SS, w * SS / 2, h * SS / 2
    d.polygon([(X, Y - h2), (X + w2, Y), (X, Y + h2), (X - w2, Y)], fill=YELLOW + (255,),
              outline=BLACK + (255,), width=3 * SS)
    k = 0.78
    d.polygon([(X, Y - h2 * k), (X + w2 * k, Y), (X, Y + h2 * k), (X - w2 * k, Y)],
              outline=BLACK + (255,), width=round(1.2 * SS))
    tl = ss_layer()
    text_ink_centered(ImageDraw.Draw(tl), txt, tfont(INDEX_FONT, px * SS), X, Y, BLACK + (255,),
                      track=(-2 * SS) if len(txt) > 1 else 0)
    if upside_down:
        tl = tl.rotate(180, center=(X, Y))
    lay.alpha_composite(tl)
    card.alpha_composite(ss_down(lay))


# ---- cups and coins: pips in columns (no overlaps)

CUP_LAYOUT = {
    "2": (270, [(240, 213), (240, 555)]),
    "3": (250, [(240, 205), (150, 563), (330, 563)]),
    "4": (250, [(150, 215), (330, 215), (150, 553), (330, 553)]),
    "5": (190, [(150, 172), (330, 172), (240, 384), (150, 596), (330, 596)]),
    "6": (190, [(150, 172), (330, 172), (150, 384), (330, 384), (150, 596), (330, 596)]),
    "7": (164, [(118, 172), (240, 172), (362, 172), (150, 393), (330, 393), (150, 598), (330, 598)]),
}
COIN_LAYOUT = {   # diameter, centres
    "2": (236, [(240, 222), (240, 546)]),
    "3": (186, [(240, 172), (240, 384), (240, 596)]),
    "4": (150, [(150, 196), (330, 196), (150, 572), (330, 572)]),
    "5": (150, [(150, 182), (330, 182), (240, 384), (150, 586), (330, 586)]),
    "6": (148, [(150, 170), (330, 170), (150, 384), (330, 384), (150, 598), (330, 598)]),
    "7": (136, [(150, 160), (330, 160), (240, 282), (150, 420), (330, 420), (150, 600), (330, 600)]),
}


def cups_card(rank):
    card = blank_card()
    h, pts = CUP_LAYOUT[rank]
    cup = fit_height(pip_art("tri_cup"), h)
    for (x, y) in pts:
        paste_center(card, cup, x, y)
    return card


def coins_card(rank):
    card = blank_card()
    d, pts = COIN_LAYOUT[rank]
    coin = resize(pip_art("tri_coin"), (d, d))
    mirror = coin.transpose(Image.FLIP_LEFT_RIGHT)   # yellow left, blue right
    for i, (x, y) in enumerate(pts):
        paste_center(card, mirror if (i + (y > 384)) % 2 else coin, x, y)
    return card


# ---- clubs: batons crossing in X arrangements, the number in a yellow diamond

BATON = {   # parallel batons per direction, tilt from vertical, spacing, length, width scale, diamond
    1: dict(tilt=24, gap=0, length=610, width=0.95, diamond=(72, 120, 54)),
    2: dict(tilt=24, gap=66, length=600, width=0.8, diamond=(84, 140, 62)),
    3: dict(tilt=24, gap=54, length=590, width=0.66, diamond=(96, 160, 70)),
}
BATON_COLOURS = {"red": None, "blue": {"red": "blue", "blue": "red"},
                 "yellow": {"red": "yellow", "yellow": "red"}}


def baton(colour, length, width_k):
    art = pip_art("tri_baton", BATON_COLOURS[colour])
    art = fit_height(art, length)
    return resize(art, (max(1, round(art.width * width_k)), art.height))


def clubs_card(rank):
    card = blank_card()
    n = {"2": 1, "3": 1, "4": 2, "5": 2, "6": 3, "7": 3}[rank]
    cfg = BATON[n]
    offs = [(i - (n - 1) / 2) * cfg["gap"] for i in range(n)]
    back = ["red", "blue", "red"]     # "\" batons (cap top-left)
    fwd = ["blue", "red", "blue"]     # "/" batons (cap top-right)
    for i, o in enumerate(offs):
        paste_center(card, rotated(baton(back[i], cfg["length"], cfg["width"]), cfg["tilt"]), 240 + o, 384)
    for i, o in enumerate(reversed(offs)):
        paste_center(card, rotated(baton(fwd[i], cfg["length"], cfg["width"]), -cfg["tilt"]), 240 + o, 384)
    if rank in ("3", "5", "7"):
        paste_center(card, baton("yellow", cfg["length"] + 20, cfg["width"]), 240, 384)
    w, h, px = cfg["diamond"]
    number_diamond(card, 240, 384, w, h, rank, px)
    return card


# ---- swords: curved blades drawn in code as interlaced ovals, generated hilts, a straight
# sword through the middle on odd numbers, the number in diamonds at both crossings

SWORD = {   # blades per side: band width, horizontal reach of each oval, hilt size, run past the crossings, diamond
    1: dict(w=54, reach=[240], hilt=156, ext=(104, 118), diamond=(64, 92, 46)),
    2: dict(w=40, reach=[246, 150], hilt=122, ext=(90, 112), diamond=(76, 108, 56)),
    3: dict(w=31, reach=[250, 178, 106], hilt=102, ext=(76, 106), diamond=(84, 118, 60)),
}
SWORD_T, SWORD_B = 160, 608      # top and bottom crossing (centre line)
SWORD_BULGE = 150                # vertical pull of the Bezier handles (pointed oval ends)
SWORD_STRAIGHT = 620             # length of the straight sword on 3, 5, 7
SWORD_GUARD = 0.218              # its guard, as a fraction of its length from the pommel
HILT_KEEP = 0.78                 # part of the hilt generation kept (pommel and leaves)


def _bezier(p0, p1, p2, p3, n):
    t = np.linspace(0.0, 1.0, n)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def blade_path(reach, ext):
    """Centre line of one 'left' blade (hilt top-right, sweeps round the left, tip bottom-right),
    resampled every 1 px. Returns points, arc length, and the arc length at both crossings."""
    p0, p1 = np.array([240.0, SWORD_T]), np.array([240.0 - reach, SWORD_T + SWORD_BULGE])
    p2, p3 = np.array([240.0 - reach, SWORD_B - SWORD_BULGE]), np.array([240.0, SWORD_B])
    d0 = (p0 - p1) / np.linalg.norm(p0 - p1)
    d1 = (p3 - p2) / np.linalg.norm(p3 - p2)
    hilt = p0 + d0 * ext[0]      # straight run past the top crossing to the hilt
    tip = p3 + d1 * ext[1]       # and past the bottom crossing to the tip
    pts = np.concatenate([np.linspace(hilt, p0, 60, endpoint=False), _bezier(p0, p1, p2, p3, 600),
                          np.linspace(p3, tip, 61)[1:]])
    seg = np.sqrt((np.diff(pts, axis=0) ** 2).sum(-1))
    s = np.concatenate([[0.0], np.cumsum(seg)])
    total = s[-1]
    u = np.arange(0.0, total, 1.0)
    pts = np.stack([np.interp(u, s, pts[:, 0]), np.interp(u, s, pts[:, 1])], -1)
    sT = ext[0]
    sB = len(u) - ext[1]
    return pts, sT, sB, d0


def _normals(pts):
    t = np.gradient(pts, axis=0)
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-6)
    return t, np.stack([-t[:, 1], t[:, 0]], -1)


def draw_blade(lay, pts, sT, sB, w, col_a, col_b):
    """One curved blade on a supersampled layer: colour A from the hilt round the first bend,
    yellow with black diamonds along the side, colour B into the far crossing, then yellow with
    diamonds to the square-cut tip with a red and blue end stripe."""
    d = ImageDraw.Draw(lay)
    tan, nrm = _normals(pts)
    L = pts + nrm * w / 2
    R = pts - nrm * w / 2
    n = len(pts)
    c_len = sB - sT
    a_end = int(sT + 0.24 * c_len)
    y_end = int(sT + 0.76 * c_len)
    segs = [(0, a_end, col_a, False), (a_end, y_end, YELLOW, True), (y_end, int(sB), col_b, False),
            (int(sB), n - 15, YELLOW, True), (n - 15, n - 8, RED, False), (n - 8, n, BLUE, False)]

    def poly(i0, i1):
        i1 = min(i1, n - 1)
        return [tuple(p * SS) for p in L[i0:i1 + 1]] + [tuple(p * SS) for p in R[i0:i1 + 1][::-1]]

    for i0, i1, col, diamonds in segs:
        d.polygon(poly(i0, i1), fill=col + (255,))
        if diamonds:
            # small black diamonds along the centre line, clear of the crossings and the segment ends
            for s in np.arange(i0 + 26, i1 - 18, 44):
                if abs(s - sT) < 40 or abs(s - sB) < 40:
                    continue
                k = int(s)
                c, tv, nv = pts[k], tan[k], nrm[k]
                a, b = 0.38 * w, 0.17 * w
                q = [c + tv * a, c + nv * b, c - tv * a, c - nv * b]
                d.polygon([tuple(p * SS) for p in q], fill=BLACK + (255,))
    # white separators with black hairlines between the coloured segments
    for i in (a_end, y_end, int(sB)):
        for off, col, wd in ((0, WHITE, 6), (-3, BLACK, 1.6), (3, BLACK, 1.6)):
            k = max(0, min(n - 1, i + off))
            d.line([tuple(L[k] * SS), tuple(R[k] * SS)], fill=col + (255,), width=round(wd * SS))
    # outlines: both edges and the square tip
    d.line([tuple(p * SS) for p in L], fill=BLACK + (255,), width=3 * SS, joint="curve")
    d.line([tuple(p * SS) for p in R], fill=BLACK + (255,), width=3 * SS, joint="curve")
    for k in (n - 15, n - 8, n - 1):
        d.line([tuple(L[k] * SS), tuple(R[k] * SS)], fill=BLACK + (255,), width=round(2.5 * SS))


def place_hilt(card, end, direction, size, leaves):
    """Hilt cut-out at a blade end; its pommel points along `direction` (away from the blade)."""
    art = pip_art("tri_hilt", None if leaves == "blue" else {"blue": "red", "red": "blue"})
    # drop the generated blade stub (bottom 22%): the drawn band runs into the leaves instead
    art = trim(art.crop((0, 0, art.width, round(art.height * HILT_KEEP))), 24)
    art = fit_height(art, size * HILT_KEEP)
    ang = math.degrees(math.atan2(direction[0], -direction[1]))   # clockwise from up
    rot = rotated(art, -ang)
    c = np.array(end) + np.array(direction) * art.height * 0.36
    paste_center(card, rot, c[0], c[1])


def swords_card(rank):
    card = blank_card()
    n = {"2": 1, "3": 1, "4": 2, "5": 2, "6": 3, "7": 3}[rank]
    cfg = SWORD[n]
    blades = []
    for k, reach in enumerate(cfg["reach"]):
        pts, sT, sB, d0 = blade_path(reach, cfg["ext"])
        a, b = (BLUE, RED) if k % 2 == 0 else (RED, BLUE)
        blades.append((pts, sT, sB, d0, a, b))
    lay = ss_layer()
    rot_pts = lambda p: np.stack([480.0 - p[:, 0], 768.0 - p[:, 1]], -1)   # 180° about the centre
    # left blades, then the right blades (the same blades turned 180°, colours swapped)
    for pts, sT, sB, d0, a, b in blades:
        draw_blade(lay, pts, sT, sB, cfg["w"], a, b)
    for pts, sT, sB, d0, a, b in blades:
        draw_blade(lay, rot_pts(pts), sT, sB, cfg["w"], b, a)
    card.alpha_composite(ss_down(lay))
    for k, (pts, sT, sB, d0, a, b) in enumerate(blades):
        leaves = "blue" if a == BLUE else "red"
        place_hilt(card, pts[0], d0, cfg["hilt"], leaves)
        place_hilt(card, (480.0 - pts[0][0], 768.0 - pts[0][1]), -d0, cfg["hilt"],
                   "red" if leaves == "blue" else "blue")
    w, h, px = cfg["diamond"]
    if rank in ("3", "5", "7"):
        # straight sword through the middle, point down, its guard over the top crossing
        sw = fit_height(pip_art("tri_sword"), SWORD_STRAIGHT)
        paste_center(card, sw, 240, SWORD_T - SWORD_GUARD * SWORD_STRAIGHT + SWORD_STRAIGHT / 2)
        number_diamond(card, 240, SWORD_B, w, h, rank, px, upside_down=True)
    else:
        number_diamond(card, 240, SWORD_T, w, h, rank, px)
        number_diamond(card, 240, SWORD_B, w, h, rank, px, upside_down=True)
    return card


# ---- aces: one large generated emblem on white

ACE_BOX = (404, 642)       # fit box inside the frame, centred at ACE_CENTRE
ACE_CENTRE = (240, 398)


def ace_card(suit):
    card = blank_card()
    art = white_art(f"tri_ace_{suit}")
    art = art.crop(ink_bbox(art))
    art = fit_box(art, *ACE_BOX)
    x = ACE_CENTRE[0] - art.width / 2
    if suit == "bate":
        # the hand comes in from the right: its cuff runs into the frame line
        x = INNER[2] - art.width + 2
    multiply_onto(card, art, x, ACE_CENTRE[1] - art.height / 2)
    return card


# ---- courts: double-ended, generated half figure + its 180° copy, name banner across the middle

def court_half(gid):
    """The generated half figure scaled and cropped to the top half of the art area (RGB)."""
    art = white_art(gid)
    x0, y0, x1, y1 = ink_bbox(art)
    hw = INNER[2] - INNER[0]                  # 434
    hh = BANNER[0] - INNER[1]                 # 339
    # keep what matters (head, raised symbol, horse head: the upper 60% of the figure) and fit
    # the width; when the figure is wider than the 1.28 half-card, trim the robe at the sides
    top = art.crop((0, y0, art.width, y0 + int((y1 - y0) * 0.6)))
    kx0, _, kx1, _ = ink_bbox(top)
    k = hh / (y1 - y0 + 8)
    need_w = hw / k
    cx = (kx0 + kx1) / 2
    if need_w < (x1 - x0):
        half = need_w / 2
        cx = min(max(cx, kx1 - half + 6), kx0 + half - 6) if kx1 - kx0 < need_w else (kx0 + kx1) / 2
        cx = min(max(cx, half), art.width - half)
        crop = (cx - half, y0 - 8, cx + half, y1)
    else:
        k = hw / (x1 - x0)
        hgt = hh / k
        crop = ((x0 + x1) / 2 - (x1 - x0) / 2, y1 - hgt, (x0 + x1) / 2 + (x1 - x0) / 2, y1)
    img = Image.new("RGB", (round(crop[2] - crop[0]), round(crop[3] - crop[1])), WHITE)
    img.paste(art.crop(tuple(round(v) for v in crop)), (0, 0))
    return resize(img, (hw, hh))


def court_card(suit, rank):
    card = blank_card()
    half = court_half(f"tri_court_{suit}_{rank}")
    multiply_onto(card, half, INNER[0], INNER[1])
    multiply_onto(card, half.rotate(180), INNER[2] - half.width, BANNER[1])
    lay = ss_layer()
    d = ImageDraw.Draw(lay)
    d.rectangle([FRAME_INSET * SS, BANNER[0] * SS, (W - FRAME_INSET) * SS, BANNER[1] * SS], fill=WHITE + (255,))
    for y in BANNER:
        d.line([(FRAME_INSET * SS, y * SS), ((W - FRAME_INSET) * SS, y * SS)], fill=BLACK + (255,), width=2 * SS)
    txt = f"{LABEL_RANK[rank]} DI {LABEL_SUIT[suit]}"
    text_ink_centered(d, txt, tfont(LABEL_FONT, LABEL_PX * SS), 240 * SS, (sum(BANNER) / 2) * SS,
                      BLACK + (255,), track=round(0.6 * SS), stroke=round(0.35 * SS), stroke_fill=BLACK + (255,))
    card.alpha_composite(ss_down(lay))
    return card


def build_face(suit, rank):
    if rank == "a":
        card = ace_card(suit)
    elif rank in LABEL_RANK:
        card = court_card(suit, rank)
    else:
        card = {"kupe": cups_card, "dinari": coins_card, "bate": clubs_card, "spade": swords_card}[suit](rank)
    return finish(card, rank)


FACE_GENS = ["tri_cup", "tri_coin", "tri_baton", "tri_hilt", "tri_sword"] + \
    [f"tri_ace_{s}" for s in SUITS] + [f"tri_court_{s}_{r}" for s in SUITS for r in ("f", "c", "k")]


def step_cards():
    missing = [g for g in FACE_GENS if not have(g)]
    if missing:
        print("  missing generations, no faces built:", missing)
        return
    for s in SUITS:
        for r in RANKS:
            save_png(build_face(s, r), OUT / "cards" / f"{s}_{r}.png")
    print("  card faces done")


# ---- suit icons (UI and placeholders): the pips themselves

def step_suits():
    icons = {
        "kupe": pip_art("tri_cup"),
        "dinari": pip_art("tri_coin"),
        "bate": rotated(pip_art("tri_baton"), -38),
        "spade": rotated(pip_art("tri_sword").rotate(180), -38),   # point up, leaning right
    }
    for s, ic in icons.items():
        ic = pad_square(trim(ic, 16), 0.04)
        save_png(resize(ic, (256, 256)), OUT / "cards" / "suits" / f"{s}.png")
    print("  suits done")


# ---- backs: fine diamond lattice in a white border (drawn in code)

BACK_COLOURS = {"player": ((196, 34, 40), (150, 18, 26)), "bot": ((28, 112, 140), (14, 76, 100))}


def build_back(owner):
    main, dark = BACK_COLOURS[owner]
    lay = Image.new("RGBA", (W * SS, H * SS), WHITE + (255,))
    d = ImageDraw.Draw(lay)
    x0, y0, x1, y1 = 26, 26, W - 26, H - 26
    field = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(field)
    fd.rectangle([0, 0, W * SS, H * SS], fill=main + (255,))
    cw, ch = 30, 40                     # diamond cell, centred on the card so the pattern is symmetric
    nx, ny = int(W / cw) + 3, int(H / ch) + 3
    for j in range(-ny, ny + 1):
        for i in range(-nx, nx + 1):
            cx = W / 2 + i * cw + (cw / 2 if j % 2 else 0)
            cy = H / 2 + j * ch / 2
            q = [(cx, cy - ch * 0.42), (cx + cw * 0.42, cy), (cx, cy + ch * 0.42), (cx - cw * 0.42, cy)]
            fd.polygon([(x * SS, y * SS) for x, y in q], fill=(dark if (i + j) % 2 else main) + (255,),
                       outline=WHITE + (255,), width=round(1.6 * SS))
            r = 2.2 * SS
            fd.ellipse([cx * SS - r, cy * SS - r, cx * SS + r, cy * SS + r], fill=WHITE + (255,))
    m = Image.new("L", lay.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], radius=10 * SS, fill=255)
    lay.paste(field, (0, 0), m)
    d.rounded_rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], radius=10 * SS, outline=dark + (255,), width=3 * SS)
    d.rounded_rectangle([14 * SS, 14 * SS, (W - 14) * SS, (H - 14) * SS], radius=16 * SS,
                        outline=main + (255,), width=2 * SS)
    return apply_card_mask(ss_down(lay))


def step_backs():
    for owner in ("player", "bot"):
        save_png(build_back(owner), OUT / "cards" / f"back_{owner}.png")
    print("  backs done")


# --------------------------------------------------------------------------- badges

BADGES = {
    "ukrasi_sheet_a": ["pozlaceno", "srebreno", "nabruseno", "ljuto", "usoljeno"],
    "ukrasi_sheet_b": ["pijano", "divlje", "glasno", "ponocno", "ribarsko"],
}


EXTRA_BADGES = ["prevrtljivo"]


def components(alpha, thr=32, step=2):  # noqa: C901
    """Connected components of alpha>thr on a grid subsampled by `step`.
    Returns a list of (area_fullres, x0, y0, x1, y1)."""
    m = alpha[::step, ::step] > thr
    h, w = m.shape
    seen = np.zeros_like(m, dtype=bool)
    out = []
    for y in range(h):
        row = m[y]
        if not row.any():
            continue
        for x in np.nonzero(row & ~seen[y])[0]:
            if seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            n, x0, y0, x1, y1 = 0, x, y, x, y
            while q:
                cy, cx = q.popleft()
                n += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            out.append((n * step * step, x0 * step, y0 * step, (x1 + 1) * step, (y1 + 1) * step))
    return out


def cut_sheet(gid):
    """Blobs with alpha > 32 (section 13.4). When neighbouring seals touch through
    faint edge alpha, the threshold is raised step by step until they separate."""
    img = cutout(gid)
    a = np.asarray(img.getchannel("A"))
    area = img.width * img.height
    for thr in (32, 96, 160, 224):
        blobs = [b for b in components(a, thr) if b[0] >= 0.02 * area]
        if len(blobs) == 5:
            break
    if len(blobs) < 5 and blobs:
        # two seals painted touching each other: split a double-width blob at the
        # thinnest column of its middle part
        med_w = float(np.median([b[3] - b[1] for b in blobs]))
        out = []
        for b in blobs:
            n, x0, y0, x1, y1 = b
            if (x1 - x0) > 1.6 * med_w:
                cols = (a[y0:y1, x0:x1] > thr).sum(0)
                lo, hi = int((x1 - x0) * 0.3), int((x1 - x0) * 0.7)
                xs = x0 + lo + int(np.argmin(cols[lo:hi]))
                out += [(n // 2, x0, y0, xs, y1), (n // 2, xs, y0, x1, y1)]
            else:
                out.append(b)
        blobs = out
    blobs.sort(key=lambda b: b[1])
    return img, blobs, thr


def badge_from_box(img, box, blobs, thr):
    """Crop one blob (bbox + 6% margin), blanking anything belonging to its
    neighbours, pad to square and resize to 256."""
    _, x0, y0, x1, y1 = box
    a = np.asarray(img.getchannel("A")).copy()
    # Voronoi split between neighbouring seals: blank every pixel closer to a
    # neighbour's centre than to this seal's centre
    cx = (x0 + x1) / 2
    for ob in blobs:
        if ob is box:
            continue
        ocx = (ob[1] + ob[3]) / 2
        mid = int(round((cx + ocx) / 2))
        if ocx > cx:
            a[:, mid:] = 0
        else:
            a[:, :mid] = 0
    im = img.copy()
    im.putalpha(Image.fromarray(a))
    pad = 8
    sub = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))
    sub = keep_main_component(sub, 32)
    sub = trim(sub, 32)
    sq = pad_square(sub, 0.06)
    return resize(sq, (256, 256))


def keep_main_component(img, thr=32, step=2):
    """Zero the alpha of everything except the blob containing the image centre
    (removes slivers of neighbouring seals)."""
    a = np.asarray(img.getchannel("A"))
    m = a[::step, ::step] > thr
    h, w = m.shape
    seen = np.zeros_like(m)
    cy, cx = h // 2, w // 2
    if not m[cy, cx]:
        ys, xs = np.nonzero(m)
        i = np.argmin((ys - cy) ** 2 + (xs - cx) ** 2)
        cy, cx = ys[i], xs[i]
    q = deque([(cy, cx)])
    seen[cy, cx] = True
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    keep = Image.fromarray((seen * 255).astype(np.uint8)).resize(img.size, Image.NEAREST)
    keep = keep.filter(ImageFilter.MaxFilter(2 * step + 3))
    out = img.copy()
    out.putalpha(Image.fromarray(np.minimum(a, np.asarray(keep))))
    return out


def step_badges():
    for gid, names in BADGES.items():
        if not have(gid):
            print("  missing", gid)
            continue
        img, blobs, thr = cut_sheet(gid)
        print(f"  {gid}: {len(blobs)} blobs at alpha>{thr}", [b[0] for b in blobs])
        if len(blobs) != 5:
            print("  !! expected 5 blobs; badges from this sheet NOT written")
            continue
        for name, b in zip(names, blobs):
            save_png(badge_from_box(img, b, blobs, thr), OUT / "ukrasi" / f"{name}.png")
    # single-badge overrun generations (badge_<name>), if any exist, override; Revision 2's
    # prevrtljivo has no sheet and comes only from its single generation
    for names in list(BADGES.values()) + [EXTRA_BADGES]:
        for name in names:
            gid = f"badge_{name}"
            if have(gid):
                ic = pad_square(trim(cutout(gid), 32), 0.06)
                save_png(resize(ic, (256, 256)), OUT / "ukrasi" / f"{name}.png")
                print("  badge override from", gid)
    print("  badges done")


# --------------------------------------------------------------------------- fore, portraits, env

FORE = ["pogled", "zamjena", "namjesteno", "krivi_racun", "ti_otvaraj", "tucem", "napij_ga",
        "vrati", "trica_iz_rukava", "duplo_ili_nista", "briskula"]
FORE_INSET = 0.04
PORTRAITS = ["tonci", "jure", "luka", "bepo",     # section 13.2 rows 31-34
             "dino", "stipe", "ive", "frane"]   # section 18.4.5 (Partneri)
PORTRAIT_INSET = 0.03
PORTRAIT_TOP_BIAS = 0.0  # square crop anchored at the top: keeps hats and hair inside the circle mask
TABLE_SATURATION = 0.88  # the table texture is lit by warm scene lights; tone it down a bit
ENV = {"env_table": "table_wood.jpg", "env_bg_konoba": "bg_konoba.jpg",
       "env_bg_map": "bg_map.jpg", "env_bg_shop": "bg_shop.jpg"}


def step_fore():
    for f in FORE:
        gid = f"fora_{f}"
        if have(gid):
            im = raw(gid).convert("RGB")
            # most vignettes were painted with their own thin card border and
            # rounded corners; trim it so every fora art is full-bleed
            m = round(min(im.size) * FORE_INSET)
            im = im.crop((m, m, im.width - m, im.height - m))
            save_png(crop_to_card(im), OUT / "fore" / f"{f}.png")
    print("  fore done")


def step_portraits():
    for p in PORTRAITS:
        gid = f"portrait_{p}"
        if have(gid):
            im = raw(gid).convert("RGB")
            # some generations carry their own thin frame / rounded corners at
            # the very edge: trim 3% before the centred square crop
            m = round(min(im.size) * PORTRAIT_INSET)
            im = im.crop((m, m, im.width - m, im.height - m))
            s = min(im.size)
            # square crop: centred horizontally, biased to the top (keep the head)
            x0 = (im.width - s) // 2
            y0 = round((im.height - s) * PORTRAIT_TOP_BIAS)
            im = im.crop((x0, y0, x0 + s, y0 + s))
            save_png(resize(im, (512, 512)), OUT / "portraits" / f"{p}.png")
    print("  portraits done")


def step_env():
    for gid, name in ENV.items():
        if have(gid):
            im = raw(gid).convert("RGB")
            if gid == "env_table":
                hsv = np.asarray(im.convert("HSV")).astype(np.float32)
                hsv[..., 1] *= TABLE_SATURATION
                im = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
            if im.size != (1536, 1024):
                k = max(1536 / im.width, 1024 / im.height)
                im = resize(im, (round(im.width * k), round(im.height * k)))
                x0, y0 = (im.width - 1536) // 2, (im.height - 1024) // 2
                im = im.crop((x0, y0, x0 + 1536, y0 + 1024))
            p = OUT / "env" / name
            p.parent.mkdir(parents=True, exist_ok=True)
            im.save(p, "JPEG", quality=88, optimize=True, progressive=True, subsampling="4:2:0")
    print("  env done")


# --------------------------------------------------------------------------- ui

def step_ui():
    if have("ui_coin"):
        save_png(resize(pad_square(trim(cutout("ui_coin"), 24), 0.03), (256, 256)), OUT / "ui" / "coin.png")
    if have("ui_rakija"):
        full = resize(pad_square(trim(cutout("ui_rakija"), 24), 0.03), (256, 256))
        save_png(full, OUT / "ui" / "rakija_full.png")
        hsv = np.asarray(full.convert("RGB").convert("HSV")).astype(np.float32)
        hsv[..., 1] *= 0.15
        empty = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB").convert("RGBA")
        empty.putalpha(full.getchannel("A").point(lambda v: int(v * 0.45)))
        save_png(empty, OUT / "ui" / "rakija_empty.png")
    if have("shop_falsa"):
        # the Falsa karta shop offer: card-shaped art like the fore
        im = raw("shop_falsa").convert("RGB")
        m = round(min(im.size) * FORE_INSET)
        save_png(crop_to_card(im.crop((m, m, im.width - m, im.height - m))), OUT / "ui" / "falsa.png")
    if have("logo"):
        lg = trim(cutout("logo"), 24)
        lg = fit_box(lg, 1200 * 0.96, 800 * 0.96)
        c = Image.new("RGBA", (1200, 800), (0, 0, 0, 0))
        paste_center(c, lg, 600, 400)
        save_png(c, OUT / "ui" / "logo.png")
    print("  ui done")


# --------------------------------------------------------------------------- contact sheets

def checker(w, h, s=16):
    c = Image.new("RGBA", (w, h), (205, 196, 180, 255))
    d = ImageDraw.Draw(c)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if (x // s + y // s) % 2:
                d.rectangle([x, y, x + s - 1, y + s - 1], fill=(170, 160, 145, 255))
    return c


def label(img, text, xy, size=18, fill=(243, 230, 200, 255)):
    ImageDraw.Draw(img).text(xy, text, font=font(size), fill=fill)


def circle_crop(im, size, ring=0):
    """Portrait as the UI shows it: circular mask (and an optional ochre ring)."""
    sm = resize(im.convert("RGBA"), (size, size))
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    sm.putalpha(m.resize((size, size), Image.LANCZOS))
    if ring:
        lay = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
        ImageDraw.Draw(lay).ellipse([ring * 2, ring * 2, size * 4 - 1 - ring * 2, size * 4 - 1 - ring * 2],
                                    outline=OCHRE + (255,), width=ring * 4)
        sm.alpha_composite(lay.resize((size, size), Image.LANCZOS))
    return sm


def step_contact_portraits():
    """All 8 portraits side by side: square, HUD circle (150 + 4 px ochre ring),
    pick-screen size (200) and map-node size (64), to check they read as one family."""
    bgc = (42, 26, 16, 255)
    tw, g = 240, 16
    sheet = Image.new("RGBA", (g + len(PORTRAITS) * (tw + g), 640), bgc)
    label(sheet, "portraits: 512 (shown 240) / HUD circle 150 with ochre ring / map node 64", (g, 8), 20)
    for i, p in enumerate(PORTRAITS):
        f = OUT / "portraits" / f"{p}.png"
        x = g + i * (tw + g)
        if not f.exists():
            ImageDraw.Draw(sheet).rectangle([x, 40, x + tw, 40 + tw], outline=(200, 60, 60, 255), width=3)
            label(sheet, f"{p} MISSING", (x + 4, 44), 16)
            continue
        im = Image.open(f).convert("RGBA")
        sheet.alpha_composite(resize(im, (tw, tw)), (x, 40))
        label(sheet, p, (x + 2, 40 + tw + 4), 18)
        sheet.alpha_composite(circle_crop(im, 150, ring=4), (x + (tw - 150) // 2, 320))
        sheet.alpha_composite(circle_crop(im, 64, ring=2), (x + (tw - 64) // 2, 500))
    out = SRC / "contact_portraits.png"
    sheet.convert("RGB").save(out, optimize=True)
    print("  portrait contact sheet written")


MASTERS = SRC / "masters"
BADGE = (22, 92, 80)   # ukras badge x, y, size on a face (FACE.badge in src/render/placeholders.ts)


def asset_path(p):
    """A built image: the fresh PNG in public/assets, else its WebP, else the master PNG
    (tools/optimize_assets.py moves the PNGs to assets_src/masters)."""
    p = Path(p)
    for c in (p, p.with_suffix(".webp"), MASTERS / p.relative_to(OUT)):
        if c.exists():
            return c
    return None


def ex(p):
    return asset_path(p) is not None


def opn(p):
    return Image.open(asset_path(p))


def step_contact():
    bgc = (42, 26, 16, 255)
    tw, th, g = 192, 307, 14
    small_w, small_h = 96, 154
    names = [(s, r) for s in SUITS for r in RANKS]
    cols = 10
    sheet_w = g + cols * (tw + g)
    rows_h = 4 * (th + g + 22)
    small_row = small_h + 2 * g + 26
    back_row = th + g + 26
    sheet = Image.new("RGBA", (sheet_w, g + rows_h + back_row + small_row + 40), bgc)
    y = g
    for si, s in enumerate(SUITS):
        for ri, r in enumerate(RANKS):
            p = OUT / "cards" / f"{s}_{r}.png"
            x = g + ri * (tw + g)
            if ex(p):
                sheet.alpha_composite(resize(opn(p).convert("RGBA"), (tw, th)), (x, y))
            else:
                ImageDraw.Draw(sheet).rectangle([x, y, x + tw, y + th], outline=(200, 60, 60, 255), width=3)
            label(sheet, f"{s}_{r}", (x + 4, y + th + 2), 16)
        y += th + g + 22
    for i, b in enumerate(["back_player", "back_bot"]):
        p = OUT / "cards" / f"{b}.png"
        x = g + i * (tw + g)
        if ex(p):
            sheet.alpha_composite(resize(opn(p).convert("RGBA"), (tw, th)), (x, y))
        label(sheet, b, (x + 4, y + th + 2), 16)
    # the 4 suit icons beside the backs
    for i, s in enumerate(SUITS):
        p = OUT / "cards" / "suits" / f"{s}.png"
        x = g + (3 + i) * (tw + g)
        if ex(p):
            ic = resize(opn(p).convert("RGBA"), (tw, tw))
            sheet.alpha_composite(checker(tw, tw), (x, y))
            sheet.alpha_composite(ic, (x, y))
        label(sheet, f"suits/{s}", (x + 4, y + tw + 2), 16)
    y += back_row
    label(sheet, "deck-grid size 96x154 (readability check):", (g, y), 18)
    y += 26
    x = g
    for (s, r) in [("kupe", "a"), ("bate", "a"), ("spade", "a"), ("dinari", "a"),
                   ("kupe", "3"), ("kupe", "k"), ("bate", "c"), ("spade", "7"), ("spade", "f"),
                   ("dinari", "6"), ("dinari", "k"), ("dinari", "4"), ("bate", "5"), ("spade", "2"),
                   ("kupe", "c"), ("bate", "k"), ("spade", "a"), ("dinari", "f"), ("kupe", "4"), ("bate", "6"),
                   ("spade", "k"), ("dinari", "c"), ("kupe", "f"), ("dinari", "a"), ("spade", "c")]:
        p = OUT / "cards" / f"{s}_{r}.png"
        if x + small_w > sheet_w - 420:   # leave room for the fan check
            break
        if ex(p):
            sheet.alpha_composite(resize(opn(p).convert("RGBA"), (small_w, small_h)), (x, y))
        x += small_w + 8
    # fanned-hand check: overlapping 96x154 cards, only the left strip of each shows
    # fanned-hand check: overlapping 96x154 cards; in the game the next card covers the right
    # ~45%, so the corner numeral and the ukras badge (left side) must stay visible
    fan = [("kupe", "a", "pozlaceno"), ("kupe", "3", None), ("bate", "k", "ljuto"), ("spade", "2", None),
           ("spade", "7", "ponocno"), ("dinari", "c", "divlje")]
    fx = x + 24
    label(sheet, "fan (with badges):", (fx, y - 26), 18)
    step = round(small_w * 0.55)
    for i, (s, r, b) in enumerate(fan):
        p = OUT / "cards" / f"{s}_{r}.png"
        if ex(p) and fx + i * step + small_w < sheet_w:
            card = opn(p).convert("RGBA")
            bp = OUT / "ukrasi" / f"{b}.png" if b else None
            if bp and ex(bp):
                card.alpha_composite(resize(opn(bp).convert("RGBA"), (BADGE[2], BADGE[2])), BADGE[:2])
            sheet.alpha_composite(resize(card, (small_w, small_h)), (fx + i * step, y))
    out = SRC / "contact_cards.png"
    sheet.convert("RGB").save(out, optimize=True)
    (SRC / "preview").mkdir(exist_ok=True)
    shutil.copy(out, SRC / "preview" / "cards_contact_sheet.png")

    # misc sheet: portraits, fore, badges, ui, env
    mw = 2000
    misc = Image.new("RGBA", (mw, 2600), bgc)
    y = g
    label(misc, "portraits (512, shown 200 + circle mask preview 100); see contact_portraits.png", (g, y), 20)
    y += 30
    x = g
    for p in PORTRAITS:
        f = OUT / "portraits" / f"{p}.png"
        if f.exists():
            im = resize(Image.open(f).convert("RGBA"), (200, 200))
            misc.alpha_composite(im, (x, y))
            misc.alpha_composite(circle_crop(im, 100), (x + 50, y + 205))
            label(misc, p, (x, y + 308), 16)
        x += 245
    y += 340
    label(misc, "fore (480x768, shown 180x288; HUD slot 104x166 beside)", (g, y), 20)
    y += 30
    x = g
    for f in FORE:
        p = OUT / "fore" / f"{f}.png"
        if ex(p):
            misc.alpha_composite(resize(opn(p).convert("RGBA"), (180, 288)), (x, y))
        label(misc, f, (x, y + 290), 14)
        x += 196
    y += 320
    x = g
    for f in FORE:
        p = OUT / "fore" / f"{f}.png"
        if ex(p):
            misc.alpha_composite(resize(opn(p).convert("RGBA"), (104, 166)), (x, y))
        x += 120
    y += 190
    label(misc, "ukrasi badges (256 on checker; and 80 on a card, under the corner numeral)", (g, y), 20)
    y += 30
    x = g
    allb = BADGES["ukrasi_sheet_a"] + BADGES["ukrasi_sheet_b"]
    for b in allb:
        p = OUT / "ukrasi" / f"{b}.png"
        misc.alpha_composite(checker(180, 180), (x, y))
        if ex(p):
            misc.alpha_composite(resize(opn(p).convert("RGBA"), (180, 180)), (x, y))
        label(misc, b, (x, y + 182), 14)
        x += 196
    y += 215
    # badge on a card at in-game size/position
    x = g
    for i, b in enumerate(allb):
        cp = OUT / "cards" / f"{SUITS[i % 4]}_{RANKS[i % 10]}.png"
        p = OUT / "ukrasi" / f"{b}.png"
        if ex(cp):
            card = opn(cp).convert("RGBA")
            if ex(p):
                card.alpha_composite(resize(opn(p).convert("RGBA"), (BADGE[2], BADGE[2])), BADGE[:2])
            misc.alpha_composite(resize(card, (180, 288)), (x, y))
        x += 196
    y += 310
    label(misc, "ui: coin, rakija_full, rakija_empty (256 on checker, plus HUD size 44x60 / 40)", (g, y), 20)
    y += 30
    x = g
    for u in ["coin", "rakija_full", "rakija_empty"]:
        p = OUT / "ui" / f"{u}.png"
        misc.alpha_composite(checker(256, 256), (x, y))
        if ex(p):
            im = opn(p).convert("RGBA")
            misc.alpha_composite(im, (x, y))
            misc.alpha_composite(fit_box(im, 44, 60) if "rakija" in u else resize(im, (40, 40)), (x + 266, y + 100))
        x += 340
    lp = OUT / "ui" / "logo.png"
    if lp.exists():
        misc.alpha_composite(resize(Image.open(lp).convert("RGBA"), (600, 400)), (x, y - 40))
    y += 380
    label(misc, "env (shown 480x320)", (g, y), 20)
    y += 30
    x = g
    for gid, name in ENV.items():
        p = OUT / "env" / name
        if ex(p):
            misc.alpha_composite(resize(opn(p).convert("RGBA"), (480, 320)), (x, y))
        label(misc, name, (x, y + 322), 14)
        x += 490
    y += 360
    misc = misc.crop((0, 0, mw, y))
    misc.convert("RGB").save(SRC / "contact_misc.png", optimize=True)
    step_contact_portraits()
    print("  contact sheets written")


# --------------------------------------------------------------------------- optimise

def step_optimize():
    """Lossy palette quantisation (pngquant) for the large PNGs; keeps paths/formats."""
    pq = shutil.which("pngquant")
    if not pq:
        print("  pngquant not found; skipping")
        return
    groups = [OUT / "cards", OUT / "fore", OUT / "portraits", OUT / "ukrasi", OUT / "ui", OUT / "cards" / "suits"]
    before = after = 0
    for g in groups:
        for p in sorted(g.glob("*.png")):
            b = p.stat().st_size
            subprocess.run([pq, "--force", "--skip-if-larger", "--strip", "--speed", "1",
                            "--quality", "80-98", "--output", str(p), str(p)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            before += b
            after += p.stat().st_size
    print(f"  pngquant: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB")


STEPS = {
    "suits": step_suits, "cards": step_cards, "backs": step_backs, "badges": step_badges,
    "fore": step_fore, "portraits": step_portraits, "env": step_env, "ui": step_ui,
    "contact": step_contact, "optimize": step_optimize,
}

if __name__ == "__main__":
    args = sys.argv[1:] or ["all"]
    if args == ["all"]:
        args = ["suits", "cards", "backs", "badges", "fore", "portraits", "env", "ui", "optimize", "contact"]
    for a in args:
        if a == "cutouts":
            for gid in ["tri_cup", "tri_coin", "tri_baton", "tri_hilt", "tri_sword", "ukrasi_sheet_a",
                        "ukrasi_sheet_b", "ui_coin", "ui_rakija", "logo"]:
                if have(gid):
                    cutout(gid, force=True)
            print("  cutouts refreshed")
            continue
        print(a)
        STEPS[a]()

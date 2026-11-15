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

INK = (0x3A, 0x26, 0x18)
TERRACOTTA = (0xB5, 0x45, 0x2B)
OCHRE = (0xD9, 0xA4, 0x41)
CREAM = (0xF3, 0xE6, 0xC8)

SUITS = ["kupe", "bate", "spade", "dinari"]
RANKS = ["3", "2", "a", "k", "c", "f", "7", "6", "5", "4"]
INDEX_TEXT = {"a": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7",
              "f": "11", "c": "12", "k": "13"}
PIPS = {
    "2": [(240, 250), (240, 518)],
    "3": [(240, 200), (240, 384), (240, 568)],
    "4": [(160, 250), (320, 250), (160, 518), (320, 518)],
}
PIPS["5"] = PIPS["4"] + [(240, 384)]
PIPS["6"] = [(160, 200), (320, 200), (160, 384), (320, 384), (160, 568), (320, 568)]
PIPS["7"] = PIPS["6"] + [(240, 292)]

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
CUTOUT_HOLES_PREFIX = ("ace_",)


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


# --------------------------------------------------------------------------- suits

_suit_cache = {}


def suit_icon_hi(suit):
    """Trimmed high-res suit symbol (RGBA)."""
    if suit not in _suit_cache:
        _suit_cache[suit] = trim(cutout(f"suit_{suit}"), thr=24)
    return _suit_cache[suit]


def step_suits():
    for s in SUITS:
        if not have(f"suit_{s}"):
            print("  missing suit", s)
            continue
        ic = pad_square(suit_icon_hi(s), 0.04)
        save_png(resize(ic, (256, 256)), OUT / "cards" / "suits" / f"{s}.png")
    print("  suits done")


# Clubs and swords are tall and narrow; fitted into the nominal square pip box
# they read as tiny next to cups and coins, so they may grow taller than the box.
NARROW_SUITS = ("bate", "spade")


def icon(suit, box, rotate=False, tall=1.0):
    """Suit symbol fitted into a box x box square; narrow suits may use a box
    `tall` times higher (same width limit)."""
    h = box * (tall if suit in NARROW_SUITS else 1.0)
    ic = fit_box(suit_icon_hi(suit), box, h)
    return ic.rotate(180) if rotate else ic


# --------------------------------------------------------------------------- card base

def arch_path_mask(d=0.0):
    """Supersampled mask for the court arch panel, grown by d px (negative = shrink)."""
    m = Image.new("L", (W * SS, H * SS), 0)
    dr = ImageDraw.Draw(m)
    cx, cy, r = 240, 298, 170 + d
    dr.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=255)
    dr.rectangle([(70 - d) * SS, cy * SS, (410 + d) * SS, (688 + d) * SS], fill=255)
    return m


def rounded_mask_ss(r=24, inset=0.0):
    m = Image.new("L", (W * SS, H * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [inset * SS, inset * SS, (W - inset) * SS - 1, (H - inset) * SS - 1],
        radius=(r - inset) * SS, fill=255)
    return m


def apply_card_mask(img):
    """Rounded-rect alpha (r 24) and a 2 px inner ink stroke at 60% alpha."""
    img = img.convert("RGBA")
    outer = rounded_mask_ss(24, 0)
    inner = rounded_mask_ss(24, 2)
    ring = np.asarray(outer).astype(np.int16) - np.asarray(inner).astype(np.int16)
    ring = Image.fromarray(np.clip(ring, 0, 255).astype(np.uint8), "L").resize((W, H), Image.LANCZOS)
    mask = outer.resize((W, H), Image.LANCZOS)
    stroke = Image.new("RGBA", (W, H), INK + (0,))
    stroke.putalpha(ring.point(lambda v: int(v * 0.6)))
    img.alpha_composite(stroke)
    a = np.minimum(np.asarray(img.getchannel("A")), np.asarray(mask))
    img.putalpha(Image.fromarray(a.astype(np.uint8), "L"))
    return img


_frame = None

FRAME_MARGIN_TRIM = 10   # px (raw scale) of outer cream margin trimmed on every side


def remove_centre_strip(img, target_w, blend=48):
    """Narrow an image whose centre is plain parchment by cutting a vertical strip
    out of the middle and cross-fading the seam (keeps borders undistorted)."""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    cut = w - target_w
    if cut <= 0:
        return img
    left_w = target_w // 2 + blend // 2
    right_start = w - (target_w - target_w // 2) - blend // 2
    left = a[:, :left_w]
    right = a[:, right_start:]
    out = np.zeros((h, target_w, a.shape[2]), np.float32)
    lw_solid = left_w - blend
    out[:, :lw_solid] = left[:, :lw_solid]
    t = np.linspace(0, 1, blend)[None, :, None]
    out[:, lw_solid:lw_solid + blend] = left[:, lw_solid:] * (1 - t) + right[:, :blend] * t
    out[:, lw_solid + blend:] = right[:, blend:]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), img.mode)


def erase_corner_ornament(img, box, shift_y):
    """Paint parchment over the ornament inside `box` (x0,y0,x1,y1) by copying the
    same columns from `shift_y` px away (vertical borders line up), masked to the
    pixels that differ from the parchment, dilated and feathered."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    x0, y0, x1, y1 = box
    region = a[y0:y1, x0:x1]
    src = a[y0 + shift_y:y1 + shift_y, x0:x1]
    paper = np.median(src.reshape(-1, 3), axis=0)
    diff = np.sqrt(((region - paper) ** 2).sum(-1))
    m = Image.fromarray(((diff > 28) * 255).astype(np.uint8), "L")
    m = m.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(3))
    mk = np.asarray(m).astype(np.float32)[..., None] / 255.0
    a[y0:y1, x0:x1] = region * (1 - mk) + src * mk
    return Image.fromarray(a.astype(np.uint8), "RGB")


def prepare_frame():
    """card_frame raw -> 480x768 RGB base.
    Deviation from a plain centre-crop (which would cut the generated side borders):
    trim the outer cream margin, cut a plain strip out of the centre to reach the
    1.6 ratio, and remove the top-left and bottom-right olive flourishes where
    the corner indices sit (the other two corners keep theirs)."""
    im = raw("card_frame").convert("RGB")
    # normalise to 1024 wide first
    if im.width != 1024:
        im = resize(im, (1024, round(im.height * 1024 / im.width)))
    m = FRAME_MARGIN_TRIM
    im = im.crop((m, m, im.width - m, im.height - m))
    im = remove_centre_strip(im, round(im.height / 1.6))
    w, h = im.size
    # ornament boxes (inside the inner ochre line), detected from the raw layout
    inset = 54 - m
    tl = (inset, inset, inset + 175, inset + 160)
    br = (w - inset - 175, h - inset - 160, w - inset, h - inset)
    im = erase_corner_ornament(im, tl, 230)
    im = erase_corner_ornament(im, br, -230)
    return resize(im, (W, H))


def frame_base():
    global _frame
    if _frame is None:
        _frame = prepare_frame().convert("RGBA")
    return _frame.copy()


def draw_index_text(d, txt, f, cx, cy, track=0):
    """Draw `txt` with its ink box centred on (cx, cy); `track` adds px between glyphs."""
    widths = [f.getlength(ch) for ch in txt]
    total = sum(widths) + track * (len(txt) - 1)
    # ink extents of the whole string at origin, with tracking applied per glyph
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
        d.text((x, oy), ch, font=f, fill=INK + (255,), anchor="ls")
        x += wch + track


INDEX_TWO_DIGIT_NUDGE = 4   # px: keeps "11/12/13" clear of the frame's inner line
INDEX_TWO_DIGIT_TRACK = -1  # px between the two digits


def index_block(suit, rank):
    """92x140 block: index text centred at (46,52), suit icon centred at (46,104).
    Two-digit indices (court cards) are nudged 4 px inward so the wide "11/12/13"
    clears the frame's inner ochre line."""
    blk = Image.new("RGBA", (92 * SS, 140 * SS), (0, 0, 0, 0))
    txt = INDEX_TEXT[rank] if rank not in ACE_NO_INDEX else ""
    if txt:
        f = font(52 * SS)
        d = ImageDraw.Draw(blk)
        two = len(txt) > 1
        cx = 46 + (INDEX_TWO_DIGIT_NUDGE if two else 0)
        draw_index_text(d, txt, f, cx * SS, 52 * SS, (INDEX_TWO_DIGIT_TRACK * SS) if two else 0)
    blk = resize(blk, (92, 140))
    paste_center(blk, icon(suit, 40, tall=CORNER_TALL), 46, 104)
    return blk


def add_indices(card, suit, rank):
    blk = index_block(suit, rank)
    card.alpha_composite(blk, (0, 0))
    card.alpha_composite(blk.rotate(180), (W - 92, H - 140))


def ace_ornament():
    lay = ss_layer()
    d = ImageDraw.Draw(lay)
    cx, cy = 240 * SS, 384 * SS

    def ring(r, w, col):
        d.ellipse([cx - (r + w / 2) * SS, cy - (r + w / 2) * SS, cx + (r + w / 2) * SS, cy + (r + w / 2) * SS],
                  outline=col + (255,), width=int(w * SS))

    ring(170, 6, OCHRE)
    ring(160, 3, TERRACOTTA)
    for k in range(8):
        ang = math.radians(22.5 + 45 * k)
        x, y = cx + 188 * SS * math.cos(ang), cy + 188 * SS * math.sin(ang)
        rr = 6 * SS
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=TERRACOTTA + (255,))
    return ss_down(lay)


def court_panel(gid):
    art = raw(gid).convert("RGB")
    if art.width != 1024:
        art = resize(art, (1024, round(art.height * 1024 / art.width)))
    art = art.crop((0, COURT_PRECROP, art.width, art.height - COURT_PRECROP))
    # cover-fit: scale to the panel height, centre-crop the width
    k = 560 / art.height
    art = resize(art, (round(art.width * k), 560))
    x0 = (art.width - 340) // 2
    art = art.crop((x0, 0, x0 + 340, 560)).convert("RGBA")
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lay.paste(art, (70, 128))
    mask = arch_path_mask(0).resize((W, H), Image.LANCZOS)
    lay.putalpha(Image.fromarray(np.minimum(np.asarray(lay.getchannel("A")), np.asarray(mask)), "L"))
    # 4 px border drawn just inside the arch shape, so the panel stays within
    # (70,128)-(410,688)
    outer = np.asarray(arch_path_mask(0)).astype(np.int16)
    inner = np.asarray(arch_path_mask(-4)).astype(np.int16)
    ring = Image.fromarray(np.clip(outer - inner, 0, 255).astype(np.uint8), "L").resize((W, H), Image.LANCZOS)
    border = Image.new("RGBA", (W, H), INK + (0,))
    border.putalpha(ring)
    lay.alpha_composite(border)
    return lay


# Aces (play-test change): a generated ornate emblem (gen ace_<suit>) fitted into
# ACE_BOX and centred at (240,384); the corners keep only the small suit icon at
# the index's suit-mark position (no "1").
ACE_BOX = (380, 580)
ACE_NO_INDEX = {"a"}
PIP_TALL = 1.4      # number-card pips of bate/spade: height up to 1.4 x pip size
ACE_TALL = 1.1      # ace of bate/spade: 308 px tall (still inside the 160 px ring)
CORNER_TALL = 1.25  # corner icon of bate/spade: 50 px tall
COURT_PRECROP = 24  # px (raw scale) cut from top and bottom of court art: removes the
                    # generated image's own outer frame line before the cover-fit


def build_face(suit, rank):
    card = frame_base()
    if rank in PIPS:
        box = 120 if rank in ("2", "3") else 104
        for (x, y) in PIPS[rank]:
            rot = suit in ("bate", "spade") and y > 384
            paste_center(card, icon(suit, box, rot, tall=PIP_TALL), x, y)
    elif rank == "a":
        if have(f"ace_{suit}"):
            # Triestine-style ace: one large ornate emblem, no ring, no number
            em = fit_box(trim(cutout(f"ace_{suit}"), 24), *ACE_BOX)
            paste_center(card, em, 240, 384)
        else:  # fallback: the section 13.5 ace (pip in an ornamental ring)
            card.alpha_composite(ace_ornament())
            paste_center(card, icon(suit, 280, tall=ACE_TALL), 240, 384)
    else:
        gid = f"court_{suit}_{rank}"
        if have(gid):
            card.alpha_composite(court_panel(gid))
        # nominal 48x48 at (240,724) would overlap the frame's inner ochre line
        # (y 745-750), so it is drawn 44 px at (240,719)
        paste_center(card, icon(suit, 44), 240, 719)
    add_indices(card, suit, rank)
    return apply_card_mask(card)


def step_cards():
    if not have("card_frame"):
        print("  card_frame missing: no faces built")
        return
    for s in SUITS:
        if not have(f"suit_{s}"):
            print("  suit missing, skipping", s)
            continue
        for r in RANKS:
            if r in ("k", "c", "f") and not have(f"court_{s}_{r}"):
                print("  court missing, skipping", s, r)
                continue
            save_png(build_face(s, r), OUT / "cards" / f"{s}_{r}.png")
    print("  card faces done")


# --------------------------------------------------------------------------- backs

def hue_rotate(img, deg, sat_mul=1.0):
    """Luminance-preserving hue rotation + saturation, i.e. exactly the CSS
    filter `hue-rotate(deg) saturate(sat_mul)`. (A plain HSV rotation keeps V and
    turns the terracotta back into a glaring cyan; this reads as teal-green.)"""
    t = math.radians(deg)
    c, sn = math.cos(t), math.sin(t)
    hr = np.array([
        [0.213 + c * 0.787 - sn * 0.213, 0.715 - c * 0.715 - sn * 0.715, 0.072 - c * 0.072 + sn * 0.928],
        [0.213 - c * 0.213 + sn * 0.143, 0.715 + c * 0.285 + sn * 0.140, 0.072 - c * 0.072 - sn * 0.283],
        [0.213 - c * 0.213 - sn * 0.787, 0.715 - c * 0.715 + sn * 0.715, 0.072 + c * 0.928 + sn * 0.072]])
    k = sat_mul
    sm = np.array([
        [0.213 + 0.787 * k, 0.715 - 0.715 * k, 0.072 - 0.072 * k],
        [0.213 - 0.213 * k, 0.715 + 0.285 * k, 0.072 - 0.072 * k],
        [0.213 - 0.213 * k, 0.715 - 0.715 * k, 0.072 + 0.928 * k]])
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb = a[..., :3] / 255.0
    rgb = np.clip(rgb @ hr.T @ sm.T, 0, 1) * 255.0
    out = np.concatenate([rgb, a[..., 3:]], -1).astype(np.uint8)
    return Image.fromarray(out)


def step_backs():
    if not have("card_back"):
        print("  card_back missing")
        return
    # Deviation: a centre-crop to 1.6 would cut the painted side borders and the
    # corner rosettes of this symmetric pattern, so the whole back is resized
    # to 480x768 instead (about 6% horizontal compression, not noticeable).
    back = apply_card_mask(resize(raw("card_back").convert("RGB"), (W, H)))
    save_png(back, OUT / "cards" / "back_player.png")
    save_png(hue_rotate(back, 150, 0.85), OUT / "cards" / "back_bot.png")
    print("  backs done")


# --------------------------------------------------------------------------- badges

BADGES = {
    "ukrasi_sheet_a": ["pozlaceno", "srebreno", "nabruseno", "ljuto", "usoljeno"],
    "ukrasi_sheet_b": ["pijano", "divlje", "glasno", "ponocno", "ribarsko"],
}


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
    # single-badge overrun generations (badge_<name>), if any exist, override
    for names in BADGES.values():
        for name in names:
            gid = f"badge_{name}"
            if have(gid):
                ic = pad_square(trim(cutout(gid), 32), 0.06)
                save_png(resize(ic, (256, 256)), OUT / "ukrasi" / f"{name}.png")
                print("  badge override from", gid)
    print("  badges done")


# --------------------------------------------------------------------------- fore, portraits, env

FORE = ["pogled", "zamjena", "namjesteno", "krivi_racun", "ti_otvaraj", "tucem", "napij_ga",
        "vrati", "trica_iz_rukava", "duplo_ili_nista"]
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
            if p.exists():
                sheet.alpha_composite(resize(Image.open(p).convert("RGBA"), (tw, th)), (x, y))
            else:
                ImageDraw.Draw(sheet).rectangle([x, y, x + tw, y + th], outline=(200, 60, 60, 255), width=3)
            label(sheet, f"{s}_{r}", (x + 4, y + th + 2), 16)
        y += th + g + 22
    for i, b in enumerate(["back_player", "back_bot"]):
        p = OUT / "cards" / f"{b}.png"
        x = g + i * (tw + g)
        if p.exists():
            sheet.alpha_composite(resize(Image.open(p).convert("RGBA"), (tw, th)), (x, y))
        label(sheet, b, (x + 4, y + th + 2), 16)
    # the 4 suit icons beside the backs
    for i, s in enumerate(SUITS):
        p = OUT / "cards" / "suits" / f"{s}.png"
        x = g + (3 + i) * (tw + g)
        if p.exists():
            ic = resize(Image.open(p).convert("RGBA"), (tw, tw))
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
        if p.exists():
            sheet.alpha_composite(resize(Image.open(p).convert("RGBA"), (small_w, small_h)), (x, y))
        x += small_w + 8
    # fanned-hand check: overlapping 96x154 cards, only the left strip of each shows
    fan = [("kupe", "a"), ("kupe", "3"), ("bate", "a"), ("bate", "k"), ("spade", "a"), ("spade", "2"),
           ("dinari", "a"), ("dinari", "7"), ("kupe", "f"), ("bate", "4")]
    fx = x + 24
    label(sheet, "fan:", (fx, y - 26), 18)
    for i, (s, r) in enumerate(fan):
        p = OUT / "cards" / f"{s}_{r}.png"
        if p.exists() and fx + i * 30 + small_w < sheet_w:
            sheet.alpha_composite(resize(Image.open(p).convert("RGBA"), (small_w, small_h)), (fx + i * 30, y))
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
        if p.exists():
            misc.alpha_composite(resize(Image.open(p).convert("RGBA"), (180, 288)), (x, y))
        label(misc, f, (x, y + 290), 14)
        x += 196
    y += 320
    x = g
    for f in FORE:
        p = OUT / "fore" / f"{f}.png"
        if p.exists():
            misc.alpha_composite(resize(Image.open(p).convert("RGBA"), (104, 166)), (x, y))
        x += 120
    y += 190
    label(misc, "ukrasi badges (256 on checker; and 112 on a card, 48 small)", (g, y), 20)
    y += 30
    x = g
    allb = BADGES["ukrasi_sheet_a"] + BADGES["ukrasi_sheet_b"]
    for b in allb:
        p = OUT / "ukrasi" / f"{b}.png"
        misc.alpha_composite(checker(180, 180), (x, y))
        if p.exists():
            misc.alpha_composite(resize(Image.open(p).convert("RGBA"), (180, 180)), (x, y))
        label(misc, b, (x, y + 182), 14)
        x += 196
    y += 215
    # badge on a card at in-game size/position
    x = g
    for i, b in enumerate(allb):
        cp = OUT / "cards" / f"{SUITS[i % 4]}_{RANKS[i % 10]}.png"
        p = OUT / "ukrasi" / f"{b}.png"
        if cp.exists():
            card = Image.open(cp).convert("RGBA")
            if p.exists():
                card.alpha_composite(resize(Image.open(p).convert("RGBA"), (112, 112)), (338, 118))
            misc.alpha_composite(resize(card, (180, 288)), (x, y))
        x += 196
    y += 310
    label(misc, "ui: coin, rakija_full, rakija_empty (256 on checker, plus HUD size 44x60 / 40)", (g, y), 20)
    y += 30
    x = g
    for u in ["coin", "rakija_full", "rakija_empty"]:
        p = OUT / "ui" / f"{u}.png"
        misc.alpha_composite(checker(256, 256), (x, y))
        if p.exists():
            im = Image.open(p).convert("RGBA")
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
        if p.exists():
            misc.alpha_composite(resize(Image.open(p).convert("RGBA"), (480, 320)), (x, y))
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
            for gid in ["suit_kupe", "suit_bate", "suit_spade", "suit_dinari", "ukrasi_sheet_a",
                        "ukrasi_sheet_b", "ui_coin", "ui_rakija", "logo",
                        "ace_kupe", "ace_bate", "ace_spade", "ace_dinari"]:
                if have(gid):
                    cutout(gid, force=True)
            print("  cutouts refreshed")
            continue
        print(a)
        STEPS[a]()

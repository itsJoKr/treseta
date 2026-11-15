#!/usr/bin/env python3
"""Convert the art pipeline's PNG/JPG output in public/assets to web-ready WebP.

The art build (tools/art/build.py) writes PNG/JPG masters into public/assets.
This step moves each master to assets_src/masters/<same path> (kept, never
deployed) and writes a .webp next to where the master was. Re-running is safe:
a master already in assets_src/masters is only re-encoded if public/assets got
a newer copy from the art build.

Usage:  tools/.venv/bin/python tools/optimize_assets.py [--force]
"""
import argparse
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "assets"
MASTERS = ROOT / "assets_src" / "masters"
IMAGE_DIRS = ["cards", "ukrasi", "fore", "portraits", "env", "ui"]

# Cards are the hero visual and get zoomed on hover, so they get a higher quality.
QUALITY = {"cards": 86, "env": 80}
DEFAULT_QUALITY = 82


def quality_for(rel: Path) -> int:
    return QUALITY.get(rel.parts[0], DEFAULT_QUALITY)


def encode(master: Path, dst: Path, q: int) -> None:
    with Image.open(master) as im:
        im.load()
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if has_alpha else "RGB")
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_suffix(".tmp.webp")
        im.save(tmp, "WEBP", quality=q, method=6, alpha_quality=90)
        tmp.replace(dst)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-encode every image")
    args = ap.parse_args()

    before = after = 0
    count = 0
    for d in IMAGE_DIRS:
        # 1) any fresh PNG/JPG in public/assets becomes the new master
        for src in sorted((PUBLIC / d).rglob("*")):
            if src.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                continue
            rel = src.relative_to(PUBLIC)
            master = MASTERS / rel
            master.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), master)
            (master.with_suffix(".stale")).touch()  # mark for re-encode
        # 2) encode masters to webp
        for master in sorted((MASTERS / d).rglob("*")):
            if master.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                continue
            rel = master.relative_to(MASTERS)
            dst = PUBLIC / rel.with_suffix(".webp")
            stale = master.with_suffix(".stale")
            if args.force or stale.exists() or not dst.exists():
                encode(master, dst, quality_for(rel))
                stale.unlink(missing_ok=True)
                count += 1
            before += master.stat().st_size
            after += dst.stat().st_size

    print(f"encoded {count} file(s); masters {before / 1e6:.1f} MB -> webp {after / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())

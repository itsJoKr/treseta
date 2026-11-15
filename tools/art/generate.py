#!/usr/bin/env python3
"""Run image generations through the Codex CLI ($imagegen / gpt-image-2).

Usage:
  tools/.venv/bin/python tools/art/generate.py [-j 4] [--extra "..."] gen_id [gen_id ...]

Each job runs `codex exec` inside its own folder assets_src/gen/_work/<gen_id>/
(the Codex sandbox may only write there) and the result is moved to
assets_src/gen/<gen_id>.png. An existing raw file is moved to
assets_src/gen/_rejected/<gen_id>_<n>.png first. One retry on failure.
"""
import argparse
import concurrent.futures as cf
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prompts import GENS, full_prompt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / "assets_src" / "gen"
WORK = GEN / "_work"
LOGS = GEN / "_logs"
REJ = GEN / "_rejected"
CODEX_IMG = Path.home() / ".codex" / "generated_images"


def instruction(gen_id: str, extra: str) -> str:
    w, h, *_ = GENS[gen_id]
    orient = "portrait" if h > w else ("landscape" if w > h else "square")
    prompt = full_prompt(gen_id, extra)
    return (
        f"Use the $imagegen skill (the built-in image_gen tool) to generate exactly ONE image, "
        f"size {w}x{h} pixels ({orient}). Use this image prompt exactly as written, do not "
        f"add, remove or rephrase content:\n\n{prompt}\n\n"
        f"Save the final image as {gen_id}.png in the current directory (copy it from the "
        f"generated_images folder if the tool saved it elsewhere). Do not create any other files, "
        f"do not generate more than one image, and do not edit the image afterwards."
    )


def newest_codex_image(since: float):
    best = None
    if CODEX_IMG.exists():
        for p in CODEX_IMG.rglob("*.png"):
            m = p.stat().st_mtime
            if m >= since and (best is None or m > best[0]):
                best = (m, p)
    return best[1] if best else None


def run_one(gen_id: str, extra: str) -> str:
    wd = WORK / gen_id
    if wd.exists():
        shutil.rmtree(wd)
    wd.mkdir(parents=True)
    log = LOGS / f"{gen_id}.log"
    for attempt in (1, 2):
        t0 = time.time()
        with open(log, "a") as lf:
            lf.write(f"\n===== attempt {attempt} {time.ctime()} =====\n")
            lf.flush()
            try:
                subprocess.run(
                    ["codex", "exec", "-m", os.environ.get("CODEX_MODEL", "gpt-5.6-sol"), "--sandbox", "workspace-write", "--skip-git-repo-check",
                     instruction(gen_id, extra)],
                    cwd=wd, stdout=lf, stderr=subprocess.STDOUT, timeout=900, stdin=subprocess.DEVNULL,
                )
            except subprocess.TimeoutExpired:
                lf.write("TIMEOUT\n")
        out = wd / f"{gen_id}.png"
        if not out.exists():
            pngs = sorted(wd.glob("*.png"), key=lambda p: p.stat().st_mtime)
            if pngs:
                out = pngs[-1]
        if not out.exists():
            # Fall back to the session folder only when this is the sole job running.
            cand = newest_codex_image(t0) if os.environ.get("GEN_ALLOW_FALLBACK") else None
            if cand:
                shutil.copy(cand, wd / f"{gen_id}.png")
                out = wd / f"{gen_id}.png"
        if out.exists():
            dest = GEN / f"{gen_id}.png"
            if dest.exists():
                REJ.mkdir(exist_ok=True)
                n = 1
                while (REJ / f"{gen_id}_{n}.png").exists():
                    n += 1
                shutil.move(dest, REJ / f"{gen_id}_{n}.png")
            shutil.move(out, dest)
            shutil.rmtree(wd, ignore_errors=True)
            return f"OK   {gen_id} ({time.time() - t0:.0f}s, attempt {attempt})"
    return f"FAIL {gen_id} (see {log})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+")
    ap.add_argument("-j", type=int, default=4)
    ap.add_argument("--extra", default="", help="extra sentence appended to the prompt (retries)")
    a = ap.parse_args()
    for i in a.ids:
        if i not in GENS:
            sys.exit(f"unknown gen_id {i}")
    WORK.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    with cf.ThreadPoolExecutor(a.j) as ex:
        futs = [ex.submit(run_one, i, a.extra) for i in a.ids]
        for f in cf.as_completed(futs):
            print(f.result(), flush=True)


if __name__ == "__main__":
    main()

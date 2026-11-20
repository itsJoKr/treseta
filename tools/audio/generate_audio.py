#!/usr/bin/env python3
"""Regenerate every Trešeta audio asset (GAME_DESIGN.md §9 and §14), idempotently.

    tools/.venv/bin/python tools/audio/generate_audio.py all       # voices + sfx + verify
    tools/.venv/bin/python tools/audio/generate_audio.py voice [--persona barba] [--line id ...]
    tools/.venv/bin/python tools/audio/generate_audio.py sfx [--id card_flip ...]
    tools/.venv/bin/python tools/audio/generate_audio.py verify

Existing, valid output files are never regenerated (use --force). Raw API
takes are cached in tools/audio/work/ (git-ignored), so a rerun after a crash
or a post-processing change costs no credits (--reprocess rebuilds the final
files from cached takes). Voices come from tools/audio/voices.json (cast once
with design_voices.py). The API key is read from the key file at runtime only.
"""
import argparse
import concurrent.futures as cf
import json
import os
import sys
import threading
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import dsp  # noqa: E402
import el_api  # noqa: E402
import spec  # noqa: E402
import stt  # noqa: E402
from design_voices import similarity  # noqa: E402

WORK = os.path.join(HERE, "work")
TAKES_DIR = os.path.join(WORK, "takes")
SFX_RAW_DIR = os.path.join(WORK, "sfx_raw")
USAGE_JSON = os.path.join(WORK, "usage.json")
TAKES_JSON = os.path.join(WORK, "takes.json")
REPORT_JSON = os.path.join(HERE, "report.json")
VOICES_JSON = os.path.join(HERE, "voices.json")

TTS_MODEL = "eleven_v4"
LANG = "hr"
VOICE_SETTINGS = {"stability": 0.35, "similarity_boost": 0.75, "style": 0.6, "use_speaker_boost": True}
TAKES_PER_LINE = 2
MAX_TAKES_PER_LINE = 4          # extra takes only when both takes look garbled
GARBLED_SIM = 0.62              # STT similarity below this = suspicious take
SFX_MODELS = ["eleven_text_to_sound_v3", "eleven_text_to_sound_v2"]
PROMPT_INFLUENCE = 0.5
LOOP_XFADE = 1.5
WORKERS = 3                     # account allows 3 concurrent requests

VOICE_LUFS, VOICE_TP = -16.0, -1.0
# §22 (play-test round 4)
# - Lines recorded from round 4 on (rows 35+ and their variants, plus the re-worded ko_je_misaja)
#   are sped up after recording: eleven_v4 ignores voice_settings.speed, and ffmpeg atempo
#   shortens speech without changing its pitch.
# - The short interjections sit lower in the mix, and the two grunts must be one short sound
#   (the first takes said "aargh" twice): their takes are ranked on that, not on the transcript.
TEMPO, TEMPO_FROM_NUM, TEMPO_ALSO = 1.12, 35, {"ko_je_misaja"}
INTERJECTIONS = {"argh", "joj", "oho", "ehe", "ma_daj", "pff"}   # rows 45-50 of §9.3
GRUNTS = {"argh", "pff"}
INTERJECTION_LUFS = -19.0


def tempo_for(line):
    if line["id"] in INTERJECTIONS:
        return 1.0
    return TEMPO if (line["num"] >= TEMPO_FROM_NUM or line["id"] in TEMPO_ALSO) else 1.0


def lufs_for(line):
    return INTERJECTION_LUFS if line["id"] in INTERJECTIONS else VOICE_LUFS


def burst_runs(x, sr=None, win_ms=20, rel_db=-28.0, gap_ms=120):
    """(start, end, energy) in samples of each sound burst, gaps shorter than gap_ms merged."""
    sr = sr or dsp.SR
    m = x[0] if x.ndim == 2 else x
    w = int(sr * win_ms / 1000)
    n = len(m) // w
    if n == 0:
        return []
    e = (m[: n * w].reshape(n, w) ** 2).mean(1) + 1e-12
    on = 10 * np.log10(e / e.max()) > rel_db
    need, runs = max(1, int(gap_ms / win_ms)), []
    i = 0
    while i < n:
        if not on[i]:
            i += 1
            continue
        j = i
        while j < n and (on[j] or (j + need < n and on[j:j + need].any())):
            j += 1
        runs.append((i * w, j * w, float(e[i:j].sum())))
        i = j
    return runs


def strongest_burst(x, pre_ms=40, post_ms=90):
    """Only the loudest sound of a take (a grunt the model said twice keeps one)."""
    runs = burst_runs(x)
    if len(runs) <= 1:
        return x
    a, b, _ = max(runs, key=lambda r: r[2])
    a = max(0, a - int(dsp.SR * pre_ms / 1000))
    b = min(x.shape[-1], b + int(dsp.SR * post_ms / 1000))
    return x[..., a:b]


def bursts(x, sr=None, win_ms=20, rel_db=-28.0, gap_ms=120):
    """Separate sound bursts (runs above rel_db of the peak, split by gaps of at least gap_ms)."""
    sr = sr or dsp.SR
    m = x[0] if x.ndim == 2 else x
    w = int(sr * win_ms / 1000)
    n = len(m) // w
    if n == 0:
        return 0
    rms = np.sqrt((m[: n * w].reshape(n, w) ** 2).mean(1)) + 1e-9
    on = 20 * np.log10(rms / rms.max()) > rel_db
    need, count, gap = max(1, int(gap_ms / win_ms)), 0, 10 ** 9
    for v in on:
        if v:
            if gap >= need:
                count += 1
            gap = 0
        else:
            gap += 1
    return count
STINGER_LUFS, AMBIENT_LUFS = -16.0, -26.0
SFX_PEAK = -3.0
SFX_MAX_LUFS = -18.0            # cap for dense short sfx (keeps them below the voices)

_lock = threading.Lock()


# ---------------------------------------------------------------- helpers
def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(tmp, path)


def add_usage(kind, cost):
    with _lock:
        u = load_json(USAGE_JSON, {})
        u.setdefault(kind, {"requests": 0, "character_cost": 0})
        u[kind]["requests"] += 1
        try:
            u[kind]["character_cost"] += int(float(cost or 0))
        except ValueError:
            pass
        save_json(USAGE_JSON, u)


def seed_for(*parts):
    return zlib.crc32("/".join(parts).encode()) & 0x7FFFFFFF


def valid_file(path, min_dur, max_dur, channels=None):
    if not os.path.exists(path) or os.path.getsize(path) < 1000:
        return False
    p = dsp.probe(path)
    if not p or p["codec"] != "mp3" or p["sample_rate"] != 44100:
        return False
    if channels and p["channels"] != channels:
        return False
    return min_dur <= p["duration"] <= max_dur


def vowel_count(s):
    s = s.lower()
    n = sum(1 for ch in s if ch in "aeiou")
    return max(1, n)


# ------------------------------------------------------------------ voice
def load_voices():
    v = load_json(VOICES_JSON, {}).get("personas", {})
    missing = [p for p in spec.PERSONAS if p not in v]
    if missing:
        sys.exit(f"voices.json has no chosen voice for {missing}; run design_voices.py first")
    return {p: v[p]["voice_id"] for p in spec.PERSONAS}


def take_path(persona, lid, n):
    return os.path.join(TAKES_DIR, persona, f"{lid}_t{n}.mp3")


def ensure_take(voice_id, persona, line, n):
    path = take_path(persona, line["id"], n)
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return path
    audio, hdr = el_api.tts(voice_id, line["tts"], model_id=TTS_MODEL, language_code=LANG,
                            voice_settings=VOICE_SETTINGS, seed=seed_for(persona, line["id"], str(n)))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".part", "wb") as fh:
        fh.write(audio)
    os.replace(path + ".part", path)
    add_usage("tts", hdr.get("character-cost"))
    print(f"  [tts] {persona}/{line['id']} take {n} ({hdr.get('character-cost')} chars)")
    return path


def score_take(path, line, persona_f0):
    """Higher is better. Returns (score, info)."""
    takes = load_json(TAKES_JSON, {})
    key = os.path.relpath(path, TAKES_DIR)
    mtime = os.path.getmtime(path)
    info = takes.get(key)
    if not info or info.get("mtime") != mtime:
        x = dsp.decode(path)
        s, e = dsp.find_bounds(x, rel_db=-45, floor_db=-60)
        ps = dsp.pitch_stats(x[:, s:e])
        st = stt.transcribe(path, LANG) if stt.available() else None
        info = {"mtime": mtime, "duration": x.shape[1] / dsp.SR, "active": (e - s) / dsp.SR, "bursts": bursts(x),
                "f0_median": ps.get("f0_median"), "f0_sd": ps.get("f0_semitone_sd"),
                "stt_text": (st or {}).get("text"), "stt_model": (st or {}).get("_model"),
                "similarity": similarity((st or {}).get("text") or "", line["subtitle"]) if st else None}
        with _lock:
            takes = load_json(TAKES_JSON, {})
            takes[key] = info
            save_json(TAKES_JSON, takes)
    if line["id"] in GRUNTS:
        # processing keeps only the loudest burst; rank takes on how long that one sound is
        # (about half a second reads as a short, subtle grunt). The transcript of a grunt means little.
        if "grunt_s" not in info:
            info["grunt_s"] = strongest_burst(dsp.decode(path)).shape[-1] / dsp.SR
        return 1.0 - abs(info["grunt_s"] - 0.5), info
    score = info["similarity"] if info["similarity"] is not None else 0.8
    # Duration sanity: ~0.11-0.45 s per vowel for an emotional short line
    # (+1.5 s allowance for a sigh/laugh/breath from the audio tag).
    nv = vowel_count(line["subtitle"])
    lo, hi = 0.09 * nv, 0.45 * nv + 1.5
    if info["active"] < lo or info["active"] > hi:
        score -= 0.25
    # Tag fit: raised-voice tags should come out higher/livelier than the
    # persona's calm register, low-energy tags lower.
    f0 = info.get("f0_median")
    tag = (line.get("tag") or "").lower()
    if f0 and persona_f0:
        rel = 12 * np.log2(f0 / persona_f0)  # semitones vs calm register
        if tag in ("shouting", "angry", "excited", "surprised", "frustrated", "impatient", "exasperated"):
            score += 0.04 * float(np.clip(rel / 6, -1, 1))
        elif tag in ("sighs", "grumbling"):
            score += 0.04 * float(np.clip(-rel / 6, -1, 1))
    if info.get("f0_sd"):
        score += 0.01 * float(np.clip(info["f0_sd"] / 4, 0, 1))  # livelier intonation
    return score, info


def encode_corrected(y, dst, channels, target_lufs=None, tp_max=None, target_peak=None, bitrate="128k"):
    """Encode, decode, re-measure and correct the gain (mp3 shifts levels a
    little), so the shipped file itself meets the target."""
    for _ in range(3):
        dsp.encode_mp3(y, dst, bitrate=bitrate)
        z = dsp.decode(dst, channels=channels)
        if target_lufs is not None:
            I, TP = dsp.loudness(z)
            delta = target_lufs - I
            if tp_max is not None:
                delta = min(delta, tp_max - 0.1 - TP)
        else:
            delta = target_peak - dsp.sample_peak_db(z)
        if abs(delta) < 0.1:
            break
        y = (y * 10 ** (delta / 20)).astype(np.float32)


def process_voice(src, dst, line=None):
    x = dsp.decode(src)  # mono 44.1k
    if line and line["id"] in GRUNTS:
        x = strongest_burst(x)
    tempo = tempo_for(line) if line else 1.0
    if tempo != 1.0:
        x = dsp.ffmpeg_filter(x, f"atempo={tempo}")
    y = dsp.trim(x, lead_ms=25, tail_ms=110, rel_db=-45, floor_db=-60,
                 fade_in_ms=10, fade_out_ms=80)
    target = lufs_for(line) if line else VOICE_LUFS
    y = dsp.normalize_lufs(y, target, VOICE_TP)
    # 64 kbps mono is transparent for speech and halves the web payload.
    encode_corrected(y, dst, 1, target_lufs=target, tp_max=VOICE_TP, bitrate="64k")


def voice_job(persona, line, voice_id, persona_f0, args):
    dst = spec.voice_path(persona, line["id"])
    if not args.force and not args.reprocess and valid_file(dst, 0.3, 10.0, channels=1):
        return {"status": "skipped"}
    nt = max(TAKES_PER_LINE, getattr(args, "takes", None) or 0)
    paths = [ensure_take(voice_id, persona, line, n) for n in range(1, nt + 1)]
    n = nt
    while os.path.exists(take_path(persona, line["id"], n + 1)):  # extra cached takes
        n += 1
        paths.append(take_path(persona, line["id"], n))
    scored = [(score_take(p, line, persona_f0), p) for p in paths]
    while (max(s[0][0] for s in scored) < GARBLED_SIM and stt.available()
           and n < MAX_TAKES_PER_LINE):
        n += 1
        p = ensure_take(voice_id, persona, line, n)
        scored.append((score_take(p, line, persona_f0), p))
    (best_score, best_info), best = max(scored, key=lambda t: t[0][0])
    process_voice(best, dst, line)
    return {"status": "made", "take": os.path.basename(best), "score": round(best_score, 3),
            "takes": [{"take": os.path.basename(p), "score": round(s[0], 3),
                       "similarity": s[1]["similarity"], "stt": s[1]["stt_text"]} for s, p in scored]}


def persona_baselines():
    """Calm-register F0 per persona from the casting tests (fallbacks if absent)."""
    base = {"barba": 100.0, "gazda": 137.0, "mali": 170.0}
    for p, d in load_json(VOICES_JSON, {}).get("personas", {}).items():
        if d.get("calm_f0_hz"):
            base[p] = float(d["calm_f0_hz"])
    return base


def cmd_voice(args):
    voices = load_voices()
    base = persona_baselines()
    jobs = [(p, ln) for p, ln in spec.voice_jobs()
            if (not args.persona or p in args.persona) and (not args.line or ln["id"] in args.line)]
    print(f"[voice] {len(jobs)} line files to check")
    if getattr(args, "reroll", False):
        for p, ln in jobs:
            for n in range(1, MAX_TAKES_PER_LINE + 1):
                tp = take_path(p, ln["id"], n)
                if os.path.exists(tp):
                    os.remove(tp)
        args.force = True
    if getattr(args, "takes", None):
        args.force = True
    # Phase 1: make sure takes exist (parallel network calls).
    todo = [(p, ln) for p, ln in jobs
            if args.force or args.reprocess or not valid_file(spec.voice_path(p, ln["id"]), 0.3, 10.0, 1)]
    if not args.reprocess:
        with cf.ThreadPoolExecutor(WORKERS) as ex:
            nt = max(TAKES_PER_LINE, getattr(args, "takes", None) or 0)
            futs = [ex.submit(ensure_take, voices[p], p, ln, n)
                    for p, ln in todo for n in range(1, nt + 1)]
            for f in cf.as_completed(futs):
                try:
                    f.result()
                except Exception as e:  # keep going; report at the end
                    print(f"  [tts] ERROR {e}", file=sys.stderr)
    # Phase 2: score takes, pick, post-process (sequential; STT is local).
    log = load_json(REPORT_JSON, {}).get("voice_takes", {})
    failed = []
    for p, ln in jobs:
        key = f"{p}/{ln['id']}"
        try:
            r = voice_job(p, ln, voices[p], base[p], args)
        except Exception as e:
            print(f"  [voice] FAILED {key}: {e}", file=sys.stderr)
            failed.append(key)
            continue
        if r["status"] == "made":
            log[key] = r
            print(f"  [voice] {key}: {r['take']} score={r['score']}  stt={next(t['stt'] for t in r['takes'] if t['take'] == r['take'])!r}")
    rep = load_json(REPORT_JSON, {})
    rep["voice_takes"] = log
    save_json(REPORT_JSON, rep)
    if failed:
        print(f"[voice] failed: {failed}")


# -------------------------------------------------------------------- sfx
def sfx_raw_path(sid):
    return os.path.join(SFX_RAW_DIR, f"{sid}.mp3")


def ensure_sfx_raw(item):
    path = sfx_raw_path(item["id"])
    meta_path = path + ".json"
    if os.path.exists(path) and os.path.getsize(path) > 500:
        return path, load_json(meta_path, {})
    dur = item["duration"]
    # The API rejects durations below 0.5 s (HTTP 400, checked 2026-11-15), so
    # sub-0.5 s items are generated at 0.5 s and cut to the §14.2 length.
    reqs = [dur + LOOP_XFADE] if item["loop"] else [max(0.5, dur)]
    last = None
    for model in SFX_MODELS:
        for req in reqs:
            try:
                audio, hdr = el_api.sound_generation(item["prompt"], duration_seconds=round(req, 2),
                                                     prompt_influence=PROMPT_INFLUENCE,
                                                     loop=item["loop"], model_id=model)
            except el_api.ApiError as e:
                last = e
                if e.status in (400, 422):
                    print(f"  [sfx] {item['id']}: {model} @ {req}s rejected ({e.status}): {e.body[:160]}")
                    continue
                raise
            os.makedirs(SFX_RAW_DIR, exist_ok=True)
            with open(path + ".part", "wb") as fh:
                fh.write(audio)
            os.replace(path + ".part", path)
            meta = {"model": model, "requested_duration": req, "loop_flag": item["loop"],
                    "prompt_influence": PROMPT_INFLUENCE, "character_cost": hdr.get("character-cost")}
            save_json(meta_path, meta)
            add_usage("sfx", hdr.get("character-cost"))
            print(f"  [sfx] generated {item['id']} with {model} ({req:.2f}s, cost {hdr.get('character-cost')})")
            return path, meta
    raise last


def process_sfx(item, src, dst):
    kind = item["kind"]
    if kind == "sfx":
        x = dsp.decode(src, channels=1)
        s, e = dsp.find_bounds(x, rel_db=-55, floor_db=-72, win_ms=1.0, min_run_ms=3.0)
        s = max(0, s - int(0.004 * dsp.SR))
        y = x[:, s:]
        target = item["duration"]
        cut = False
        if y.shape[1] > int((target + 0.05) * dsp.SR):
            # generated longer than listed (0.5 s minimum fallback): cut to length
            y = y[:, :int(target * dsp.SR)]
            cut = True
        # drop trailing silence, keep a short natural decay
        _, e2 = dsp.find_bounds(y, rel_db=-60, floor_db=-76, win_ms=2.0, min_run_ms=6.0)
        y = y[:, :min(y.shape[1], e2 + int(0.03 * dsp.SR))]
        fo = max(20.0, 0.3 * target * 1000) if cut else min(25.0, 0.15 * target * 1000)
        y = dsp.fade(y, dsp.SR, 2.0, fo)
        y = dsp.normalize_peak(y, SFX_PEAK)
        I, _ = dsp.loudness(y)
        if I > SFX_MAX_LUFS + 0.5:
            # dense/bright sounds at -3 dBFS peak would be louder than the
            # voices; cap them a little below the -16 LUFS voice level
            y = (y * 10 ** ((SFX_MAX_LUFS - I) / 20)).astype(np.float32)
            return encode_corrected(y, dst, 1, target_lufs=SFX_MAX_LUFS, tp_max=SFX_PEAK)
        return encode_corrected(y, dst, 1, target_peak=SFX_PEAK)
    elif kind == "stinger":
        x = dsp.decode(src, channels=2)
        s, _ = dsp.find_bounds(x, rel_db=-55, floor_db=-72, win_ms=1.0, min_run_ms=3.0)
        y = x[:, max(0, s - int(0.004 * dsp.SR)):]
        _, e2 = dsp.find_bounds(y, rel_db=-60, floor_db=-76, win_ms=2.0, min_run_ms=6.0)
        y = y[:, :min(y.shape[1], e2 + int(0.15 * dsp.SR))]
        y = dsp.fade(y, dsp.SR, 2.0, 120.0)
        y = dsp.normalize_lufs(y, STINGER_LUFS, -1.0)
        return encode_corrected(y, dst, 2, target_lufs=STINGER_LUFS, tp_max=-1.0)
    else:  # ambience loop
        x = dsp.decode(src, channels=2)
        y = dsp.make_loop(x, xfade_s=LOOP_XFADE)
        I, TP = dsp.loudness(y)
        y = (y * 10 ** ((AMBIENT_LUFS - I) / 20)).astype(np.float32)  # constant gain only
        return encode_corrected(y, dst, 2, target_lufs=AMBIENT_LUFS, tp_max=-1.0)


def cmd_sfx(args):
    items = [it for it in spec.sfx_items() if not args.id or it["id"] in args.id]
    print(f"[sfx] {len(items)} files to check")
    failed = []

    def one(it):
        dst = spec.sfx_path(it["id"])
        ch = 1 if it["kind"] == "sfx" else 2
        maxd = it["duration"] + 2.0 if not it["loop"] else it["duration"] + 0.5
        if not args.force and not args.reprocess and valid_file(dst, 0.05, maxd, channels=ch):
            return it["id"], "skipped"
        if args.force and os.path.exists(sfx_raw_path(it["id"])) and not args.reprocess:
            os.remove(sfx_raw_path(it["id"]))
        src, _ = ensure_sfx_raw(it)
        process_sfx(it, src, dst)
        return it["id"], "made"

    with cf.ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(one, it): it["id"] for it in items}
        for f in cf.as_completed(futs):
            try:
                sid, st = f.result()
                if st == "made":
                    print(f"  [sfx] {sid}: written")
            except Exception as e:
                print(f"  [sfx] FAILED {futs[f]}: {e}", file=sys.stderr)
                failed.append(futs[f])
    if failed:
        print(f"[sfx] failed: {failed}")


# ----------------------------------------------------------------- verify
def cmd_verify(args):
    rep = load_json(REPORT_JSON, {})
    voice_rows, sfx_rows, missing, problems = {}, {}, [], []
    for persona, ln in spec.voice_jobs():
        path = spec.voice_path(persona, ln["id"])
        key = f"{persona}/{ln['id']}"
        if not os.path.exists(path):
            missing.append(os.path.relpath(path, spec.ROOT))
            continue
        p = dsp.probe(path)
        x = dsp.decode(path)
        I, TP = dsp.loudness(x)
        lead = dsp.leading_silence_ms(x, rel_db=-45, floor_db=-60)
        tail = dsp.trailing_silence_ms(x, rel_db=-45, floor_db=-60)
        row = {"duration": round(p["duration"], 3), "channels": p["channels"], "sr": p["sample_rate"],
               "kbps": round(p["bit_rate"] / 1000), "lufs": round(I, 2), "tp": round(TP, 2),
               "lead_ms": round(lead, 1), "tail_ms": round(tail, 1)}
        bad = []
        if not (0.4 <= p["duration"] <= 8.0):
            bad.append("duration")
        if p["channels"] != 1 or p["sample_rate"] != 44100:
            bad.append("format")
        if abs(I - lufs_for(ln)) > (1.5 if ln["id"] in INTERJECTIONS else 0.5):
            bad.append("loudness")
        if TP > -0.5:
            bad.append("true_peak")
        if lead > 50 or tail > 150:
            bad.append("silence")
        if bad:
            problems.append((key, bad, row))
        voice_rows[key] = row
    for it in spec.sfx_items():
        path = spec.sfx_path(it["id"])
        if not os.path.exists(path):
            missing.append(os.path.relpath(path, spec.ROOT))
            continue
        p = dsp.probe(path)
        ch = 1 if it["kind"] == "sfx" else 2
        x = dsp.decode(path, channels=ch)
        I, TP = dsp.loudness(x)
        lead = dsp.leading_silence_ms(x, rel_db=-55, floor_db=-72, win_ms=1.0, min_run_ms=3.0)
        row = {"kind": it["kind"], "duration": round(p["duration"], 3), "target": it["duration"],
               "channels": p["channels"], "sr": p["sample_rate"], "kbps": round(p["bit_rate"] / 1000),
               "lufs": round(I, 2), "tp": round(TP, 2), "peak": round(dsp.sample_peak_db(x), 2),
               "lead_ms": round(lead, 1), "model": load_json(sfx_raw_path(it["id"]) + ".json", {}).get("model")}
        bad = []
        if p["channels"] != ch or p["sample_rate"] != 44100:
            bad.append("format")
        if it["loop"]:
            seam = dsp.loop_seam_report(x)
            row["loop_seam"] = {k: round(v, 4) for k, v in seam.items()}
            row["decoded_samples"] = x.shape[1]
            if seam["seam_ratio"] > 1.0 or abs(seam["rms_tail_db"] - seam["rms_head_db"]) > 3.0:
                bad.append("loop_seam")
            if abs(I - AMBIENT_LUFS) > 1.0:
                bad.append("loudness")
            if abs(p["duration"] - it["duration"]) > 0.2:
                bad.append("duration")
        elif it["kind"] == "stinger":
            if abs(I - STINGER_LUFS) > 1.0:
                bad.append("loudness")
            if lead > 20:
                bad.append("lead")
        else:
            capped = I > SFX_MAX_LUFS - 0.7
            if row["peak"] > SFX_PEAK + 0.5 or (not capped and abs(row["peak"] - SFX_PEAK) > 0.5):
                bad.append("peak")
            if lead > 20:
                bad.append("lead")
            if p["duration"] < 0.05 or p["duration"] > max(0.5, it["duration"]) + 0.3:
                bad.append("duration")
        if bad:
            problems.append((it["id"], bad, row))
        sfx_rows[it["id"]] = row
    rep["voice_files"] = voice_rows
    rep["sfx_files"] = sfx_rows
    rep["missing"] = missing
    rep["problems"] = [{"file": k, "issues": b, "measured": r} for k, b, r in problems]
    rep["counts"] = {"voice_expected": len(spec.voice_jobs()), "voice_present": len(voice_rows),
                     "sfx_expected": 27, "sfx_present": len(sfx_rows)}
    rep["usage"] = load_json(USAGE_JSON, {})
    rep["generated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save_json(REPORT_JSON, rep)
    print(json.dumps(rep["counts"]))
    durs = [r["duration"] for r in voice_rows.values()]
    if durs:
        print(f"voice durations: min {min(durs):.2f}s  median {np.median(durs):.2f}s  max {max(durs):.2f}s")
        lufs = [r["lufs"] for r in voice_rows.values()]
        print(f"voice loudness: {min(lufs):.1f} .. {max(lufs):.1f} LUFS; max TP {max(r['tp'] for r in voice_rows.values()):.2f} dBTP")
    for k, r in sfx_rows.items():
        print(f"  {k:18} {r['kind']:8} {r['duration']:6.2f}s (target {r['target']:5.2f}) ch={r['channels']} "
              f"lufs={r['lufs']:6.1f} peak={r['peak']:5.1f} lead={r['lead_ms']:4.1f}ms {r.get('model') or ''}"
              + (f" seam={r['loop_seam']['seam_ratio']:.2f}" if 'loop_seam' in r else ""))
    if missing:
        print("MISSING:", missing)
    for k, b, r in problems:
        print("PROBLEM:", k, b, r)
    return not missing and not problems


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    pv = sub.add_parser("voice")
    pv.add_argument("--persona", nargs="*")
    pv.add_argument("--line", nargs="*")
    pv.add_argument("--reroll", action="store_true", help="discard cached takes and request new ones")
    pv.add_argument("--takes", type=int, help="make sure at least N takes exist, then re-pick the best")
    ps = sub.add_parser("sfx")
    ps.add_argument("--id", nargs="*")
    sub.add_parser("verify")
    pa = sub.add_parser("all")
    for p in (pv, ps, pa):
        p.add_argument("--force", action="store_true", help="regenerate even if the output exists")
        p.add_argument("--reprocess", action="store_true",
                       help="rebuild outputs from cached raw takes (no API calls for cached items)")
    pa.set_defaults(persona=None, line=None, id=None, takes=None, reroll=False)
    args = ap.parse_args()
    if args.cmd == "voice":
        cmd_voice(args)
    elif args.cmd == "sfx":
        cmd_sfx(args)
    elif args.cmd == "verify":
        sys.exit(0 if cmd_verify(args) else 1)
    else:
        cmd_voice(args)
        cmd_sfx(args)
        sys.exit(0 if cmd_verify(args) else 1)


if __name__ == "__main__":
    main()

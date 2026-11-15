#!/usr/bin/env python3
"""Transcribe the shipped voice files (local whisper.cpp, forced Croatian) and
compare with the §9.3 subtitles. Writes tools/audio/stt_check.json."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spec  # noqa: E402
import stt  # noqa: E402
from design_voices import similarity  # noqa: E402


def main():
    out = {}
    for persona, ln in spec.voice_jobs():
        path = spec.voice_path(persona, ln["id"])
        if not os.path.exists(path):
            continue
        r = stt.transcribe(path, "hr") or {}
        out[f"{persona}/{ln['id']}"] = {"expected": ln["subtitle"], "heard": r.get("text"),
                                        "similarity": round(similarity(r.get("text") or "", ln["subtitle"]), 3),
                                        "stt": r.get("_model")}
    with open(os.path.join(HERE, "stt_check.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    sims = sorted(out.items(), key=lambda kv: kv[1]["similarity"])
    print(f"{len(out)} files; median similarity {sorted(v['similarity'] for v in out.values())[len(out)//2]:.2f}")
    for k, v in sims[:15]:
        print(f"  {v['similarity']:.2f} {k:26} heard={v['heard']!r}  expected={v['expected']!r}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Objective check that the three persona voices differ (pitch, roughness,
tempo, timbre) using the 28 lines all personas share. Writes
tools/audio/voice_compare.json and prints a summary."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np  # noqa: E402

import dsp  # noqa: E402
import spec  # noqa: E402

CALM = {"gledaj_i_uci", "sidi_misaj", "srice_nima", "same_lisine", "sta_si_mislija", "ajme_majko"}


def vowels(s):
    return sum(ch in "aeiou" for ch in s.lower())


def main():
    common = [ln for ln in spec.voice_lines() if ln["personas"] == spec.PERSONAS]
    stats, profiles = {}, {}
    for p in spec.PERSONAS:
        f0_all, f0_calm, ap, rate, cent, cep_all, cep_calm = [], [], [], [], [], [], []
        profiles[p] = {}
        for ln in common:
            x = dsp.decode(spec.voice_path(p, ln["id"]))
            ps = dsp.pitch_stats(x)
            s, e = dsp.find_bounds(x, rel_db=-45, floor_db=-60)
            if ps.get("f0_median"):
                f0_all.append(ps["f0_median"])
                ap.append(ps["aperiodicity"])
                if ln["id"] in CALM:
                    f0_calm.append(ps["f0_median"])
            cf0 = dsp.cepstral_f0(x)
            if cf0:
                cep_all.append(cf0)
                if ln["id"] in CALM:
                    cep_calm.append(cf0)
            rate.append(vowels(ln["subtitle"]) / max(0.2, (e - s) / dsp.SR))
            cent.append(dsp.spectral_centroid(x))
            profiles[p][ln["id"]] = dsp.mfcc_profile(x)
        stats[p] = {"f0_yin_median_all": float(np.median(f0_all)), "f0_yin_median_calm": float(np.median(f0_calm)),
                    "f0_cepstral_median_all": float(np.median(cep_all)),
                    "f0_cepstral_median_calm": float(np.median(cep_calm)),
                    "aperiodicity": float(np.median(ap)), "vowels_per_s": float(np.median(rate)),
                    "centroid_hz": float(np.median(cent))}
    # Same line, different persona vs same persona, different line.
    cross, within = {}, {}
    ids = [ln["id"] for ln in common]
    for i, a in enumerate(spec.PERSONAS):
        for b in spec.PERSONAS[i + 1:]:
            cross[f"{a}-{b}"] = float(np.median([dsp.profile_distance(profiles[a][l], profiles[b][l]) for l in ids]))
        within[a] = float(np.median([dsp.profile_distance(profiles[a][l1], profiles[a][l2])
                                     for j, l1 in enumerate(ids) for l2 in ids[j + 1:]]))
    # Nearest-voice identification: pooled profile per persona from even
    # lines, classify each odd line by nearest pooled profile.
    def pooled(p, sel):
        m = np.mean([profiles[p][l]["mean"] for l in sel], axis=0)
        s = np.mean([profiles[p][l]["std"] for l in sel], axis=0)
        return {"mean": m.tolist(), "std": s.tolist()}
    train, test = ids[::2], ids[1::2]
    ref = {p: pooled(p, train) for p in spec.PERSONAS}
    correct = total = 0
    for p in spec.PERSONAS:
        for l in test:
            guess = min(spec.PERSONAS, key=lambda q: dsp.profile_distance(profiles[p][l], ref[q]))
            correct += guess == p
            total += 1
    out = {"per_persona": stats, "mfcc_distance_same_line_cross_persona": cross,
           "mfcc_distance_same_persona_cross_line": within,
           "nearest_profile_identification": f"{correct}/{total}"}
    with open(os.path.join(HERE, "voice_compare.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()

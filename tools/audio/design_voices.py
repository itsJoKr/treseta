#!/usr/bin/env python3
"""One-time persona voice casting (ElevenLabs Voice Design, §9.2).

Steps (each is idempotent; results are cached in tools/audio/work/ and the
chosen ids end up in tools/audio/voices.json):

  design    generate Voice Design previews for each persona brief
  evaluate  transcribe + analyse every preview (language, accuracy, pitch)
  save      save chosen previews as account voices (candidates)
  test      render a few real game lines per candidate with eleven_v4
  choose    record the chosen voice id per persona in voices.json

Run with tools/.venv/bin/python.
"""
import argparse
import base64
import difflib
import json
import os
import re
import sys
import time
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import el_api  # noqa: E402
import dsp  # noqa: E402
import spec  # noqa: E402
import stt  # noqa: E402

WORK = os.path.join(HERE, "work")
DESIGN_DIR = os.path.join(WORK, "design")
TEST_DIR = os.path.join(WORK, "voice_tests")
VOICES_JSON = os.path.join(HERE, "voices.json")

DESIGN_MODEL = "eleven_ttv_v3"

BRIEFS = {
    "barba": {
        "name": "Treseta Barba (old fisherman)",
        "description": (
            "An elderly Croatian man of about 72 from the Dalmatian coast, a retired fisherman. "
            "Deep, gravelly, smoky voice worn rough by decades of cigarettes and sea wind; slow, "
            "grumbling delivery with dry, sarcastic humour and a wheezy laugh. Native Croatian "
            "speaker with a strong coastal Dalmatian ikavian accent and a lazy southern sing-song "
            "intonation. Close-up, intimate recording in a quiet stone tavern."
        ),
        "text": (
            "Eee, mali moj... Ja san ovu trešetu igra' još dok ti nisi zna ni hodat. "
            "Ajde, sidi, mišaj karte, ali polako, nije ovo riba da ti pobigne. "
            "[wheezy laugh] Šta me gledaš? Igraj više, jarca ti! "
            "Ma ne mogu virovat, opet same lišine..."
        ),
    },
    "gazda": {
        "name": "Treseta Gazda (tavern owner)",
        "description": (
            "A big, booming Croatian man of about 55, the owner of a tavern on the Dalmatian coast. "
            "Chesty, loud and theatrical rich baritone; shouts easily, laughs loudly from the belly, "
            "warm and generous underneath. Native Croatian speaker with a strong coastal Dalmatian "
            "accent and lively, expressive southern intonation. Close-up recording, full and present."
        ),
        "text": (
            "E, dobro došli u moju konobu! Ovdi se pije, ovdi se piva i ovdi se igra trešeta! "
            "[laughs loudly] Ali znaj jedno, prijatelju: u mojoj konobi ja dobivan! "
            "Ajde, sidaj, nalij rakiju, pa da vidimo šta znaš. Jebate led, ko je ovo mišaja?!"
        ),
    },
    "mali": {
        "name": "Treseta Mali (sly young guy)",
        "description": (
            "A cheeky young Croatian guy of about 22 from Split on the Dalmatian coast. Quick, "
            "slightly nasal light tenor voice; mocking and giggly, cocky and street-smart, fast "
            "playful delivery. Native Croatian speaker with a strong coastal Dalmatian accent and "
            "casual street slang. Close-up recording."
        ),
        "text": (
            "Ej brate, šta je bilo, a? [giggles] Ka' da ditetu bombone otimam, iskreno. "
            "Ajde, ajde, igraj više, oćeš danas ili sutra? Ma vidi ga, sav se zacrvenija! "
            "Lipo, lipo... daj to ovamo, nemoj plakat."
        ),
    },
}

# Second-round briefs (same §9.2 personas, wording pushed further where the
# first round drifted: gazda came out high-pitched, mali too close to barba).
BRIEFS_V2 = {
    "barba": {
        "description": (
            "A 72-year-old Croatian fisherman from a small island village in Dalmatia. Very deep, "
            "low, gravelly and smoky old man's voice with a rough rasp and audible age, slightly "
            "hoarse; slow, grumbling, unhurried delivery, dry sarcastic humour and a wheezy, "
            "coughing laugh. Native Croatian speaker with a broad coastal Dalmatian ikavian accent. "
            "Close-up recording."
        ),
    },
    "gazda": {
        "description": (
            "A big, heavy-set Croatian man of about 55, owner of a tavern in Split, Dalmatia. Deep, "
            "chesty, booming bass-baritone that stays low and resonant even when he shouts; loud, "
            "theatrical and boisterous, big belly laugh, warm and generous underneath. Native "
            "Croatian speaker with a strong coastal Dalmatian accent. Close-up recording, full and "
            "present."
        ),
        "text": (
            "E, dobro došli, dobro došli u moju konobu. Sidite, sidite, ovdi se pije i ovdi se "
            "igra trešeta. [laughs heartily] Ali znaj jedno, prijatelju moj: u mojoj konobi ja "
            "dobivan! Ajde, nalij rakiju, pa da vidimo šta znaš. Jebate led, ko je ovo mišaja?!"
        ),
    },
    "mali": {
        "description": (
            "A cheeky 22-year-old Croatian guy from Split, Dalmatia. Light, youthful, higher-pitched "
            "tenor voice, noticeably nasal and twangy; quick, mocking and giggly, cocky street-smart "
            "attitude, fast playful delivery with lots of energy. Native Croatian speaker with a "
            "strong coastal Dalmatian accent and street slang. Close-up recording."
        ),
    },
}

# Third round for gazda only: rounds 1-2 drifted into a raised, high shout
# (median F0 ~260 Hz). Describe the low register and leave loudness to the
# per-line audio tags.
BRIEFS_V3 = {
    "gazda": {
        "description": (
            "A big, heavy-set Croatian man of about 55, the owner of a tavern in Split, Dalmatia. "
            "Low, deep, chesty bass voice with a big resonant chest tone, like a large barrel-chested "
            "man; theatrical, expansive and full of himself, hearty deep belly laugh, warm and "
            "generous underneath. Speaks in a low register. Native Croatian speaker with a strong "
            "coastal Dalmatian accent. Close-up recording."
        ),
        "text": (
            "E, dobro došli u moju konobu, prijatelju. Sidi, sidi, ovdi se pije i ovdi se igra "
            "trešeta. [laughs heartily] Ali znaj jedno, u mojoj konobi ja dobivan. Ajde, nalij "
            "rakiju, pa da vidimo šta znaš. Jebate led, ko je ovo mišaja?"
        ),
    },
}
BRIEFS_V3["mali"] = {
    "description": (
        "A cheeky, skinny 22-year-old Croatian lad from Split, Dalmatia. High-pitched, boyish, "
        "bright and thin young voice, clearly nasal; quick-talking, mocking and giggly, a cocky "
        "street-smart joker who teases constantly, fast playful delivery. Native Croatian speaker "
        "with a strong coastal Dalmatian accent and street slang. Close-up recording."
    ),
}
VARIANTS = {"v2": BRIEFS_V2, "v3": BRIEFS_V3}

SEEDS = [11, 23]

# Real game lines used to audition candidates (2-3 per persona, varied tags).
TEST_LINES = {
    "barba": ["jebem_ti_mliko", "lipo_daj_ovamo", "ka_riba", "sidi_misaj"],
    "gazda": ["jebem_ti_mliko", "lipo_daj_ovamo", "u_mojoj_konobi", "sidi_misaj"],
    "mali": ["jebem_ti_mliko", "lipo_daj_ovamo", "ka_bombone", "sidi_misaj"],
}

VOICE_SETTINGS = {"stability": 0.35, "similarity_boost": 0.75, "style": 0.6, "use_speaker_boost": True}


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def norm_text(s):
    s = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", s)
    s = unicodedata.normalize("NFC", s.lower())
    s = re.sub(r"[^\w\s]", " ", s)
    return " ".join(s.split())


def similarity(a, b):
    return difflib.SequenceMatcher(None, norm_text(a), norm_text(b), autojunk=False).ratio()


# ----------------------------------------------------------------- design
def cmd_design(args):
    meta_path = os.path.join(DESIGN_DIR, "design.json")
    meta = load_json(meta_path, {})
    for persona in args.personas:
        brief = dict(BRIEFS[persona])
        if args.variant != "v1":
            if persona not in VARIANTS[args.variant]:
                continue
            brief.update(VARIANTS[args.variant][persona])
        for seed in args.seeds:
            tag = f"s{seed}" if args.variant == "v1" else f"{args.variant}s{seed}"
            key = f"{persona}_{tag}"
            if key in meta and not args.force:
                print(f"[design] {key}: cached")
                continue
            print(f"[design] {key}: requesting previews ...")
            r = el_api.request("POST", "/v1/text-to-voice/design", json_body={
                "voice_description": brief["description"], "model_id": DESIGN_MODEL,
                "text": brief["text"], "seed": seed, "loudness": 0.5,
                "guidance_scale": args.guidance,
            }, query={"output_format": "mp3_44100_128"}, timeout=300)
            entries = []
            for i, pv in enumerate(r.get("previews", [])):
                fn = os.path.join(DESIGN_DIR, persona, f"{tag}_{i}.mp3")
                os.makedirs(os.path.dirname(fn), exist_ok=True)
                with open(fn, "wb") as fh:
                    fh.write(base64.b64decode(pv["audio_base_64"]))
                entries.append({"file": os.path.relpath(fn, HERE), "generated_voice_id": pv["generated_voice_id"],
                                "duration": pv.get("duration_secs"), "language": pv.get("language")})
            meta[key] = {"persona": persona, "seed": seed, "model": DESIGN_MODEL,
                         "variant": args.variant, "description": brief["description"],
                         "guidance_scale": args.guidance, "text": r.get("text"),
                         "created": time.time(), "previews": entries}
            save_json(meta_path, meta)
            print(f"[design] {key}: {len(entries)} previews")


# --------------------------------------------------------------- evaluate
def evaluate_clip(path, ref_text, language_code=None):
    x = dsp.decode(path)
    a = dsp.analyze(x)
    st = stt.transcribe(path, language_code) or {}
    a.update({"stt_text": st.get("text"), "stt_lang": st.get("language_code"),
              "stt_lang_p": st.get("language_probability"), "stt_model": st.get("_model"),
              "similarity": similarity(st.get("text", ""), ref_text)})
    return a


def cmd_evaluate(args):
    meta = load_json(os.path.join(DESIGN_DIR, "design.json"), {})
    ev_path = os.path.join(DESIGN_DIR, "evaluation.json")
    ev = load_json(ev_path, {})
    for key, m in meta.items():
        if m["persona"] not in args.personas:
            continue
        for i, pv in enumerate(m["previews"]):
            pk = f"{key}_{i}"
            if pk in ev and not args.force:
                continue
            ev[pk] = evaluate_clip(os.path.join(HERE, pv["file"]), m["text"])
            ev[pk]["generated_voice_id"] = pv["generated_voice_id"]
            ev[pk]["persona"] = m["persona"]
            save_json(ev_path, ev)
    print_eval(ev, args.personas)


def print_eval(ev, personas):
    print(f"{'preview':16} {'lang':>4} {'p':>5} {'sim':>5} {'f0med':>6} {'f0p10':>6} {'f0p90':>6} "
          f"{'stSD':>5} {'aper':>5} {'cent':>6} {'dur':>5}")
    for pk in sorted(ev):
        e = ev[pk]
        if e.get("persona") not in personas:
            continue
        print(f"{pk:16} {e.get('stt_lang') or '':>4} {e.get('stt_lang_p') or 0:5.2f} {e['similarity']:5.2f} "
              f"{e.get('f0_median', 0):6.0f} {e.get('f0_p10', 0):6.0f} {e.get('f0_p90', 0):6.0f} "
              f"{e.get('f0_semitone_sd', 0):5.1f} {e.get('aperiodicity', 0):5.2f} {e['centroid_hz']:6.0f} "
              f"{e['duration']:5.1f}")
        print(f"   stt: {e.get('stt_text')}")


# ------------------------------------------------------------------- save
def cmd_save(args):
    ev = load_json(os.path.join(DESIGN_DIR, "evaluation.json"), {})
    meta = load_json(os.path.join(DESIGN_DIR, "design.json"), {})
    voices = load_json(VOICES_JSON, {})
    cands = voices.setdefault("candidates", {})
    for pk in args.previews:
        if pk in cands:
            print(f"[save] {pk}: already saved as {cands[pk]['voice_id']}")
            continue
        persona = pk.split("_")[0]
        key = pk.rsplit("_", 1)[0]
        idx = int(pk.rsplit("_", 1)[1])
        gid = meta[key]["previews"][idx]["generated_voice_id"]
        brief = BRIEFS[persona]
        r = el_api.request("POST", "/v1/text-to-voice", json_body={
            "voice_name": f"{brief['name']} {pk}",
            "voice_description": meta[key].get("description", brief["description"])[:500],
            "generated_voice_id": gid,
            "labels": {"language": "hr", "accent": "dalmatian", "gender": "male", "project": "treseta"},
        })
        cands[pk] = {"persona": persona, "voice_id": r["voice_id"], "name": f"{brief['name']} {pk}",
                     "generated_voice_id": gid, "design_seed": meta[key]["seed"],
                     "design_model": meta[key]["model"], "preview": meta[key]["previews"][idx]["file"],
                     "preview_eval": {k: ev.get(pk, {}).get(k) for k in
                                      ("stt_lang", "stt_lang_p", "similarity", "f0_median", "aperiodicity")}}
        save_json(VOICES_JSON, voices)
        print(f"[save] {pk} -> {r['voice_id']}")


# ------------------------------------------------------------------- test
def cmd_test(args):
    voices = load_json(VOICES_JSON, {})
    lines = {ln["id"]: ln for ln in spec.voice_lines()}
    res_path = os.path.join(TEST_DIR, "tests.json")
    res = load_json(res_path, {})
    for pk, c in voices.get("candidates", {}).items():
        if c["persona"] not in args.personas or (args.only and pk not in args.only):
            continue
        for lid in TEST_LINES[c["persona"]]:
            rk = f"{pk}/{lid}"
            fn = os.path.join(TEST_DIR, pk, f"{lid}.mp3")
            if rk in res and os.path.exists(fn) and not args.force:
                if not args.reeval:
                    continue
                cost = res[rk].get("character_cost")
            else:
                audio, hdr = el_api.tts(c["voice_id"], lines[lid]["tts"], model_id=args.model,
                                        voice_settings=VOICE_SETTINGS)
                os.makedirs(os.path.dirname(fn), exist_ok=True)
                with open(fn, "wb") as fh:
                    fh.write(audio)
                cost = hdr.get("character-cost")
            e = evaluate_clip(fn, lines[lid]["subtitle"], language_code="hr")
            auto = stt.transcribe(fn, None) or {}
            e["auto_lang"], e["auto_lang_p"] = auto.get("language_code"), auto.get("language_probability")
            e["character_cost"] = cost
            res[rk] = e
            save_json(res_path, res)
    print(f"{'candidate/line':34} {'lang':>4} {'p':>5} {'sim':>5} {'f0med':>6} {'stSD':>5} {'aper':>5} {'cent':>6} {'dur':>5}")
    for rk in sorted(res):
        e = res[rk]
        if rk.split("_")[0] not in args.personas:
            continue
        print(f"{rk:34} {e.get('auto_lang') or '':>4} {e.get('auto_lang_p') or 0:5.2f} {e['similarity']:5.2f} "
              f"{e.get('f0_median', 0):6.0f} {e.get('f0_semitone_sd', 0):5.1f} {e.get('aperiodicity', 0):5.2f} "
              f"{e['centroid_hz']:6.0f} {e['duration']:5.1f}   {e.get('stt_text')}")


def cmd_choose(args):
    voices = load_json(VOICES_JSON, {})
    c = voices["candidates"][args.preview]
    meta = load_json(os.path.join(DESIGN_DIR, "design.json"), {})
    dkey = args.preview.rsplit("_", 1)[0]
    voices.setdefault("personas", {})[c["persona"]] = {
        "voice_id": c["voice_id"], "name": c["name"], "source": "ElevenLabs Voice Design",
        "design_model": c["design_model"], "design_seed": c["design_seed"],
        "brief": meta.get(dkey, {}).get("description", BRIEFS[c["persona"]]["description"]),
        "candidate_key": args.preview,
        "tts_model": "eleven_v4", "language_code": "hr", "voice_settings": VOICE_SETTINGS,
        "note": args.note or "",
    }
    save_json(VOICES_JSON, voices)
    print(f"[choose] {c['persona']} = {c['voice_id']} ({args.preview})")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("design"); p.add_argument("--seeds", type=int, nargs="+", default=SEEDS)
    p.add_argument("--guidance", type=float, default=5.0)
    p.add_argument("--variant", default="v1", choices=["v1", "v2", "v3"])
    p = sub.add_parser("evaluate")
    p = sub.add_parser("save"); p.add_argument("previews", nargs="+")
    p = sub.add_parser("test"); p.add_argument("--model", default="eleven_v4")
    p.add_argument("--reeval", action="store_true")
    p.add_argument("--only", nargs="*")
    p = sub.add_parser("choose"); p.add_argument("preview"); p.add_argument("--note")
    for sp in sub.choices.values():
        sp.add_argument("--personas", nargs="+", default=spec.PERSONAS)
        sp.add_argument("--force", action="store_true")
    args = ap.parse_args()
    {"design": cmd_design, "evaluate": cmd_evaluate, "save": cmd_save, "test": cmd_test,
     "choose": cmd_choose}[args.cmd](args)


if __name__ == "__main__":
    main()

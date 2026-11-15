"""Speech-to-text used only to QA generated clips.

Prefers ElevenLabs speech-to-text; the current key lacks the
`speech_to_text` permission, so it falls back to a local whisper.cpp
(`whisper-cli`) with a multilingual ggml model. If neither is available,
transcription is skipped (returns None) and QA relies on the acoustic checks.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile

import el_api

WHISPER_CLI = os.environ.get("WHISPER_CLI", shutil.which("whisper-cli") or "/opt/homebrew/bin/whisper-cli")
_DEFAULT_MODELS = [
    os.path.expanduser("~/Library/Application Support/@sayspec/desktop/transcription-models/ggml-small-q5_1.bin"),
]
WHISPER_MODEL = os.environ.get("WHISPER_MODEL") or next((m for m in _DEFAULT_MODELS if os.path.exists(m)), None)
FFMPEG = os.environ.get("FFMPEG", "/opt/homebrew/bin/ffmpeg")

_el_ok = os.environ.get("TRESETA_EL_STT", "1") == "1"
_LANG_RE = re.compile(r"auto-detected language:\s*(\w+)\s*\(p\s*=\s*([\d.]+)\)")


def _whisper(path, language=None):
    if not (WHISPER_MODEL and os.path.exists(WHISPER_CLI)):
        return None
    d = tempfile.mkdtemp(prefix="treseta_stt_")
    try:
        wav = os.path.join(d, "in.wav")
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", path, "-af", "apad=pad_dur=0.5",
                        "-ar", "16000", "-ac", "1", wav], check=True)
        base = os.path.join(d, "out")
        p = subprocess.run([WHISPER_CLI, "-m", WHISPER_MODEL, "-l", language or "auto", "-oj",
                            "-of", base, "-nt", "-f", wav], capture_output=True, text=True)
        if p.returncode != 0 or not os.path.exists(base + ".json"):
            return None
        with open(base + ".json", encoding="utf-8") as fh:
            j = json.load(fh)
        text = " ".join(s.get("text", "").strip() for s in j.get("transcription", [])).strip()
        m = _LANG_RE.search(p.stderr or "")
        return {"text": text, "language_code": (m.group(1) if m else (j.get("result") or {}).get("language")),
                "language_probability": float(m.group(2)) if m else None, "_model": "whisper.cpp:" +
                os.path.basename(WHISPER_MODEL)}
    finally:
        shutil.rmtree(d, ignore_errors=True)


def transcribe(path, language=None):
    global _el_ok
    if _el_ok:
        try:
            with open(path, "rb") as fh:
                return el_api.transcribe(fh.read(), language_code=language)
        except el_api.ApiError as e:
            if e.status in (401, 403):
                _el_ok = False
            else:
                raise
    return _whisper(path, language)


def available():
    return _el_ok or bool(WHISPER_MODEL and os.path.exists(WHISPER_CLI))

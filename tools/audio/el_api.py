"""Minimal ElevenLabs HTTP client (stdlib only).

The API key is read at runtime from KEY_PATH and is never printed, logged,
written to disk or put into a URL.
"""
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API_ROOT = "https://api.elevenlabs.io"
KEY_PATH = os.environ.get(
    "ELEVENLABS_KEY_FILE", str(Path(__file__).resolve().parents[2] / ".secrets" / "elevenlabs.key")
)

_key = None


def _api_key():
    global _key
    if _key is None:
        with open(KEY_PATH, "r", encoding="utf-8") as fh:
            _key = fh.read().strip()
        if not _key:
            raise RuntimeError("ElevenLabs key file is empty")
    return _key


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body[:600]}")
        self.status = status
        self.body = body


def request(method, path, *, json_body=None, query=None, data=None,
            content_type=None, accept="application/json", raw=False,
            retries=6, timeout=180, return_headers=False):
    """Do one API call with retry/backoff on 429/5xx and network errors."""
    url = API_ROOT + path
    if query:
        from urllib.parse import urlencode
        url += "?" + urlencode(query)
    headers = {"xi-api-key": _api_key(), "Accept": accept}
    body = None
    if json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif data is not None:
        body = data
        if content_type:
            headers["Content-Type"] = content_type
    delay = 2.0
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = resp.read()
                hdrs = dict(resp.headers.items())
                result = payload if raw else (json.loads(payload) if payload else None)
                return (result, hdrs) if return_headers else result
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                ra = e.headers.get("Retry-After")
                wait = float(ra) if ra and ra.replace(".", "").isdigit() else delay
                wait += random.uniform(0, 1.0)
                print(f"  [api] {method} {path} -> {e.code}, retry in {wait:.1f}s",
                      file=sys.stderr)
                time.sleep(wait)
                delay = min(delay * 2, 60)
                continue
            raise ApiError(e.code, text)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt < retries:
                print(f"  [api] {method} {path} network error {e!r}, retry in {delay:.1f}s",
                      file=sys.stderr)
                time.sleep(delay)
                delay = min(delay * 2, 60)
                continue
            raise


def multipart(fields, files):
    """Build a multipart/form-data body. files: {name: (filename, bytes, ctype)}."""
    boundary = "----el" + uuid.uuid4().hex
    out = bytearray()
    for k, v in fields.items():
        out += f"--{boundary}\r\n".encode()
        out += f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode()
        out += str(v).encode("utf-8") + b"\r\n"
    for k, (fname, blob, ctype) in files.items():
        out += f"--{boundary}\r\n".encode()
        out += (f'Content-Disposition: form-data; name="{k}"; filename="{fname}"\r\n'
                f"Content-Type: {ctype}\r\n\r\n").encode()
        out += blob + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def subscription():
    return request("GET", "/v1/user/subscription")


def char_usage():
    s = subscription()
    return s.get("character_count"), s.get("character_limit")


STT_MODELS = ["scribe_v2", "scribe_v1"]
_stt_model = None


def transcribe(audio_bytes, language_code=None, filename="clip.mp3", tag_audio_events=True):
    """Speech-to-text. Returns dict with text, language_code, language_probability."""
    global _stt_model
    models = [_stt_model] if _stt_model else STT_MODELS
    last = None
    for m in models:
        fields = {"model_id": m, "tag_audio_events": "true" if tag_audio_events else "false",
                  "timestamps_granularity": "none"}
        if language_code:
            fields["language_code"] = language_code
        body, ctype = multipart(fields, {"file": (filename, audio_bytes, "audio/mpeg")})
        try:
            r = request("POST", "/v1/speech-to-text", data=body, content_type=ctype)
            _stt_model = m
            r["_model"] = m
            return r
        except ApiError as e:
            last = e
            if e.status in (400, 422) and "model" in e.body.lower():
                continue
            raise
    raise last


def tts(voice_id, text, model_id="eleven_v4", language_code="hr", voice_settings=None,
        seed=None, output_format="mp3_44100_128"):
    body = {"text": text, "model_id": model_id}
    if language_code:
        body["language_code"] = language_code
    if voice_settings:
        body["voice_settings"] = voice_settings
    if seed is not None:
        body["seed"] = seed
    audio, headers = request("POST", f"/v1/text-to-speech/{voice_id}", json_body=body,
                             query={"output_format": output_format}, accept="audio/mpeg",
                             raw=True, return_headers=True)
    return audio, headers


def sound_generation(text, duration_seconds=None, prompt_influence=0.5, loop=False,
                     model_id=None, output_format="mp3_44100_128"):
    body = {"text": text, "prompt_influence": prompt_influence}
    if duration_seconds is not None:
        body["duration_seconds"] = duration_seconds
    if loop:
        body["loop"] = True
    if model_id:
        body["model_id"] = model_id
    audio, headers = request("POST", "/v1/sound-generation", json_body=body,
                             query={"output_format": output_format}, accept="audio/mpeg",
                             raw=True, return_headers=True)
    return audio, headers

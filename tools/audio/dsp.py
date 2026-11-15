"""Audio helpers: ffmpeg decode/encode, loudness, trimming, loops, analysis.

Needs numpy (tools/.venv) and ffmpeg/ffprobe.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile

import numpy as np

FFMPEG = os.environ.get("FFMPEG", "/opt/homebrew/bin/ffmpeg")
FFPROBE = os.environ.get("FFPROBE", shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe")
SR = 44100


# --------------------------------------------------------------------------- io
def decode(src, sr=SR, channels=1):
    """Decode any audio file (path or bytes) to float32 array (channels, n)."""
    cmd = [FFMPEG, "-v", "error", "-i", "pipe:0" if isinstance(src, (bytes, bytearray)) else src,
           "-f", "f32le", "-acodec", "pcm_f32le", "-ac", str(channels), "-ar", str(sr), "pipe:1"]
    p = subprocess.run(cmd, input=src if isinstance(src, (bytes, bytearray)) else None,
                       capture_output=True, check=True)
    x = np.frombuffer(p.stdout, dtype=np.float32)
    return x.reshape(-1, channels).T.copy()


def encode_mp3(x, path, sr=SR, bitrate="128k"):
    """Encode float array (channels, n) to mp3 44.1 kHz CBR."""
    x = np.atleast_2d(x).astype(np.float32)
    ch = x.shape[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp.mp3"
    cmd = [FFMPEG, "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", str(ch),
           "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", bitrate, "-ar", str(sr),
           "-ac", str(ch), "-map_metadata", "-1", "-id3v2_version", "0", "-write_xing", "1", tmp]
    subprocess.run(cmd, input=np.ascontiguousarray(x.T).tobytes(), check=True)
    os.replace(tmp, path)


def write_wav(x, path, sr=SR):
    x = np.atleast_2d(x).astype(np.float32)
    cmd = [FFMPEG, "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", str(x.shape[0]),
           "-i", "pipe:0", "-c:a", "pcm_f32le", path]
    subprocess.run(cmd, input=np.ascontiguousarray(x.T).tobytes(), check=True)


def ffmpeg_filter(x, af, sr=SR):
    """Run an ffmpeg audio filter chain over an array, return array."""
    x = np.atleast_2d(x).astype(np.float32)
    ch = x.shape[0]
    cmd = [FFMPEG, "-v", "error", "-f", "f32le", "-ar", str(sr), "-ac", str(ch), "-i", "pipe:0",
           "-af", af, "-f", "f32le", "-ar", str(sr), "-ac", str(ch), "pipe:1"]
    p = subprocess.run(cmd, input=np.ascontiguousarray(x.T).tobytes(), capture_output=True, check=True)
    y = np.frombuffer(p.stdout, dtype=np.float32)
    return y.reshape(-1, ch).T.copy()


def probe(path):
    cmd = [FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        return None
    d = json.loads(p.stdout)
    st = next((s for s in d.get("streams", []) if s.get("codec_type") == "audio"), None)
    if not st:
        return None
    return {
        "codec": st.get("codec_name"), "sample_rate": int(st.get("sample_rate", 0)),
        "channels": st.get("channels"), "bit_rate": int(d["format"].get("bit_rate", 0) or 0),
        "duration": float(d["format"].get("duration", 0) or 0), "size": int(d["format"].get("size", 0)),
    }


# ----------------------------------------------------------------- loudness
_I_RE = re.compile(r"I:\s+(-?[\d.]+|-inf)\s+LUFS")
_TP_RE = re.compile(r"Peak:\s+(-?[\d.]+|-inf)\s+dBFS")


def loudness(x, sr=SR):
    """Integrated loudness (LUFS) and true peak (dBTP) via ffmpeg ebur128."""
    x = np.atleast_2d(x).astype(np.float32)
    ch = x.shape[0]
    # ebur128 gates on 400 ms blocks; pad very short clips with silence so we
    # still get a reading (silence is gated out of the integrated value).
    pad = max(0, int(0.5 * sr) - x.shape[1])
    if pad:
        x = np.concatenate([x, np.zeros((ch, pad), np.float32)], axis=1)
    cmd = [FFMPEG, "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(sr), "-ac", str(ch),
           "-i", "pipe:0", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]
    p = subprocess.run(cmd, input=np.ascontiguousarray(x.T).tobytes(), capture_output=True)
    err = p.stderr.decode("utf-8", "replace")
    summary = err[err.rfind("Summary:"):]
    mi, mt = _I_RE.search(summary), _TP_RE.search(summary)
    f = lambda m: float("-inf") if (not m or m.group(1) == "-inf") else float(m.group(1))
    return f(mi), f(mt)


def db(v):
    return 20 * np.log10(max(float(v), 1e-12))


def sample_peak_db(x):
    return db(np.max(np.abs(x))) if x.size else float("-inf")


def normalize_lufs(x, target, tp_max=-1.0, sr=SR, iters=6):
    """Constant gain to `target` LUFS; a transparent look-ahead limiter keeps
    the true peak under `tp_max` when the gain would push it over."""
    y = x.astype(np.float32)
    for _ in range(iters):
        I, TP = loudness(y, sr)
        if not np.isfinite(I):
            return y
        gain = target - I
        if abs(gain) < 0.1 and TP <= tp_max + 0.05:
            break
        y = (y * (10 ** (gain / 20))).astype(np.float32)
        if TP + gain > tp_max:
            lim = 10 ** ((tp_max - 0.6) / 20)
            # alimiter works on (oversampled) sample peaks; oversample 4x so it
            # also catches inter-sample (true) peaks.
            y = ffmpeg_filter(
                y, f"aresample={sr * 4},alimiter=limit={lim:.4f}:attack=2:release=60:level=0:latency=1,"
                   f"aresample={sr}", sr)
    return y


def normalize_peak(x, peak_db):
    p = np.max(np.abs(x))
    if p <= 0:
        return x
    return (x * (10 ** (peak_db / 20) / p)).astype(np.float32)


# ----------------------------------------------------------------- trimming
def envelope_db(x, sr=SR, win_ms=5.0):
    mono = np.mean(np.atleast_2d(x), axis=0)
    w = max(1, int(sr * win_ms / 1000))
    n = len(mono) // w
    if n == 0:
        return np.array([db(np.max(np.abs(mono)) if len(mono) else 0)]), w
    frames = mono[: n * w].reshape(n, w)
    rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-20)
    return 20 * np.log10(rms + 1e-12), w


def find_bounds(x, sr=SR, rel_db=-38.0, floor_db=-58.0, win_ms=5.0, min_run_ms=15.0):
    """Return (start, end) sample indices of the audible content.

    Content must stay above the threshold for `min_run_ms` so isolated
    blips (e.g. a decoder transient in the first window) are ignored."""
    env, w = envelope_db(x, sr, win_ms)
    n = np.atleast_2d(x).shape[1]
    thr = max(env.max() + rel_db, floor_db)
    above = env > thr
    k = max(1, int(round(min_run_ms / win_ms)))
    if len(above) >= k and k > 1:
        run = np.convolve(above.astype(int), np.ones(k, int), "valid") == k
        idx = np.where(run)[0]
        if len(idx):
            return int(idx[0] * w), int(min((idx[-1] + k) * w, n))
    idx = np.where(above)[0]
    if len(idx) == 0:
        return 0, n
    return int(idx[0] * w), int(min((idx[-1] + 1) * w, n))


def fade(x, sr, fade_in_ms=0.0, fade_out_ms=0.0):
    y = np.atleast_2d(x).copy()
    n = y.shape[1]
    fi = min(n, int(sr * fade_in_ms / 1000))
    fo = min(n, int(sr * fade_out_ms / 1000))
    if fi > 0:
        y[:, :fi] *= np.linspace(0, 1, fi, dtype=np.float32) ** 2
    if fo > 0:
        y[:, n - fo:] *= np.linspace(1, 0, fo, dtype=np.float32) ** 2
    return y


def trim(x, sr=SR, lead_ms=30.0, tail_ms=120.0, rel_db=-38.0, floor_db=-58.0,
         fade_in_ms=None, fade_out_ms=None):
    """Trim silence, keep `lead_ms` before and `tail_ms` after the content."""
    x = np.atleast_2d(x)
    s, e = find_bounds(x, sr, rel_db, floor_db)
    s2 = max(0, s - int(sr * lead_ms / 1000))
    e2 = min(x.shape[1], e + int(sr * tail_ms / 1000))
    y = x[:, s2:e2]
    fi = lead_ms if fade_in_ms is None else fade_in_ms
    fo = tail_ms * 0.8 if fade_out_ms is None else fade_out_ms
    return fade(y, sr, fi, fo)


def leading_silence_ms(x, sr=SR, rel_db=-38.0, floor_db=-58.0, win_ms=5.0, min_run_ms=15.0):
    s, _ = find_bounds(x, sr, rel_db, floor_db, win_ms=win_ms, min_run_ms=min_run_ms)
    return 1000.0 * s / sr


def trailing_silence_ms(x, sr=SR, rel_db=-38.0, floor_db=-58.0, win_ms=5.0):
    _, e = find_bounds(x, sr, rel_db, floor_db, win_ms=win_ms)
    return 1000.0 * (np.atleast_2d(x).shape[1] - e) / sr


# -------------------------------------------------------------------- loops
def make_loop(x, sr=SR, xfade_s=1.5):
    """Seamless loop: crossfade the last `xfade_s` into the head (equal power).

    Output length = len(x) - xfade. The end of the output flows straight into
    x[L-X], which is exactly what the head starts with (fade-out weight 1)."""
    x = np.atleast_2d(x).astype(np.float32)
    L = x.shape[1]
    X = int(sr * xfade_s)
    t = np.linspace(0, np.pi / 2, X, dtype=np.float32)
    fin, fout = np.sin(t), np.cos(t)
    out = x[:, : L - X].copy()
    out[:, :X] = x[:, :X] * fin + x[:, L - X:] * fout
    return out


def loop_seam_report(x, sr=SR):
    """Compare the jump across the loop seam with typical sample-to-sample steps."""
    x = np.atleast_2d(x)
    d = np.abs(np.diff(x, axis=1))
    typical = float(np.percentile(d, 99.5))
    seam = float(np.max(np.abs(x[:, 0] - x[:, -1])))
    w = int(0.05 * sr)
    rms = lambda a: db(np.sqrt(np.mean(a ** 2)) + 1e-12)
    return {
        "seam_step": seam, "p99_5_step": typical, "seam_ratio": seam / (typical + 1e-12),
        "rms_tail_db": rms(x[:, -w:]), "rms_head_db": rms(x[:, :w]),
    }


# ----------------------------------------------------------------- analysis
def _yin_frame(f, sr, fmin=60.0, fmax=420.0, thr=0.15):
    tau_min, tau_max = int(sr / fmax), int(sr / fmin)
    n = len(f) - tau_max
    if n <= 0:
        return None, 1.0
    d = np.array([np.sum((f[:n] - f[t:t + n]) ** 2) for t in range(tau_max + 1)])
    cm = np.ones_like(d)
    cs = np.cumsum(d[1:])
    cm[1:] = d[1:] * np.arange(1, len(d)) / np.maximum(cs, 1e-12)
    seg = cm[tau_min:]
    below = np.where(seg < thr)[0]
    if len(below):
        i = below[0]
        while i + 1 < len(seg) and seg[i + 1] < seg[i]:
            i += 1
    else:
        i = int(np.argmin(seg))
        if seg[i] > 0.35:
            return None, float(seg[i])
    tau = i + tau_min
    if 1 <= tau < len(cm) - 1:  # parabolic interpolation
        a, b, c = cm[tau - 1], cm[tau], cm[tau + 1]
        den = a - 2 * b + c
        tau = tau + (0.5 * (a - c) / den if den != 0 else 0)
    return sr / tau, float(seg[i])


def pitch_stats(x, sr=SR):
    """F0 statistics via YIN (40 ms frames, 60-420 Hz) plus aperiodicity
    (mean YIN dip; higher = breathier/rougher voice)."""
    mono = np.mean(np.atleast_2d(x), axis=0).astype(np.float64)
    sr2 = 16000
    y = decode_array_resample(mono, sr, sr2) if sr != sr2 else mono
    fl, hop = int(0.045 * sr2), int(0.01 * sr2)
    frames = [y[i:i + fl] for i in range(0, len(y) - fl, hop)]
    if not frames:
        return {"voiced_frames": 0}
    energies = np.array([np.sqrt(np.mean(f ** 2)) for f in frames])
    gate = energies.max() * 10 ** (-28 / 20)
    f0s, aps = [], []
    for f, en in zip(frames, energies):
        if en < gate:
            continue
        f0, ap = _yin_frame(f - f.mean(), sr2)
        if f0:
            f0s.append(f0)
            aps.append(ap)
    if len(f0s) < 3:
        return {"voiced_frames": len(f0s)}
    f0s = np.array(f0s)
    return {
        "f0_median": float(np.median(f0s)), "f0_p10": float(np.percentile(f0s, 10)),
        "f0_p90": float(np.percentile(f0s, 90)),
        "f0_semitone_sd": float(np.std(12 * np.log2(f0s / np.median(f0s)))),
        "aperiodicity": float(np.median(aps)), "voiced_frames": int(len(f0s)),
        "voiced_ratio": float(len(f0s) / max(1, int(np.sum(energies >= gate)))),
    }


def cepstral_f0(x, sr=SR, fmin=60.0, fmax=400.0):
    """Median F0 from the real cepstrum (more robust than YIN on rough,
    creaky voices, which make YIN jump to harmonics)."""
    mono = np.mean(np.atleast_2d(x), axis=0).astype(np.float64)
    sr2 = 16000
    y = decode_array_resample(mono, sr, sr2) if sr != sr2 else mono
    fl, hop = 1024, 160
    frames = [y[i:i + fl] for i in range(0, len(y) - fl, hop)]
    if not frames:
        return None
    en = np.array([np.sqrt(np.mean(f ** 2)) for f in frames])
    gate = en.max() * 10 ** (-20 / 20)
    lo, hi = int(sr2 / fmax), int(sr2 / fmin)
    res = []
    for f, e in zip(frames, en):
        if e < gate:
            continue
        c = np.fft.irfft(np.log(np.abs(np.fft.rfft(f * np.hanning(fl))) + 1e-9))
        res.append(sr2 / (np.argmax(c[lo:hi]) + lo))
    return float(np.median(res)) if res else None


def mfcc_profile(x, sr=SR, n_mels=40, n_mfcc=20):
    """Mean/std MFCC (c1..c19) over active frames: a crude timbre fingerprint."""
    mono = np.mean(np.atleast_2d(x), axis=0).astype(np.float64)
    sr2 = 16000
    y = decode_array_resample(mono, sr, sr2) if sr != sr2 else mono
    y = np.append(y[0], y[1:] - 0.97 * y[:-1])
    n_fft, hop = 512, 160
    frames = np.array([y[i:i + n_fft] * np.hanning(n_fft) for i in range(0, len(y) - n_fft, hop)])
    if len(frames) == 0:
        return None
    pw = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    mel = lambda f: 2595 * np.log10(1 + f / 700)
    imel = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = imel(np.linspace(mel(60), mel(7600), n_mels + 2))
    bins = np.floor((n_fft + 1) * pts / sr2).astype(int)
    fb = np.zeros((n_mels, n_fft // 2 + 1))
    for m in range(1, n_mels + 1):
        l, c, r = bins[m - 1], bins[m], bins[m + 1]
        for k in range(l, c):
            fb[m - 1, k] = (k - l) / max(1, c - l)
        for k in range(c, r):
            fb[m - 1, k] = (r - k) / max(1, r - c)
    e = np.log(pw @ fb.T + 1e-10)
    en = e.mean(axis=1)
    keep = en > en.max() - 6.0  # active frames only (log domain ~ 26 dB)
    e = e[keep]
    k = np.arange(n_mels)
    dct = np.cos(np.pi / n_mels * (k[None, :] + 0.5) * np.arange(n_mfcc)[:, None])
    c = e @ dct.T
    return {"mean": c[:, 1:].mean(axis=0).tolist(), "std": c[:, 1:].std(axis=0).tolist()}


def profile_distance(a, b):
    ma, mb = np.array(a["mean"]), np.array(b["mean"])
    sd = (np.array(a["std"]) + np.array(b["std"])) / 2 + 1e-6
    return float(np.sqrt(np.mean(((ma - mb) / sd) ** 2)))


def spectral_centroid(x, sr=SR):
    mono = np.mean(np.atleast_2d(x), axis=0)
    n = 2048
    cents = []
    for i in range(0, len(mono) - n, n // 2):
        f = mono[i:i + n] * np.hanning(n)
        m = np.abs(np.fft.rfft(f))
        if m.sum() < 1e-6:
            continue
        freqs = np.fft.rfftfreq(n, 1 / sr)
        cents.append((m * freqs).sum() / m.sum())
    return float(np.median(cents)) if cents else 0.0


def decode_array_resample(mono, sr_in, sr_out):
    x = mono[None, :].astype(np.float32)
    cmd = [FFMPEG, "-v", "error", "-f", "f32le", "-ar", str(sr_in), "-ac", "1", "-i", "pipe:0",
           "-f", "f32le", "-ar", str(sr_out), "-ac", "1", "pipe:1"]
    p = subprocess.run(cmd, input=np.ascontiguousarray(x.T).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)


def analyze(x, sr=SR):
    s, e = find_bounds(x, sr)
    d = {"duration": np.atleast_2d(x).shape[1] / sr, "active": (e - s) / sr,
         "centroid_hz": spectral_centroid(x, sr)}
    d.update(pitch_stats(x, sr))
    d["mfcc"] = mfcc_profile(x, sr)
    I, TP = loudness(x, sr)
    d["lufs"], d["tp"] = I, TP
    return d


def tmpdir():
    return tempfile.mkdtemp(prefix="treseta_audio_")

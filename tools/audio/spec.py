"""Audio contract parsed straight from docs/GAME_DESIGN.md (§9.3 and §14.2).

Parsing the design doc (the single source of truth) guarantees the TTS texts
and SFX prompts are used verbatim.
"""
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DOC = os.path.join(ROOT, "docs", "GAME_DESIGN.md")
VOICE_DIR = os.path.join(ROOT, "public", "assets", "audio", "voice")
SFX_DIR = os.path.join(ROOT, "public", "assets", "audio", "sfx")

PERSONAS = ["barba", "gazda", "mali"]
STINGERS = {"akuza_fanfare", "win_stinger", "lose_stinger"}

_TAG_RE = re.compile(r"\[[^\]]+\]\s*")


def _section(text, start_heading, end_prefix):
    i = text.index(start_heading)
    j = text.index(end_prefix, i + len(start_heading))
    return text[i:j]


def _rows(block):
    for line in block.splitlines():
        line = line.strip()
        if not line.startswith("|") or line.startswith("|---"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        yield cells


def _unbacktick(s):
    s = s.strip()
    if s.startswith("`") and s.endswith("`"):
        s = s[1:-1]
    return s


def voice_lines():
    """Return ordered list of dicts: num, id, personas(list), tts, subtitle, gloss, tag."""
    with open(DOC, encoding="utf-8") as fh:
        text = fh.read()
    block = _section(text, "### 9.3 Voice lines", "### 9.4")
    lines = []
    for cells in _rows(block):
        if len(cells) < 5 or not cells[0].isdigit():
            continue
        num, lid, personas, tts, gloss = cells[0], _unbacktick(cells[1]), cells[2], _unbacktick(cells[3]), cells[4]
        p = PERSONAS[:] if personas == "all" else [personas.strip()]
        m = re.match(r"^\[([^\]]+)\]", tts)
        lines.append({
            "num": int(num), "id": lid, "personas": p, "tts": tts,
            "subtitle": _TAG_RE.sub("", tts).strip(), "gloss": gloss.strip('"'),
            "tag": m.group(1) if m else None,
        })
    assert len(lines) == 34, f"expected 34 voice lines, parsed {len(lines)}"
    return lines


def voice_jobs():
    """(persona, line) pairs: 30 per persona, 90 total."""
    jobs = []
    lines = voice_lines()
    for persona in PERSONAS:
        for ln in lines:
            if persona in ln["personas"]:
                jobs.append((persona, ln))
    assert len(jobs) == 90, len(jobs)
    return jobs


def sfx_items():
    with open(DOC, encoding="utf-8") as fh:
        text = fh.read()
    block = _section(text, "### 14.2 Sound effects and ambience", "When each sound plays")
    items = []
    for cells in _rows(block):
        if len(cells) != 5 or not cells[0].startswith("`"):
            continue
        sid = _unbacktick(cells[0])
        loop = "yes" in cells[2].lower()
        kind = "ambience" if loop else ("stinger" if sid in STINGERS else "sfx")
        items.append({
            "id": sid, "duration": float(cells[1]), "loop": loop,
            "volume": float(cells[3]), "prompt": cells[4], "kind": kind,
        })
    assert len(items) == 27, f"expected 27 sfx/ambience items, parsed {len(items)}"
    return items


def voice_path(persona, line_id):
    return os.path.join(VOICE_DIR, persona, f"{line_id}.mp3")


def sfx_path(sid):
    return os.path.join(SFX_DIR, f"{sid}.mp3")


if __name__ == "__main__":
    for ln in voice_lines():
        print(ln["num"], ln["id"], ln["personas"], repr(ln["tts"]))
    for s in sfx_items():
        print(s["id"], s["duration"], s["loop"], s["kind"], s["prompt"][:60])

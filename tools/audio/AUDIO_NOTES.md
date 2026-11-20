# Trešeta audio: production notes

Audio agent deliverables for GAME_DESIGN.md §9 (voice personas and lines) and §14 (audio manifest).
All files were generated on 2026-11-15 with ElevenLabs and post-processed with ffmpeg and numpy.

## Status

| Set | Expected | Delivered | Path |
|---|---|---|---|
| Voice lines, `barba` | 30 | 30 | `public/assets/audio/voice/barba/<line_id>.mp3` |
| Voice lines, `gazda` | 30 | 30 | `public/assets/audio/voice/gazda/<line_id>.mp3` |
| Voice lines, `mali` | 30 | 30 | `public/assets/audio/voice/mali/<line_id>.mp3` |
| One-shot SFX and stingers | 25 | 25 | `public/assets/audio/sfx/<id>.mp3` |
| Ambience loops | 2 | 2 | `public/assets/audio/sfx/ambient_konoba.mp3`, `ambient_cicadas.mp3` |

**No files are missing or failed.** `generate_audio.py verify` passes with no problems. Measured
values for every file are in `report.json`.

## Re-running

```
tools/.venv/bin/python tools/audio/generate_audio.py all      # voices + sfx + verify (idempotent)
tools/.venv/bin/python tools/audio/generate_audio.py verify   # checks only; rewrites report.json
tools/.venv/bin/python tools/audio/generate_audio.py voice --persona mali --line tucem --takes 4   # more takes, re-pick
tools/.venv/bin/python tools/audio/generate_audio.py voice --line tucem --reroll                   # discard takes, regenerate
tools/.venv/bin/python tools/audio/generate_audio.py sfx --id glass_clink --force                  # regenerate one sfx
tools/.venv/bin/python tools/audio/generate_audio.py all --reprocess   # rebuild outputs from cached raw takes (no API calls)
```

- The API key is read at runtime from the file in `ELEVENLABS_KEY_FILE` (default: `.secrets/elevenlabs.key` in the repo root, git-ignored)
  (override with `ELEVENLABS_KEY_FILE`). It is never printed, logged or written anywhere.
- Valid output files are skipped. Raw API takes are cached in `tools/audio/work/`, which is
  git-ignored, so a rerun makes no API calls. A full rerun with everything present takes about
  15 s and costs nothing.
- The script reads the TTS texts and SFX prompts straight from `docs/GAME_DESIGN.md`
  (`spec.py`), so they are always used verbatim.

| File | Purpose |
|---|---|
| `generate_audio.py` | Main pipeline: voice takes, take selection, post-processing, SFX, loops, verify |
| `design_voices.py` | One-time casting with Voice Design (design, evaluate, save, test, choose) |
| `el_api.py` | Stdlib ElevenLabs client, with retry and backoff on 429 and 5xx |
| `dsp.py` | ffmpeg and numpy helpers: trim, LUFS and true-peak normalisation, loop crossfade, pitch and timbre analysis |
| `stt.py` | Speech-to-text used for QA (see deviation 1) |
| `stt_check.py` | Transcribes the shipped voice files (results in `stt_check.json`) |
| `voice_compare.py` | Measures how distinct the persona voices are (results in `voice_compare.json`) |
| `voices.json` | Chosen voice ids, briefs, settings and all casting candidates |
| `report.json` | Per-file measurements, the take picked per line, and usage |

## Voices (§9.2)

Each voice was designed with ElevenLabs Voice Design (`eleven_ttv_v3`) from the §9.2 briefs. The
voice library has about 20 Croatian male voices, but they are all neutral "standard Croatian"
narrators, with nothing Dalmatian, elderly or comic, so none of them was used.

| Persona | Voice id | Account voice name | Design brief / seed |
|---|---|---|---|
| `barba` | `sQIyQUCcVdJdJR8ySpuZ` | Treseta Barba (old fisherman) barba_s11_0 | Round 1 brief, seed 11 |
| `gazda` | `i4bsHmGNVafdbkZoBFNS` | Treseta Gazda (tavern owner) gazda_v3s59_0 | Round 3 brief (low register), seed 59 |
| `mali` | `Ku8tspsqiowdT44wMaih` | Treseta Mali (sly young guy) mali_v3s71_1 | Round 3 brief (higher, boyish, nasal), seed 71 |

The full brief texts are in `voices.json`. They expand the §9.2 brief: a native Croatian speaker
with a coastal Dalmatian (ikavian) accent, close-up recording, plus the persona traits.

**How the voices were cast:**

1. I ran 16 design calls, producing 48 previews. Each preview was a Croatian Dalmatian sample of
   about 230 characters, written in character.
2. I scored every preview on:
   - transcription accuracy (local Whisper; language detected as hr or bs throughout);
   - pitch (YIN and cepstrum);
   - aperiodicity (roughness);
   - spectral centroid;
   - tempo.
3. Rounds 1 and 2 made gazda a raised, high-pitched shouter (median F0 about 260 Hz). Round 3 asked
   for a low chest register and left the loudness to the per-line audio tags.
4. Mali was redesigned higher and more nasal so that he stands apart from barba.
5. I saved 8 candidates and rendered 4 real game lines with `eleven_v4` for each:
   `jebem_ti_mliko`, `lipo_daj_ovamo`, `sidi_misaj` and one persona exclusive.
6. I picked the trio that reads best and differs most.

**Distinctness on the shipped files** (28 lines shared by all three personas; `voice_compare.json`):

| | barba | gazda | mali |
|---|---|---|---|
| Calm-line F0, cepstral (Hz) | 142 | 117 | 153 |
| F0 over all lines, cepstral (Hz) | 177 | 192 | 246 |
| Aperiodicity (roughness) | **0.24** | 0.14 | 0.14 |
| Tempo (vowels/s) | 2.9 (slowest) | 3.2 | 3.4 (fastest) |
| Spectral centroid (Hz) | 2394 (darkest) | 2882 | 2695 |

- Timbre distance between personas on the same line is 0.65–0.83. Within one persona across
  different lines it is 0.45–0.55.
- A nearest-profile classifier, trained on half the lines, identifies the persona of all 42/42
  held-out clips.
- What tells barba apart is a rough, gravelly, slow and dark voice rather than the lowest pitch.
  Gazda has the lowest calm register and rises sharply when he shouts. Mali is the highest and
  fastest.

**Unused candidates** are still in the ElevenLabs account and can be deleted to free voice slots:
`s9RbzTdcnFGohWH77qEp`, `MfZ5DgpHWI5YfNNH0uhr`, `BW1Ue7fSthvHEBVLytJf`, `L0YcGAMSO1VrH7rQwtmz`,
`HLO6k43MWe0361Ou2FFR`. I did not delete them myself. The Voice Design previews are in
`tools/audio/work/design/<persona>/` and the candidate test renders in `tools/audio/work/voice_tests/`.

## Voice lines (§9.3, §14.1)

**Generation:**
- Model `eleven_v4` with `language_code: "hr"`.
- Voice settings: stability 0.35, similarity_boost 0.75, style 0.6, speaker boost on.
- The text is the §9.3 TTS text verbatim, including the `[tag]`.
- Each take has a fixed seed (crc32 of persona/line/take).

**Takes:**
- 2 takes per line.
- Each take is scored on:
  - similarity of a forced-Croatian transcript to the subtitle;
  - duration sanity against the vowel count;
  - a small tag-fit term: raised voice for `[shouting]`/`[angry]`/`[excited]`, lower for
    `[sighs]`/`[grumbling]`.
- Extra takes, up to 4, were made for the weakest lines: `barba/tucem` (t3 used),
  `gazda/{tucem, akuzan_cetiri, jarca_ti, runda_na_mene, vrag_ti_sricu}` and `mali/tucem`.
- The take picked and the transcript of every take are in `report.json` → `voice_takes`.

**Post-processing:**
- Leading silence trimmed to about 25 ms and trailing silence to about 110 ms. Breaths and sighs
  that belong to the tag are kept.
- Normalised to −16 LUFS integrated with a −1 dBTP ceiling (constant gain plus an oversampled
  look-ahead limiter only when needed). The level is re-measured after mp3 encoding and corrected.
- Mono mp3, 44.1 kHz, 128 kbps CBR.

**Measured on the shipped files:**
- Loudness −16.2 to −16.0 LUFS, max true peak −1.1 dBTP.
- Durations 0.80–4.54 s (median 2.3 s).
- Leading silence 25 ms or less, trailing silence 135 ms or less.

**Transcription check of the shipped files** (`stt_check.json`, local Whisper small):
- Median similarity to the subtitle is 0.97, and every line is recognisable.
- The lowest scores are mostly Whisper limits rather than audible faults:
  - one-word shouts (`tucem` heard as "Tocem!", "TUĆEM!"; `jarca_ti` heard as "JASATI!");
  - dialect words normalised to standard Croatian ("sriću" heard as "sreću", "mišaja" as
    "misaja", "konobi" as "ekonomiji").

**Lines worth a quick listen** (I could not audition audio myself):
- `barba/tucem`, `barba/jarca_ti`, `mali/tucem`
- `barba/jebate_led`: all takes transcribe as "lid", so the model may over-apply ikavian here.
- `*/vrag_ti_sricu`, `gazda/u_mojoj_konobi`, `*/ko_je_misaja`

I could not re-roll any of these because the credits ran out (see Usage).

## SFX and ambience (§14.2)

**Generation:**
- Model `eleven_text_to_sound_v3` (v2 is deprecated as of March 2027). The script falls back to
  v2 if v3 rejects a request.
- Prompts are verbatim from the doc; `prompt_influence` is 0.5.
- Durations are as listed; items under 0.5 s are a special case (deviation 2).

**Short sfx** (mono):
- Leading silence trimmed to 6 ms or less, and only true silence is cut, so quiet onsets such as
  the cloth rustle in `fora_use` are kept.
- Trailing silence trimmed with a short fade.
- Normalised to −3 dBFS sample peak.

**Stingers** (`akuza_fanfare`, `win_stinger`, `lose_stinger`):
- Stereo, leading silence trimmed.
- Normalised to −16 LUFS, −1 dBTP. Measured −16.0 to −15.9 LUFS.

**Ambience loops:**
- Generated with `loop: true` at 23.5 s (22 s + 1.5 s), then made seamless with a 1.5 s
  equal-power crossfade of the tail into the head.
- Constant gain to −26 LUFS (measured −26.0). Stereo, 21.98 s long.
- Seam check on the decoded mp3: the sample jump at the wrap point is 0.48× (konoba) and 0.39×
  (cicadas) of the 99.5th-percentile sample step. The RMS is continuous across the seam and there
  is no click.
- Playback note for the implementation agent: the mp3s carry LAME gapless info, and ffmpeg decodes
  them to exactly 969,318 samples. For a gapless loop, use Web Audio
  (`AudioBufferSourceNode.loop`). `HTMLAudioElement.loop` can leave a small gap in some browsers.

## Deviations

1. **QA transcription is local, not ElevenLabs.** The key lacks the `speech_to_text` permission
   (HTTP 401), and also `user_read` and `speech_history_read`. Takes were therefore checked with
   the locally installed whisper.cpp (`/opt/homebrew/bin/whisper-cli`). It uses a multilingual
   `ggml-small-q5_1.bin` model that already existed on this Mac in another app's folder
   (`~/Library/Application Support/@sayspec/desktop/transcription-models/`); it is only read and
   was not copied. Override with `WHISPER_MODEL`. If neither STT is available, take selection
   falls back to the acoustic checks.
2. **SFX under 0.5 s.** The API rejects `duration_seconds` < 0.5 (HTTP 400). These were generated
   at 0.5 s and cut to the listed length with a fade-out: `card_flip`, `card_place`, `deal`,
   `card_pile`, `coin_single`, `ui_click`, `ui_hover`, `ui_error`, `chalk_tick`, `map_step`.
   `stamp` (0.45 s listed) came out at 0.48 s, within tolerance, so it was not cut.
3. **Some sfx are shorter than listed** because the generated content ended early and the
   trailing silence was trimmed:

   | id | Shipped (s) | Listed (s) |
   |---|---|---|
   | `card_slide` | 0.35 | 0.5 |
   | `card_slam_strong` | 0.58 | 0.7 |
   | `shuffle` | 1.24 | 1.4 |
   | `fora_use` | 0.52 | 0.9 |
4. **`glass_clink` peaks at −9.6 dBFS instead of −3 dBFS.** At a −3 dBFS peak this bright,
   sustained clink measured −11.8 LUFS, much louder than the −16 LUFS voices. Dense short sfx are
   capped at −18 LUFS, and `glass_clink` is the only file the cap affected. All other short sfx sit
   between −18 and −33 LUFS at a −3 dBFS peak.
5. **Ambience loops are 21.98 s, not 22.0 s.** The 1.5 s crossfade overlap is taken from the extra
   generated audio, and the generator returns 23.48 s for a 23.5 s request.
6. **The voice briefs were expanded over 3 design rounds** (see Voices). Persona ids, file names
   and line texts are unchanged. No lines were added; the casting previews used separate sample
   text that is not shipped. No religious content appears anywhere, including the previews.

## Usage (credits)

Figures are from `GET /v1/usage/character-stats` for 2026-11-15; this session made all of
today's usage:

| Product | Credits | What |
|---|---|---|
| Voice Generation | 3,478 | 16 Voice Design calls |
| TTS | 2,785 | 2,355 for the 193 line takes, including extra takes; 430 for 33 casting test renders |
| Sound Effects | 697 | 27 generations, 67.5 s of audio |
| **Total** | **6,960** | |

The account quota is **30,291 credits and 0 are now left**. The last few extra-take requests
(barba `tucem`, `jarca_ti`, `jebate_led`; mali `ko_je_misaja`) were refused with
`quota_exceeded`. Their existing files are kept and valid. Rerunning the script is free while the
cache in `tools/audio/work/` exists, but any re-roll needs new credits.

## Play-test round 4 (2026-11-20, GAME_DESIGN §22)

- **New lines:** 16 lines × 3 personas = 48 files (rows 35–50 of §9.3), 2 takes each, plus up to 4 when both takes looked garbled.
  - The short interjections (`argh`, `pff`, `ehe`) always score low on transcript similarity, because Whisper writes grunts as "*Gruh*" or "*pfff*". For these the score only ranks takes.
  - `pusi_mrtav` uses the user's exact wording. It was re-rolled (`--reroll`) after the first version had a shorter text.
- **Re-takes** (`--takes 4`, best by transcript) for the lines flagged above:
  - barba: tucem, jarca_ti, jebate_led (now transcribes as "led", not "lid"), vrag_ti_sricu, ko_je_misaja
  - mali: tucem, ko_je_misaja, vrag_ti_sricu
  - gazda: u_mojoj_konobi, vrag_ti_sricu, ko_je_misaja
- **Usage:** 1,459 TTS credits in 131 requests. `report.json` is cumulative: 3,814 TTS credits in 324 requests since the start.
- **The API key cannot read the account balance:** `/v1/user/subscription` needs `user_read`. Check it on the website.
- **`verify`:** all 138 voice files are present. A few short, peaky clips end up 0.6–1.4 dB under −16 LUFS, because the −1 dBTP ceiling limits their gain. This is expected and inaudible in play.

### Round 4, take 2 (user feedback)

- **Grunts.** "Aaargh" and "Pfff" came out twice. The new text ("[groans] Argh.", "[exhales] Pff.") still gives a groan plus the word. `strongest_burst()` now keeps only the loudest burst, and takes are ranked on that sound's length (about 0.5 s is best). The results are 0.6–0.8 s.
- **Speed.** `voice_settings.speed` has no effect on eleven_v4 (tested: 1.0 and 1.15 both gave 3.6 s). Round-4 lines are sped up after recording instead, with ffmpeg `atempo=1.12`, which keeps the pitch. The tempo is applied in `process_voice`, so `--reprocess` changes it without API calls.
- **Interjections** are at −19 LUFS (subtler). `verify` allows them ±1.5 dB.
- **Variants and picks.** Re-recorded `ko_je_misaja` (new wording) and added 4 variants plus the user's 6 picks.
- **Usage, take 2:** 630 TTS credits. Round 4 in total: 2,089 credits.

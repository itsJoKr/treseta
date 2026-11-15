# Art notes (visual asset agent)

All 78 files of GAME_DESIGN.md §13.6, plus the 4 Partneri portraits of §18.4.5, are delivered at
their exact paths and pixel sizes (82 files). Nothing is missing. Total image payload in
`public/assets/`: about 20.6 MB (cards 13 MB, fore 2.9 MB, env 2.0 MB, portraits 1.6 MB,
ui 0.5 MB, ukrasi 0.4 MB). The PNGs are
palette-quantised with pngquant (quality 80–98), the formats are the doc's (PNG / JPG
q88), and no WebP is used.

## Rebuild

```
tools/.venv/bin/python tools/art/generate.py -j 3 <gen_id> ...   # Codex $imagegen -> assets_src/gen/<gen_id>.png
tools/.venv/bin/python tools/art/build.py                        # all steps -> public/assets/** + contact sheets
tools/.venv/bin/python tools/art/build.py cards contact          # single steps
```

- `tools/art/prompts.py`: the §13.1–13.3 prompts (STYLE_CARD / STYLE_SCENE / CUTOUT prefixes, court template).
- `tools/art/generate.py`: the Codex runner (one folder per job, one retry). It uses `-m gpt-5.6-sol` because
  the Codex config's default model is refused for this ChatGPT account. Override with `CODEX_MODEL`.
- `tools/art/build.py`: rembg cut-outs (cached in `assets_src/gen/_cut/`), the badge sheet cutter, the card
  compositor, derivations, pngquant, and the contact sheets.
- Raw generations: `assets_src/gen/*.png`. Rejected first attempts: `assets_src/gen/_rejected/`. Codex logs: `assets_src/gen/_logs/`.
- QA: `assets_src/contact_cards.png` (40 faces, both backs, suit icons, deck-grid-size row; the same file is copied
  to `assets_src/preview/cards_contact_sheet.png` as §13.6 asks), and `assets_src/contact_misc.png` (portraits with
  a circle-mask preview, fore at full and HUD-slot size, badges on a checker and on cards, ui, logo, env), and
  `assets_src/contact_portraits.png` (all 8 portraits: square, 150 px HUD circle with an ochre ring, 64 px map node).

## Generations for §13: 49 (budget 41 + 8 regenerations); +4 ornate aces and +5 Partneri portraits = 58 in total

The 41 ids of §13.2 were each generated once. Eight were regenerated once because the first result was
off-brief or unusable:

| gen_id | Problem with the first result | Fix for the retry |
|---|---|---|
| `court_kupe_k`, `court_spade_k`, `court_dinari_k` | The king was riding a horse (the court template's "(the knight: horse and rider complete)" misled the model) | Added "the king is standing on his own feet; there is NO horse" |
| `env_bg_konoba` | Came out in portrait format | Added a format sentence (see below) |
| `fora_zamjena`, `fora_vrati` | Came out in landscape format; a 1.6 portrait crop would cut the subject | Added a format sentence |
| `fora_trica_iz_rukava` | Showed three loose goblets, no playing card | Added "one rectangular playing card (the three of cups) …" |
| `env_bg_map` | Oblique view with sky and horizon, and the road ended mid-top, so the map nodes would sit on the sky | Added "strictly top-down chart … road from bottom-left to top-right" |

No badge single-generation overrun was needed: both sheets gave exactly 5 blobs at alpha > 32.

## Ornate aces (play-test change)

`cards/{kupe,bate,spade,dinari}_a.png` (480×768) were redone as Triestine-style aces. Each has one large,
richly ornamented emblem instead of §13.5's pip in a ring:

- kupe: a gilded chalice with scrolls, olive sprigs and a ribbon
- bate: a carved club wrapped in a ribbon and an olive branch, inside gold scrollwork
- spade: an ornate sword with an olive wreath and a ribbon
- dinari: a medallion coin in an olive wreath with a bow

The corners show **no "1"**, only the small suit icon at the index's suit-mark position: (46,104), and
(434,664) rotated 180°. This keeps the ace recognisable in a fan.

How it's built:
- **Generations:** 4 new ones, `ace_<suit>` in `prompts.py` (STYLE_CARD + an ACE_OPEN/ACE_CLOSE template +
  the portrait format sentence + CUTOUT). Their motifs and colours follow the existing `suit_*` icons. All
  were on-brief first time, so the total is now 58.
- **Cut-out:** done in `build.py`. rembg dropped the free-floating scrolls, so for `ace_*` gens the colour key
  alone decides outside the rembg core (`CUTOUT_HOLES_PREFIX`). Background pockets enclosed by the scrollwork
  are cut out as holes.
- **Compositing:** the emblem is fitted into 380×580 and centred at (240,384) on the usual frame
  (`ACE_BOX`, `ACE_NO_INDEX`). If an `ace_<suit>` raw is missing, the build falls back to the old §13.5 ace.
- **Checked:** `contact_cards.png` now starts its deck-grid row (96×154) with the four aces and adds a
  "fan" strip of overlapping cards. All four aces read clearly at full size, at grid size and in the fan,
  where the corner icon plus the edge of the ornament shows.

Minor: the ribbon bow of the dinari ace keeps a small white highlight inside one loop. It's painted, not
background, and is barely visible on the parchment.

## Partneri portraits (§18.4.5)

`portraits/{dino,stipe,ive,frane}.png` (512×512) were made with the §18.4.5 prompts. These are in `prompts.py`
as `portrait_dino|stipe|ive|frane`, with the same STYLE_SCENE prefix and framing sentence as rows 31–34, and
`build.py` builds them as part of the `portraits` step. That makes 5 more generations (54 in total):

- One each for the four new characters.
- One retry of `portrait_dino`: the first was painted inside a cream card frame with red filigree corners.
  After the crop, these ornaments still showed in the top corners and set him apart from the other seven.
  The retry added "full-bleed, no border, no frame, no corner ornaments" and is on-brief.

Stipe, Ive and Frane were accepted first time. Frane's cap anchor carries no lettering, and Ive's envelopes
have no legible text.

At the same time, the portrait square crop is anchored at the top (`PORTRAIT_TOP_BIAS = 0`, previously 0.3)
for all 8 portraits. Hats and hair (Tonči's sunglasses, Stipe, Frane's cap) now sit inside the circle mask
instead of touching the ring. The original four were rebuilt with this crop. Checked on
`contact_portraits.png`: all eight share the same lamplit konoba wall, sea-window background, palette and
chest-up framing, so they read as one family.

## Deviations from the spec (all visual-only; no path, id or size changed)

1. **Generation sizes.** The built-in Codex image tool ignores a requested pixel size and picks its own aspect
   (e.g. 1086×1448, 1254×1254, 2172×724). Every final file is still resized or cropped to the exact §13.6 size.
   For the same reason, the fore and env prompts get one extra format sentence ("tall vertical portrait image,
   2:3 … full-bleed, no border" / "wide horizontal landscape image, 3:2"). See `format_sentence()` in `prompts.py`.
   The three retries with this sentence (zamjena, vrati, konoba) came out at 1024×1536 / 1536×1024.
2. **Logo prompt.** STYLE_CARD ends with "Absolutely no text, letters…", which contradicts the logo. For the logo
   only, that clause is replaced with "the only lettering is the single word described below". The generated
   "TREŠETA" is correct, with a clear háček on the Š, so no PIL fallback was needed.
3. **Card frame.** A plain centre-crop of 1024→960 px would have cut away the painted side borders. Instead:
   10 px of the outer cream margin is trimmed on every side, a plain strip is cut out of the centre with a
   cross-faded seam, and the result is resized to 480×768. The olive flourishes in the **top-left and
   bottom-right** corners are painted out with parchment, because the corner indices sit there. The other two
   corners keep theirs.
4. **Corner indices.** Georgia Bold 52 px `#3A2618` as specified. Georgia has old-style figures, so each index is
   centred on its actual ink box. The two-digit indices (11/12/13) are nudged 4 px inward and tracked −1 px so
   they clear the frame's inner ochre line. Suit icons stay at (46,104) and (434,664).
5. **Narrow suits.** At the nominal square pip size, clubs and swords read as tiny slivers next to cups and
   coins. For bate and spade, the pip height may be 1.4× the pip size on number cards and 1.25× in the
   corner (50 px). The aces no longer use pips; see "Ornate aces". The width limit and all centres are unchanged. Lower-half
   bate/spade pips are rotated 180° as specified.
6. **Court cards.** 24 px are trimmed from the top and bottom of the court art before the cover-fit, to drop
   the generated image's own outer frame line. The 4 px arch border is drawn just inside the arch, so the panel
   stays within (70,128)–(410,688). The bottom suit icon is 44 px at (240,719) instead of 48 px at (240,724),
   because at 724 it overlapped the frame's inner ochre line.
7. **Card back.** The back is not centre-cropped, which would have cut the side border and the corner rosettes
   of the symmetric pattern. The whole image is resized to 480×768 (about 6% horizontal compression).
   `back_bot` uses the luminance-preserving hue rotation of the CSS filter `hue-rotate(150deg) saturate(0.85)`.
   A plain HSV rotation turned the back a glaring cyan; this version reads as the teal-green the doc describes.
8. **Fore art.** 4% is trimmed from every edge before the 1.6 centre-crop, to remove the thin painted card
   border several vignettes have, so all ten are full-bleed. `duplo_ili_nista` (square raw) is centre-cropped:
   both cards are cut at their outer edges, but the two kings, the glow and the coins still read clearly.
9. **Portraits.** 3% is trimmed from every edge (some had their own thin frame). The square crop is centred
   horizontally and anchored at the top, then resized to 512×512.
10. **Table texture.** `env/table_wood.jpg` has its saturation lowered to 0.88×. The scene's warm key light and
    lamp would otherwise push the already very orange wood toward neon.
11. **Cut-outs.** rembg (u2net) is used for the mask. Its soft edges are sharpened with a colour key against the
    flat #DDDDDD-ish background, and any background reachable from the image border is forced transparent. This
    also cleanly separated two seals on sheet B that were painted touching. Edge pixels are un-mixed from the grey
    (defringed).
12. **Badge cutting.** As in §13.4 (alpha > 32 components, ≥ 2% of the sheet area, sorted left to right,
    bbox + 6% margin, square, 256). As a safeguard for touching seals, each crop blanks the far side of the
    midpoint to its neighbours and keeps only its own component. It was not needed beyond that.

## Known minor issues (accepted)

- `ukrasi/srebreno.png`: the small coin on the silver seal has a few tiny illegible pseudo-letters on its rim.
  They are invisible at the in-game 112 px size.
- `ukrasi/pijano.png`: the "tipped rakija bottle" is a wicker-wrapped bottle standing at a slight tilt.
- `fore/namjesteno.png`: the candle is mostly cropped out by the portrait crop (only its holder shows). The
  hands arranging the cards are the focus.
- `env/bg_map.jpg`: the map is top-down as briefed. The §12.3 node coordinates from K2 to B3 fall along the
  coastline and the shallow sea, so the dashed path reads as a coastal route. K1 and K4 sit on villages.

## Web optimization (after any art rebuild)

`tools/art/build.py` writes PNG/JPG masters into `public/assets`. Run `npm run optimize-assets` afterwards: it moves the masters to `assets_src/masters/` (never deployed) and writes the WebP files the game loads.

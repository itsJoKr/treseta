# Trešeta: Karte, rakija i psovke

A single-player browser card game: Dalmatian **Trešeta** with a deck-building run, a Three.js table and bots that cuss out loud.

- **Partneri (2v2):** you and a bot partner against two bots. Before each match you pick a partner from the characters you've unlocked. You can use the partner signals Tučem and Strišo.
- **Dvoboj (1v1):** the two-player game with a stock (*mac*) to draw from. Draws are hidden.
- **The run:** 6 matches to 11 points. Between matches you visit the shop (*butiga*), where you add card enhancements (*ukrasi*), trick cards (*fore*) and, later in the run, forgeries (*Falsa karta*).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

## Test

```bash
npm test           # vitest: rules engine, bots, run, voice director
npm run typecheck
npm run build
# end-to-end (needs a dev or preview server on :5179)
npx vite --port 5179 --strictPort &
node tests/e2e/partneri.cjs
```

Useful URL flags: `?mode=partneri`, `?seed=123`, `?start=N`, `?autoplay=1`, `?speed=4`, `?nosound=1`, `?noassets=1`, `?debug`.

## Deploy

Cloudflare Pages builds this repository on every push: build command `npm run build`, output directory `dist`.

## Assets

- `docs/GAME_DESIGN.md` is the design spec.
- Images were generated with gpt-image-2 (`tools/art/`) and converted to WebP with `npm run optimize-assets`.
- Voices and sound effects are pre-generated with ElevenLabs (`tools/audio/`). The game never calls an API at runtime.

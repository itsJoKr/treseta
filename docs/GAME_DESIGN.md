# TREŠETA: Game Design Document (MVP)

Version 1.0 · 2026-11-15 · Status: approved for build

Tagline: **"Karte, rakija i psovke."** (Cards, rakija and cussing.)

A single-player browser card game built with Three.js. The player works up through four Dalmatian taverns (konobe), playing real two-player Trešeta against cussing locals. Between matches they upgrade a personal deck of cards and a pocket of tavern tricks.

---

## 0. Read this first (all agents)

This document is the only source of truth. Three agents build in parallel from it and see nothing else. Where something is specified here, implement it exactly as written. Where a detail is left open (pixel nudges, exact shader code), choose the simplest option that fits the stated intent. Do not rename ids or paths.

> **Modes:** §1–§17 describe **Dvoboj (1v1)**, now the secondary mode. The primary mode is **Partneri (2v2)**, specified in **§18**, which states explicitly which earlier sections it replaces or extends.
>
> **Revision 2 (§19)** overrides §1–§18 wherever they conflict, in both modes: matches to 11, a 6-match run with shop tiers and forgeries, Dvoboj on one shared deck with hidden draws, and aces without an index. Read §19.0 first.

### 0.1 Ownership

| Agent | Owns (creates/edits) | Must NOT touch |
|---|---|---|
| **Visual asset agent** | `public/assets/cards/**`, `public/assets/ukrasi/**`, `public/assets/fore/**`, `public/assets/portraits/**`, `public/assets/env/**`, `public/assets/ui/**`, raw generations in `assets_src/gen/**`, its own scripts in `tools/art/**` | `src/**`, `public/assets/manifest.json`, `public/assets/audio/**` |
| **Audio agent** | `public/assets/audio/voice/**`, `public/assets/audio/sfx/**`, its own scripts in `tools/audio/**` | `src/**`, `public/assets/manifest.json`, image folders |
| **Implementation agent** | Everything else: `package.json`, `index.html`, `src/**`, `tests/**`, `public/assets/manifest.json` (written from §15) | Files in the asset folders (may only read them) |

### 0.2 Global conventions

- **Ids** are ASCII, lowercase and `snake_case`. Croatian diacritics appear only in display strings, never in ids or file names.
- Suit ids: `kupe`, `bate`, `spade` (= špade), `dinari`. Rank ids in code: `'3' | '2' | 'A' | 'K' | 'C' | 'F' | '7' | '6' | '5' | '4'`. Rank ids in **file names** are lowercase: `3, 2, a, k, c, f, 7, 6, 5, 4`.
- Everything in `public/` is served at the site root, so `public/assets/cards/kupe_3.png` is fetched as `assets/cards/kupe_3.png` (relative to `import.meta.env.BASE_URL`).
- **Missing assets never break the game.** The code renders procedural placeholders for missing images and skips missing sounds (§16.7). Asset agents must deliver files at exactly the listed paths. If one cannot be produced, leave it missing; do not substitute another name.
- **No network calls at runtime.** No AI or TTS APIs, fonts or CDNs. All audio is pre-generated mp3 files; **the game never calls ElevenLabs (or any API) at runtime.**
- Art style: one consistent style, *painterly antique Triestine/Venetian playing card, warm Adriatic palette* (§13.1). It is original: no Hearthstone/Balatro look-alikes. Avoid hex frames, gems, neon, jokers and CRT effects.

---

## 1. Vision and pillars

1. **Real Trešeta at the core.** Rank order 3-2-A, following suit, no trumps, points in "bele" (thirds), the last-trick "ultima", akuže, and a stock (mac) whose draws are shown to both players. A Dalmatian player should recognise the game right away.
2. **The barba across the table.** The opponent is a character who reacts to every swing with loud, crude, non-religious Dalmatian cussing, voiced and shown in speech bubbles. This is the main flavour.
3. **Short roguelite runs.** A run is 4 matches of about 6 minutes each, with a shop (butiga) between matches. You shape your own 40-card deck with "ukrasi" (card enhancements) and carry a pocket of "fore" (one-per-hand tricks) paid for with rakija.
4. **Tactile cards.** Cards lift, tilt, arc, flip, slam and sweep, with sound on every motion. The aim is Hearthstone-grade polish with a hand-painted Mediterranean look.

---

## 2. Research: real two-player Trešeta (as played in Dalmatia)

### 2.1 Sources consulted

- Croatian Wikipedia, "Trešeta": https://hr.wikipedia.org/wiki/Trešeta
- English Wikipedia, "Tressette" (includes a Trešeta section on Croatia and Montenegro): https://en.wikipedia.org/wiki/Tressette
- Italian Wikipedia, "Tressette": https://it.wikipedia.org/wiki/Tressette
- Pagat, "Tressette": https://www.pagat.com/tressette/tressette.html
- Pagat, two-player Tressette ("Spizzichino / Tressette in due", including *a metà mazzo* with a stock): https://www.pagat.com/tressette/spizzichino.html

### 2.2 The rules we settled on (traditional game)

| Topic | Rule | Source(s) |
|---|---|---|
| Deck | 40-card Triestine (Italian) pack. Suits: **kupe** (cups), **bate/baštoni** (clubs), **špade** (swords), **dinari/danari** (coins). Each suit has 1 (as/aš), 2 (duja/dvica), 3 (trica), 4–7, fanat (11), konj/kavàl (12) and kralj (13). | hr.wiki, en.wiki |
| Trick strength | **3 > 2 > A > K (kralj) > C (konj) > F (fanat) > 7 > 6 > 5 > 4**. There are no trumps. | hr.wiki, pagat, en.wiki |
| Following suit | You must follow the led suit if you can. If you cannot, you may play any card, but a card of another suit never wins the trick. | pagat, en.wiki, it.wiki |
| Card values | As = 1 **punat** (point). Trica, duja, kralj, konj and fanat = 1 **bela** each (⅓ punta). 4–7 are **lišine**/škart and worth 0. | hr.wiki, pagat |
| Ultima | The winner of the last trick gets +1 punat (the **ultima**). | hr.wiki, en.wiki |
| Per-hand total | The cards hold 10⅔ punata; with the ultima that is 11⅔. Each side counts only whole punti and drops fractions, so a hand always yields exactly **11**. | hr.wiki, pagat |
| Two players with a stock | Deal 10 cards each (in fives). The other 20 cards lie face down as the **mac** (stock). After each trick the **winner draws first** ("peška") and **shows the drawn card to the opponent**, then the loser does the same. The winner leads the next trick. When the mac is empty, the last 10 tricks are played out (20 tricks in all). The non-dealer leads the first trick. | hr.wiki, pagat (metà mazzo), it.wiki, en.wiki |
| Akuže | **Napolitana** (A + 2 + 3 of one suit) = 3 punta. Three 3s, three 2s or three aces = 3 punta; all four = 4 punta. A napolitana names its suit; a three of a kind names the missing suit. The same card may count in more than one combination. | hr.wiki, en.wiki, pagat |
| When to declare | Partnership play: before playing your first card. Two-player stock play: at the start from your first 10 cards, **and** when a drawn card completes a new combination, declared at once. | hr.wiki, pagat (metà mazzo) |
| Target score | Usually **31 without akuže, 41 with akuže** in Croatia (Italian variants often 21). The game ends at the end of the hand in which someone reaches the target. | hr.wiki, en.wiki, it.wiki |
| Signals | *Tučem* (busso), *strišo* (striscio) and *volo* are partnership signals. Pagat and it.wiki note that **they are not used in two-player games**. We keep only "Tučem!" as table talk and as the name of a trick card. | hr.wiki, pagat, it.wiki |

### 2.3 What this game changes (and why)

| Traditional | This game | Reason |
|---|---|---|
| One shared 40-card pack | **Each side plays from its own 40-card deck** with its own 10-card mac (§3.2) | A persistent personal deck is the deck-building core. Your upgrades always come to *you*. |
| Target 31/41 | **21** (with akuže) | Matches of about 5–8 minutes (about 3 hands). |
| Declare manually | **Akuže are detected and declared automatically** for both sides at the legal moments | You never miss one, and the callout is a big moment. |
| Exactly 11 per hand | About 11 per hand. It varies slightly with what is dealt from each deck, plus enhancement bonuses | A consequence of separate decks. Fractions are still dropped per side. |
| — | Ties are possible (both decks contain, say, the 3 of kupe): **the card played first wins** | Simple and intuitive: "prvi je prvi". |

Everything else (rank order, following suit, no trumps, values, ultima, draw-and-show, 20 tricks, akuže values) is unchanged.

---

## 3. Rules as implemented (rules engine specification)

This section is the contract for `src/game/rules.ts` and must be unit-tested (§16.8).

### 3.1 Card data

| Rank id | Croatian name | Corner index on card | Base strength | Effective strength (×2) | Value in thirds ("bele") |
|---|---|---|---|---|---|
| `3` | trica | 3 | 10 | 20 | 1 |
| `2` | duja | 2 | 9 | 18 | 1 |
| `A` | as / aš | 1 | 8 | 16 | **3** (= 1 punat) |
| `K` | kralj | 13 | 7 | 14 | 1 |
| `C` | konj | 12 | 6 | 12 | 1 |
| `F` | fanat | 11 | 5 | 10 | 1 |
| `7` | sedmica | 7 | 4 | 8 | 0 |
| `6` | šestica | 6 | 3 | 6 | 0 |
| `5` | petica | 5 | 2 | 4 | 0 |
| `4` | četvorka | 4 | 1 | 2 | 0 |

- Points are stored internally as **integer thirds**. 3 thirds = 1 punat.
- **Effective strength** = base × 2, plus modifiers: +3 for the *Nabrušeno* enhancement, or set to 20 by the *Trica iz rukava* trick card (23 if the card is also Nabrušeno). Doubling allows the "+1.5 rank" step in Nabrušeno without fractions.
- Display names of suits: Kupe, Bate, Špade, Dinari. Suit colours for UI/placeholder use: kupe `#B5452B`, bate `#6B7A3A`, spade `#2F5D7C`, dinari `#D9A441`.

### 3.2 Two decks, one table (the core model)

- **Each side owns a deck.** The player's deck is persistent for the run (starts as the standard 40 cards, may be thinned to a minimum of 30 and carries enhancements). The bot's deck is defined per opponent (§8.1): standard 40, sometimes thinned or enhanced.
- **Within one deck each (suit, rank) appears at most once.** Across decks duplicates are normal: both sides can hold a 3 of kupe.
- Card instance uid = `${owner === 'player' ? 'p' : 'b'}:${suit}_${rank}`, e.g. `p:kupe_3`, `b:dinari_A`.
- **Each hand, each side separately:** shuffle its own deck (seeded), take the first 10 cards as its hand and the next 10 as its own **mac** (index 0 = top). The remaining cards (0–20) are unused this hand ("ostatak") and are not shown on the table.
- After every trick (tricks 1–10) each side draws **from its own mac**. Because both macs start at 10, there are always exactly 10 draws each and 20 tricks.
- The player's deck list (including enhancements) is public to the bot, and the bot's deck list is public to the player (shown on the opponent intro, §12.3).

### 3.3 Hand flow (exact order)

1. **Dealer.** Hand 1 of a match: the bot deals. Afterwards the dealer alternates. The **non-dealer leads trick 1**.
2. **Reset per hand.** Set each side's rakija to its per-hand base (player: 3, or 4 with Veća čašica; bot: per opponent). Clear `foreUsed`, the `drunk` flag, the `kriviRacun` flag, the Trica-iz-rukava target, Pijano triggers, the known lists and the void lists.
3. **Shuffle and deal** each deck as in §3.2. Events: `handStarted`, `dealt`.
4. **Initial akuža check**, leader's side first, then the follower (§3.7).
5. **Trick loop, t = 1 … 20:**
   1. *Leader's turn.* The leader may use any number of **distinct** fore that are legal and affordable (§6), one at a time, then **must play one card** (any card; exception: Vrati!, §6.3).
   2. *Follower's turn.* The follower may use fore, then must play a **legal** card (§3.4).
   3. *Resolve* (§3.5). If t = 20, award the ultima.
   4. *Draw* (only if t ≤ 10). The winner draws the top card of its own mac (Ribarsko may turn this into a choice, §5). The card is **revealed** to both players and added to the hand; run an akuža check for that side. Then the loser does the same.
   5. The trick winner becomes the leader of trick t+1. Clear the trick modifiers (forcedHighest, multiplier).
6. **Hand scoring** (§3.6), then the match score update and the match-end check (§3.8).

### 3.4 Legal plays

- **Leader:** any card in hand. After **Vrati!** the returned card is excluded for this re-lead if the leader holds another card.
- **Follower:**
  - If the follower holds ≥ 1 card of the led suit:
    - If the trick has **forcedHighest** (lead card has Ljuto, or the leader used Tučem!): only the card(s) of the led suit with the **maximum effective strength** are legal.
    - Otherwise any card of the led suit is legal.
  - If the follower holds no card of the led suit: any card is legal. The engine then records that this side is **void** in that suit, as known to the opponent (§3.9).
- The engine exposes `legalPlays(state, side): string[]` (uids). `applyAction` throws on an illegal play; the UI never sends one (§11.3).

### 3.5 Trick resolution

1. **Winner:** if the follower's suit ≠ the led suit, the leader wins. Otherwise the card with the higher effective strength wins; **equal strength means the leader wins**.
2. **Card points:** for each of the two cards, `cardThirds = baseThirds × trick.multiplier` (multiplier = 2 if *Duplo ili ništa* was used this trick, else 1). Thirds go to the **winner**, except a card with **Usoljeno** whose owner **lost** the trick: its thirds go to its owner.
3. **Whole-point bonuses** (added to the side's `bonusPoints`, not doubled, not rounded):
   - *Pozlaćeno:* +1 punat to the owner if the owner won the trick containing that card.
4. **Coins:** *Srebreno:* +3 šoldi to the run if the **player** won a trick containing their own Srebreno card (bot Srebreno has no effect; no bot deck uses it).
5. **Ultima (t = 20 only):** the winner gets +1 punat. If the **winning card** has *Ponoćno*, the ultima is +3 punta instead.
6. Emit `trickResolved { trickNo, winner, leadUid, followUid, thirdsTo: {player, bot}, bonus: [...], soldi, ultima? }`.

### 3.6 Hand scoring

For each side:

```
cardPoints  = floor(thirds / 3)        // or ceil(thirds / 3) if the side used Krivi račun this hand
handTotal   = cardPoints + ultimaPoints + bonusPoints
```

- Akuža points are **not** part of `handTotal`. They were already added to the match score when declared (§3.7). The hand summary shows them as a separate row.
- Emit `handScored { breakdown: Record<Side, { thirds, cardPoints, rounding: 'floor'|'ceil', ultima, ukrasPoints, akuzaPoints, total }> }`.

**Worked example.** The player's pile contains A kupe, 3 bate, K špade, 2 dinari, F kupe, 7 bate and 5 kupe → 3+1+1+1+1 = 7 thirds → **2 punta** (⅓ dropped). If the player also won trick 20, the total is 3. With Krivi račun the cards would give ceil(7/3) = 3, so 4 in total.

### 3.7 Akuže (declarations)

**When the engine checks:**
- right after the deal, for both sides (leader first);
- every time a card enters a hand from a mac (normal draw, Ribarsko pick, Zamjena draw).

**Combinations** (each has a key; a key scores at most once per hand per side):

| Key | Condition (in hand, distinct cards) | Points | Callout text |
|---|---|---|---|
| `napolitana:<suit>` | A, 2 and 3 of that suit | 3 | "NAPOLITANA!" + suit |
| `kind:3` | 3s of ≥ 3 different suits | 3 (4 if all four) | "TRI TRICE!" / "ČETIRI TRICE!" |
| `kind:2` | 2s of ≥ 3 different suits | 3 / 4 | "TRI DUJE!" / "ČETIRI DUJE!" |
| `kind:A` | aces of ≥ 3 different suits | 3 / 4 | "TRI AŠA!" / "ČETIRI AŠA!" |

- **Upgrade:** if `kind:x` was declared at 3 and the side later holds all four, award **+1** (the record for that key becomes 4).
- The same card may count in several combinations (e.g. the 3 of kupe in `napolitana:kupe` and `kind:3`).
- **Glasno:** every newly awarded combination that includes a card with *Glasno* gives +2 extra points. Upgrades (+1) do not re-trigger Glasno.
- **Divlje:** for detection only, each Divlje card in hand takes exactly **one** identity per evaluation: its real rank, or the 3, 2 or A **of its own suit**. Brute-force all assignments (4^w, where w is the number of Divlje cards in hand) and pick the one that maximises the **new** points awarded now. On ties prefer real > 3 > 2 > A, deciding card by card in hand order. A duplicate identity (e.g. a Divlje 5 of kupe standing in as the A of kupe while the real A of kupe is in hand) adds nothing, because combinations need distinct suits or distinct ranks. Trick strength and points are never affected.
- **Reveal:** every card used in an awarded combination becomes **known** to the opponent (added to their knowledge, §3.9; for the bot's cards, shown in the player's *Viđeno* strip).
- Points go straight into the **match score** (event `akuza { side, combos: [{key, label, points, uids}], total }`). Combination points also count for the šoldi reward (§4.3).

### 3.8 Match

- Target **21** for every match.
- After each hand: `score[side] += handTotal[side]` (akuže are already included). If either score is ≥ 21: the higher score wins the match; **if both are equal, play another hand**. The match never ends mid-hand.
- Events: `matchScoreChanged`, `matchOver { winner, finalScores }`.

### 3.9 Knowledge tracking (engine-maintained, used by bot and UI)

Each side has:
- `knownByOpp: uid[]`: cards in this side's hand that the opponent has seen (mac draws, akuža reveals, Pogled, a card returned by Vrati!). A uid is removed when the card is played or moved to the mac (Zamjena).
- `voidKnown: Suit[]`: suits the opponent knows this side holds none of. Added when the side fails to follow suit. Removed when a revealed card of that suit enters this side's hand (all mac draws are revealed, so this is exact).

The player's UI always shows perfect knowledge (Viđeno strip). The bot sees this information through its **memory filter** (§8.3).

### 3.10 Edge cases (decided)

| Case | Ruling |
|---|---|
| Both cards have the same effective strength and suit | The leader wins. |
| The follower plays off-suit | The leader wins, whatever the strength. |
| The player's deck has fewer than 40 cards | Fine as long as it has ≥ 30 (the shop enforces this). The unused remainder shrinks. |
| A Duplo ili ništa trick contains Usoljeno | The Usoljeno card's doubled thirds go to its owner. |
| Both sides use Duplo on the same trick | The multiplier stays ×2 (no stacking). |
| Pijano card returned by Vrati! and played again | Pijano triggers at most once per card per hand. |
| Ljuto card returned by Vrati! | forcedHighest is set only by the card that is finally led. Tučem! stays in effect for the re-lead. |
| A side has only 1 card when the opponent wants Vrati! | Vrati! is not usable. |
| Akuža combination formed only through a card returned by Vrati! | Impossible: the card was already in hand and checked. No check runs on return. |
| Mac empty | No draws. Zamjena, Namješteno and Ribarsko do nothing (Zamjena and Namješteno are greyed out). |
| Napij ga'd side has one legal move | That move is played. |

---

## 4. Run structure

### 4.1 Numbers at a glance

| Item | Value |
|---|---|
| Matches per run | 4 (ladder of konobe, fixed order) |
| Match target | 21 points (akuže count) |
| Expected match length | 3 hands, about 6 minutes |
| Starting deck | standard 40 cards, no enhancements |
| Minimum deck size | 30 |
| Enhancements per card | max 1 (a new one replaces the old one after confirmation) |
| Starting fore | `pogled`, `zamjena` |
| Fore slots | 4 |
| Rakija per hand (player) | 3 (4 after buying *Veća čašica*, at most once per run) |
| Rakija cap during a hand | 5 (Pijano can push above base, up to the cap) |
| Starting šoldi | 5 |
| Revanš (rematch tokens) | 1 per run |

### 4.2 Ladder

| # | Konoba (display name) | Opponent id | Opponent | Difficulty (shown as rakija glasses) | Base reward |
|---|---|---|---|---|---|
| 1 | Konoba "Škoj" | `tonci` | Mali Tonči | 1 | 10 šoldi |
| 2 | Konoba "Kod Jure" | `jure` | Gazda Jure | 2 | 12 šoldi |
| 3 | Konoba "Ribarska" | `luka` | Barba Luka | 3 | 14 šoldi |
| 4 | Konoba "Na Brdu" | `bepo` | Did Bepo (boss) | 4 | 20 šoldi (final, shown in stats only) |

### 4.3 Flow

```
MENU ─New run─▶ MAP(node 1) ─▶ INTRO(opponent) ─▶ MATCH
MATCH ─win──▶ REWARD ─▶ (ladder < 4 ? BUTIGA ─▶ MAP(next) ─▶ INTRO ─▶ MATCH : RUN_WON)
MATCH ─lose─▶ (revans > 0 ? offer REVANŠ (same opponent, 0:0, new seed, revans−1) : RUN_LOST)
RUN_WON / RUN_LOST ─▶ RUN_END screen (stats) ─▶ MENU
```

Match reward (on win only):

```
soldi += base(opponent) + min(8, finalMargin) + akuzaPointsDeclaredByPlayerThisMatch
```

Srebreno coins are paid immediately when they trigger and are kept even if the match is lost. On a lost match no reward is paid.

### 4.4 Run end and stats

- **RUN_WON** ("Kralj konobe!"): show matches won, total points scored, akuže declared, šoldi earned and run time.
- **RUN_LOST** ("Kraj runde"): the same stats plus the opponent who beat you.
- Persisted stats (§16.6): `runsStarted`, `runsWon`, `bestLadder` (highest match index reached, 1–4), `bestRunSoldi`.
- There is no meta-progression or unlocks in the MVP.

---

## 5. Ukrasi (card enhancements)

An **ukras** ("decoration") is a permanent stamp on one specific card in a deck. Each card holds at most one. The engine is symmetric: any side's cards may carry ukrasi (bots get some in later matches, §8.1). Effects apply **only to the card's owner**. Displayed as a wax-seal badge on the card face (§13.4) plus a thin edge glow in the ukras colour.

| Id | Name (HR) | Colour | Rarity | Price | Effect (EN), exact | Opis (HR) |
|---|---|---|---|---|---|---|
| `pozlaceno` | Pozlaćeno (Gilded) | `#E2B43B` | uncommon | 7 | If you win the trick containing this card: +1 punat (whole point). | Ako odneseš štih s ovom kartom: +1 punat. |
| `srebreno` | Srebreno (Silvered) | `#C9CED6` | common | 5 | If you win the trick containing this card: +3 šoldi. | Ako odneseš štih s ovom kartom: +3 šoldi. |
| `nabruseno` | Nabrušeno (Whetted) | `#8FB3C9` | uncommon | 7 | Effective strength +3, so it beats the next-higher rank but not the one after (a Nabrušeno K beats an A but loses to a 2; a Nabrušeno 3 beats even a led 3). | Jača za pola stupnja: tuče prvu jaču kartu. |
| `ljuto` | Ljuto (Hot pepper) | `#D2452B` | uncommon | 7 | When you **lead** this card, the opponent must follow with their **highest** card of that suit. | Kad je baciš prva, protivnik mora baciti najjaču kartu te boje. |
| `usoljeno` | Usoljeno (Salted) | `#EDE6D6` | common | 5 | If you **lose** the trick containing this card, its thirds still count for you. | Ako izgubiš štih, bodovi ove karte ostaju tebi. |
| `pijano` | Pijano (Tipsy) | `#7FA34A` | common | 5 | When you play this card: +1 rakija (cap 5). Once per card per hand. | Kad je baciš: +1 rakija. |
| `divlje` | Divlje (Wild) | `#6B4E9B` | rare | 9 | For akuže only: counts as the 3, 2 or A of its own suit, whichever scores best. | Za akužu vrijedi kao trica, duja ili as svoje boje. |
| `glasno` | Glasno (Loud) | `#E07B2E` | uncommon | 7 | Every akuža that uses this card scores +2. | Svaka akuža s ovom kartom vrijedi +2. |
| `ponocno` | Ponoćno (Midnight) | `#2A3D6B` | common | 5 | If this card wins the **last trick**, the ultima is worth 3 punta instead of 1. | Ako ova karta odnese zadnji štih, ultima vrijedi 3. |
| `ribarsko` | Ribarsko (Fisherman's) | `#2F8C8C` | uncommon | 7 | When you win a trick with this card and your mac is not empty: look at your top 2 mac cards, draw one, and put the other on the bottom of your mac. | Kad odneseš štih s njom: biraš jednu od dvije gornje karte iz maca. |

Implementation notes:
- Ukras hooks live in `src/game/ukrasi.ts` as data plus pure functions called from `rules.ts` at fixed points: `onPlay`, `onLead` (sets forcedHighest), `strengthMod`, `onTrickResolved`, `onUltima`, `akuzaMod`, `onDrawChoice`.
- Ribarsko creates `pending = { kind: 'pickDraw', side, uids: [top0, top1] }` instead of an automatic draw. The player picks in a small two-card overlay (§12.4). The bot picks the card with the higher `val + str/20` (§8.4). If the mac holds only 1 card, draw it normally.

---

## 6. Rakija and Fore (trick cards)

### 6.1 Rakija

- A row of shot glasses on the HUD. It refills to the per-hand base at the start of every hand (player 3, or 4 with Veća čašica; bots per §8.1). Unspent rakija does not carry over.
- Each **fora** costs 1 or 2 rakija. Pijano adds +1 (cap 5).

### 6.2 Fore rules

- A fora is an owned card, kept in a slot (max 4) for the whole run.
- **Each owned fora can be used at most once per hand.** Using it costs its rakija.
- Fore can be used **only on your own turn, before you play your card** (as leader or follower), and never while a `pending` choice is open. Several different fore may be used in the same turn.
- Fore that need a target (a hand card) put the UI into targeting mode (§11.6). The action carries `targetUid`.

### 6.3 The fore pool (10)

| Id | Name (HR) | Cost | Rarity | Price | When | Effect (EN), exact | Opis (HR) | Bot may own |
|---|---|---|---|---|---|---|---|---|
| `pogled` | Pogled (A peek) | 1 | common | 4 | your turn | Reveal up to 3 random opponent hand cards you don't already know. They stay known (Viđeno strip) until played. Not usable if you know the whole hand. | Vidiš do 3 nasumične karte protivnika. | yes |
| `zamjena` | Zamjena (Swap) | 1 | common | 4 | your turn, mac ≥ 1 | Choose a card in your hand: it goes to the **bottom** of your mac. Draw the top card of your mac (revealed as usual; akuža check). | Karta iz ruke ide na dno maca, uzimaš gornju. | yes (unused in MVP) |
| `namjesteno` | Namješteno (Rigged) | 1 | common | 4 | your turn, mac ≥ 1 | Look at the top 3 (or fewer) cards of your mac and put them back in any order. | Pogledaj gornje 3 karte maca i složi ih. | no |
| `krivi_racun` | Krivi račun (Wrong bill) | 1 | common | 4 | your turn | At the end of this hand, round your card thirds **up** instead of down. | Na kraju ruke bele se zaokružuju prema gore. | yes |
| `ti_otvaraj` | Ti otvaraj (You lead) | 1 | common | 4 | your turn as **leader** | The opponent must lead this trick instead; you follow. | Protivnik mora otvoriti ovaj štih. | no |
| `tucem` | Tučem! (I knock!) | 1 | uncommon | 6 | your turn as **leader** | This trick has forcedHighest: if the opponent can follow suit, they must play their highest card of that suit. | Protivnik mora baciti najjaču kartu tražene boje. | yes |
| `napij_ga` | Napij ga (Get him drunk) | 1 | uncommon | 6 | your turn | The opponent's **next card** is chosen at random from their legal plays. | Protivnikova iduća karta bira se nasumično. | no |
| `vrati` | Vrati! (Take it back!) | 2 | uncommon | 6 | your turn as **follower** | The opponent takes back their led card (it becomes known to you) and must lead a different card. Requires the opponent to hold ≥ 2 cards including the led one. | Protivnik vraća bačenu kartu i mora baciti drugu. | no |
| `trica_iz_rukava` | Trica iz rukava (A 3 up the sleeve) | 2 | rare | 8 | your turn | Choose a card in your hand: for the rest of this hand its effective strength is 20 (as a 3; points unchanged; a real led 3 still wins ties as leader). | Odabrana karta do kraja ruke jaka je kao trica. | yes |
| `duplo_ili_nista` | Duplo ili ništa (Double or nothing) | 2 | rare | 8 | your turn | Card thirds in **this** trick are doubled for whoever wins it. | Bele u ovom štihu vrijede duplo, za onoga tko ga odnese. | yes |

Engine notes:
- `napij_ga` sets `opp.drunk = true`. On that side's next `play` action the engine ignores the requested uid and picks uniformly from `legalPlays` using the hand RNG, emitting `cardPlayed { drunk: true }`. Then it clears the flag.
- `ti_otvaraj` swaps `trick.leader` and `turn`. The opponent, now leading, may use their own fore.
- `vrati` moves the led card back into the leader's hand, adds it to the leader's `knownByOpp`, sets `trick.excludedLead = uid` and returns the turn to the leader. Trick modifiers stay.
- `namjesteno` creates `pending = { kind: 'reorderMac', side, uids }`. It is resolved by `{ type: 'resolvePending', order }`.
- Fore are stored as data in `src/game/fore.ts`: `{ id, cost, rarity, price, needsTarget, when: 'any'|'lead'|'follow', requiresMac, apply(state, side, target) }`, plus `canUse(state, side, id) → { ok, reasonKey }`.
- Reason keys for greyed-out slots: `notYourTurn`, `noRakija`, `usedThisHand`, `macEmpty`, `leaderOnly`, `followerOnly`, `nothingToReveal`, `pendingChoice`, `oppOneCard`.

---

## 7. Butiga (the shop)

Shown after winning matches 1, 2 and 3. HTML overlay on `env/bg_shop.jpg` (§12.6).

### 7.1 Contents of each visit

| Element | Rule |
|---|---|
| **4 random offers** (3 before play-test round 3) | Generated on entry (§7.2). Each is sold once; a sold slot shows "Prodano". |
| **Promišaj** (reroll) | Replaces **all 3** offers. Costs 2 šoldi, then 3, then 4 … (+1 per reroll within the same visit). |
| **Izbaci kartu** (remove a card), fixed service | 5 šoldi. Pick any card in your deck; it is removed for the rest of the run. Max 2 per visit. Disabled when the deck has 30 cards. |
| **Dalje** (continue) | Leave the shop and go to the map. |

### 7.2 Offer generation (seeded, §16.5)

For each of the 3 slots:
1. Roll the **type** by weight: ukras 55, fora 35, Veća čašica 10. Čašica is excluded if already owned, and at most one čašica offer per set; the weights are renormalised.
2. Roll the **rarity** by weight: common 60, uncommon 30, rare 10. If no item of that rarity is available, try the next lower rarity, then the next higher one.
3. Pick uniformly among items of that type and rarity that are **not already in this offer set**. Fore are also filtered: **not already owned**.

Prices: ukras common 5 / uncommon 7 / rare 9; fora common 4 / uncommon 6 / rare 8; **Veća čašica** 8 (permanent: +1 rakija per hand, so the base becomes 4).

### 7.3 Purchase flows

- **Ukras:** Kupi → the deck grid opens (all deck cards, sorted by suit then rank, existing ukrasi shown) → pick a card → if it already has an ukras, confirm "Zamijeniti {old} s {new}?" → stamp animation (A35) → coins deducted.
- **Fora:** Kupi → if 4 slots are full, choose a fora to discard (with confirmation) → the card flies into the slot.
- **Veća čašica:** Kupi → an extra glass appears in the rakija row with a clink.
- Can't afford: the button is disabled and the price is shown in red.
- Every purchase, removal and reroll saves the run (§16.6), so reloading cannot be used to reroll for free.

---

## 8. Opponents and bot AI

### 8.1 Opponent definitions (`src/game/opponents.ts`)

| Field | `tonci` | `jure` | `luka` | `bepo` |
|---|---|---|---|---|
| Display name | Mali Tonči | Gazda Jure | Barba Luka | Did Bepo |
| Bio (EN) | Spends summers "working" at the beach bar. Plays fast, talks faster. | Owns the konoba, owns the table, thinks he owns the cards. | Fished these waters for fifty years. Remembers every card you've played. | The island champion. Nobody remembers the last time he lost. |
| Bio (HR) | Ljeti "radi" na beach baru. Igra brzo, priča još brže. | Vlasnik konobe, stola i, misli on, karata. | Pedeset godina lovi ribu. Pamti svaku kartu koju si bacija. | Šampion otoka. Niko se ne sića kad je zadnji put izgubija. |
| Voice persona | `mali` | `gazda` | `barba` | `barba` at playbackRate **0.93** (deeper, slower) |
| Portrait | `portraits/tonci.png` | `portraits/jure.png` | `portraits/luka.png` | `portraits/bepo.png` |
| Deck | standard 40 | standard 40 + Pozlaćeno on A dinari and A kupe | standard 40 + Usoljeno on A bate and A spade, Nabrušeno on K kupe | **36 cards (all four 4s removed)** + Pozlaćeno on 3 kupe and 3 dinari, Nabrušeno on 2 bate, Ljuto on 3 spade, Glasno on A spade |
| Rakija per hand | 0 | 1 | 2 | 3 |
| Fore | none | `pogled` | `tucem`, `krivi_racun` | `tucem`, `trica_iz_rukava`, `duplo_ili_nista` |
| `memory` | 0.50 | 0.75 | 0.95 | 1.00 |
| `mistakeRate` | 0.20 | 0.10 | 0.04 | 0.00 |
| `saveMasters` | false | false | true | true |
| `huntAce` | false | true | true | true |
| `pimcMaxCards` (0 = off) | 0 | 0 | 4 | 5 |
| `pimcSamples` | – | – | 12 | 24 |
| `thinkMs` [min, max] | [600, 1100] | [800, 1400] | [1000, 1800] | [1100, 2000] |
| `cussMult` | 1.1 | 1.3 | 0.8 | 0.9 |

When the bot has exactly one legal move, its think time is 450 ms.

### 8.2 Definitions used below

- `str(c)`: effective strength (§3.1), including Nabrušeno and Trica iz rukava.
- `val(c)`: base thirds of c (A = 3; 3/2/K/C/F = 1; else 0), **+3 if c has Pozlaćeno** (whoever owns it: winning a player's Pozlaćeno card denies them the bonus).
- `V`: value of the current trick so far = `val(lead) × multiplier`.
- `unseen`: player deck list − cards the bot remembers as played − cards the bot remembers as known in the player's hand.
- `possible(S)`: the bot's view of the player's possible cards in suit S: remembered-known player hand cards of S, plus `unseen` cards of S **unless** the bot believes the player is void in S.
- `pHas(x)`: 1 if x is remembered-known in the player's hand. Else, if x ∈ unseen and the player is not believed void in x.suit: `handUnknown / unseenNonVoid`, where handUnknown = player hand size − known count and unseenNonVoid = the number of unseen cards in non-void suits. Else 0.
- `isMaster(c)`: no x in `possible(c.suit)` has `str(x) > str(c)` (as leader, ties win).
- `isLast`: this is trick 20. `macsEmpty`: both macs are empty (trick ≥ 11).

### 8.3 Memory filter (`src/game/botMemory.ts`)

The bot never reads hidden state. The controller builds a `BotView` from the true state and the `BotMemory`:
- Each time the player's card becomes observable (played, revealed by a draw, akuža, or a Vrati! return), roll `rng() < memory`. If the roll succeeds the bot remembers it; otherwise that observation is lost (a played card is treated as still unseen; a revealed card is not marked as known).
- Void flags are remembered with the same roll.
- Cards seen through the bot's own **Pogled** are always remembered.
- The bot always knows its own hand and mac size, all trick modifiers and both scores.

### 8.4 Decision procedure (`src/game/bot.ts`)

```
chooseCard(view, knobs, rng):
  legal = legalPlays(view)
  if legal.length == 1: return legal[0]
  if view.selfDrunk: return rng.pick(legal)                    // engine overrides anyway
  if rng() < knobs.mistakeRate:
      return rng.pick(legal without aces, or legal if all are aces)
  if knobs.pimcMaxCards > 0 and macsEmpty and hand.length <= knobs.pimcMaxCards:
      return pimc(view, knobs.pimcSamples, rng)                 // §8.5
  return view.isLeader ? chooseLead(view, knobs) : chooseFollow(view, knobs)
```

**Following:**

```
chooseFollow:
  L = lead card, S = L.suit
  suitCards = legal ∩ suit S
  if suitCards is non-empty:
     winners = suitCards where str(c) > str(L)
     if winners non-empty:
        w = winner with the lowest str
        if isLast:          return w                    // take the ultima
        if V >= 3:          return w                    // an ace (or doubled points): always take
        if V >= 1:
           if knobs.saveMasters and w.rank == '3'
              and pHas(A of S in player's deck) > 0
              and val(L) <= 1
              and suitCards has a card with str < str(L) and val == 0:
                 return that card with the lowest str    // keep the 3 to catch the ace
           return w
        // V == 0 (a lišina was led)
        if val(w) == 0:                         return w    // cheap win, take the lead
        if knobs.huntAce and wantLead(view):    return w
        return dump(suitCards minus winners, or suitCards if that is empty)
     else:
        return dump(suitCards)
  else:                                           // void: cannot win
     return discard(legal)

dump(cards):    card with min (val, str)
discard(cards): sort by val asc; never pick an A while a non-A exists;
                among equal val prefer the suit in which the bot holds the FEWEST cards
                (creates voids), then the lowest str
wantLead(view): bot holds a master m with val(m) >= 1 in a suit S where the player is not believed void
```

**Leading:**

```
chooseLead:
  if hand.length == 2 and exactly one card is a master: return the other card   // keep the master for the ultima
  masters = hand where isMaster(c)
  // 1. Ace hunt
  if knobs.huntAce:
     for each suit S where the bot has a master m and the player is not believed void in S:
        a = pHas(A of S)
     if the best a >= 0.5: return the master of that S with the lowest str that is still a master
  // 2. Cash masters late
  if macsEmpty:
     M = masters with val >= 1 in suits where the player is not believed void
     if M non-empty: return the m in M maximising oppPts(S) = Σ_{x ∈ possible(S)} val(x)·pHas(x)
  // 3. Safe low lead
  lows = hand where val == 0
  if lows non-empty:
     prefer suits where the bot holds neither its 3 nor its 2;
     among those take the bot's LONGEST suit; lead its lowest str card
     (if every lišina is in a suit with the 3 or 2, ignore the preference)
     return it
  // 4. Only point cards left
  if masters non-empty: return the master with the lowest val (ties: lowest str)
  return card with min (val, str)
```

**Pending choices:** `pickDraw` → choose max(`val + str/20`). `reorderMac` → bots never own Namješteno.

### 8.5 PIMC endgame (Luka and Bepo only)

Perfect-Information Monte Carlo, used when both macs are empty and the bot's hand size ≤ `pimcMaxCards`:
1. Repeat K = `pimcSamples` times: build the player's hand as remembered-known cards plus a random draw of (hand size − known) cards from `unseen`, respecting believed voids. If voids make this impossible, ignore the voids for this sample.
2. For each legal bot move m, run alpha-beta minimax over the remaining tricks with full information and no fore. Score = (bot thirds − player thirds), with ultima = ±3 thirds (±9 if the winning card has Ponoćno) and Pozlaćeno = ±3 thirds. Order moves by str descending. Stop a sample after 200,000 nodes (that sample is skipped).
3. Choose the m with the highest average score. If no sample completed, fall back to the heuristic.

### 8.6 Bot fore policy

Check the fore in this order on the bot's turn, **after** a tentative card has been chosen (some fore depend on it). Each is used only if owned, affordable and unused this hand:

| Fora | Use when |
|---|---|
| `pogled` | The bot's first turn of the hand. Revealed player cards get a red "eye" flash (A27b) and the toast "{name} ti viri u karte!" / "{name} peeked at your cards!" |
| `tucem` | The bot is leader, the tentative lead is a master with str ≥ 18 (its 2 or 3), and `Σ val(x)·pHas(x)` over the possible cards of that suit ≥ 2. |
| `duplo_ili_nista` | (a) The bot is leader leading a **3**, the player is not believed void and `oppPts(S)` ≥ 2; or (b) the bot is follower and about to win a trick with V ≥ 3. |
| `trica_iz_rukava` | The bot is follower, the led card is an A or a 2 (not a 3), the bot holds that suit but has no winner: apply it to its **lowest-val** card of that suit, then play that card. |
| `krivi_racun` | Trick ≥ 19, on the bot's turn, if the bot's thirds % 3 ≠ 0. |

Bots never use `zamjena`, `namjesteno`, `ti_otvaraj`, `napij_ga` or `vrati`, and are never given them.

### 8.7 Fairness guarantees (must be tested)

- The bot only ever calls `legalPlays` and `applyAction`, the same API the UI uses.
- `BotView` contains no uid from the player's hand or mac unless it is in memory (unit test: build a view, assert that it contains no unknown player uids).

---

## 9. The cussing system (voice director)

The bot talks. Lines play as pre-generated audio (§14.1) and **always** show a speech bubble (§11, A25), with an optional English subtitle. Without the audio file, the bubble still shows for 2200 ms.

### 9.1 Hard content rules

- **No line may invoke God, Jesus, the Madonna, saints, church, heaven or any religious figure or term.** No ethnic or national slurs. Only crude, cheeky, everyday Dalmatian cussing.
- "Vrag ti sriću odnija!" is one of the user's own lines and stays verbatim. **No other line** may mention the devil or anything supernatural.
- The user's ten lines are used **verbatim** (text after the audio tag), including punctuation.

### 9.2 Voice personas

| Persona id | Who | Voice design brief (for the audio agent) | Used by |
|---|---|---|---|
| `barba` | Old fisherman | Elderly Dalmatian man, about 72. Deep, gravelly, smoky voice; slow, grumbling delivery with dry sarcastic humour and a wheezy laugh. Croatian with a coastal Dalmatian (ikavian) accent. | Barba Luka (rate 1.0), Did Bepo (rate 0.93) |
| `gazda` | Loud tavern owner | Big booming Dalmatian man, about 55. Chesty and theatrical; shouts easily, laughs loudly, warm underneath. Coastal Croatian accent. | Gazda Jure |
| `mali` | Sly young guy | Cheeky Dalmatian guy, about 22. Quick, slightly nasal, mocking and giggly, street-smart, fast delivery. Coastal Croatian accent. | Mali Tonči |

### 9.3 Voice lines (34 lines; 30 per persona; 90 files)

Columns: **id** (also the file name), **personas** (`all` = barba, gazda, mali), **text** = exact text sent to TTS, including inline audio tags, **subtitle** = Croatian text shown in the bubble (tags removed), **gloss** = English subtitle.

**User-supplied lines (verbatim):**

| # | id | personas | TTS text | gloss (EN subtitle) |
|---|---|---|---|---|
| 1 | `jebem_ti_mliko` | all | `[angry] Jebem ti mliko majčino!` | "Damn your mother's milk!" |
| 2 | `ej_ko_te_napravi` | all | `[surprised] Ej, ko te napravi!` | "Hey, who on earth made you?!" |
| 3 | `jarca_ti` | all | `[frustrated] Jarca ti!` | "Goat take it!" (≈ "Dammit!") |
| 4 | `jebate_led` | all | `[exasperated] Jebate led!` | "Damn the ice!" (≈ "Damn it all!") |
| 5 | `ajme_majko` | all | `[sighs] Ajme majko moja!` | "Oh, mother of mine!" |
| 6 | `jebem_ti_pasa` | all | `[angry] Jebem ti pasa!` | "Damn your dog!" |
| 7 | `grom_te_spanija` | all | `[shouting] Grom te Španija!` | "Thunder strike you!" |
| 8 | `vrag_ti_sricu` | all | `[frustrated] Vrag ti sriću odnija!` | "May the devil take your luck!" |
| 9 | `ajde_tovare` | all | `[sarcastic] Ajde tovare jedno!` | "Come on, you donkey!" |
| 10 | `aha_sta_je_sad` | all | `[excited] Aha, šta je sad!` | "Aha, what now?!" |

**Our lines, common to all personas:**

| # | id | personas | TTS text | gloss |
|---|---|---|---|---|
| 11 | `lipo_daj_ovamo` | all | `[laughs] Lipo, lipo... daj to ovamo!` | "Nice, nice... hand it over!" |
| 12 | `sta_si_mislija` | all | `[sarcastic] Ma šta si mislija, a?` | "And what were you thinking, huh?" |
| 13 | `gledaj_i_uci` | all | `Gledaj i uči, mali!` | "Watch and learn, kid!" |
| 14 | `evo_ti_ga_na` | all | `[excited] Evo ti ga na!` | "There, take that!" |
| 15 | `srice_nima` | all | `[sighs] Jebi ga, sriće nima.` | "Damn it, no luck at all." |
| 16 | `ne_mogu_virovat` | all | `[frustrated] Ma ne mogu virovat!` | "I can't believe it!" |
| 17 | `ko_je_misaja` | all | `[angry] Ko je ovo mišaja, a?!` | "Who shuffled this, huh?!" |
| 18 | `ukra_si_mi` | all | `[shouting] Ukra' si mi to, lopove!` | "You stole that from me, you thief!" |
| 19 | `same_lisine` | all | `[sighs] Same lišine, same lišine...` | "Nothing but junk cards..." |
| 20 | `igraj_vise` | all | `[impatient] Ajde, igraj više, zaspa si!` | "Come on, play already, you fell asleep!" |
| 21 | `napolitana` | all | `[shouting] Napolitana! Piši tri!` | "Napolitana! Write down three!" |
| 22 | `akuzan_tri` | all | `[excited] Akužan tri! Piši, piši!` | "I declare three! Write it down!" |
| 23 | `akuzan_cetiri` | all | `[shouting] Akužan četiri! Gledaj i plači!` | "I declare four! Look and weep!" |
| 24 | `opet_akuza` | all | `[frustrated] Opet akuža?! Di ti to sve dođe?` | "Another declaration?! Where does it all come from?" |
| 25 | `ultima_moja` | all | `[laughs] Ultima je moja!` | "The last trick is mine!" |
| 26 | `sidi_misaj` | all | `Ajde, sidi... mišaj karte.` | "Come on, sit down... shuffle the cards." |
| 27 | `plati_rakiju` | all | `[laughs] Plati rakiju i ne plači!` | "Pay for the rakija and don't cry!" |
| 28 | `tucem` | all | `[shouting] Tučem!` | "I knock!" (Trešeta table call) |

**Persona-exclusive lines:**

| # | id | persona | TTS text | gloss |
|---|---|---|---|---|
| 29 | `ka_bombone` | mali | `[giggles] Ka' da ditetu bombone otimam!` | "Like taking candy from a baby!" |
| 30 | `oces_danas` | mali | `[mischievously] Oćeš danas ili sutra, brate?` | "Today or tomorrow, bro?" |
| 31 | `u_mojoj_konobi` | gazda | `[shouting] U mojoj konobi ja dobivan!` | "In my konoba, I win!" |
| 32 | `runda_na_mene` | gazda | `[sighs] Dobro, dobro... ova runda je na mene.` | "Fine, fine... this round's on me." |
| 33 | `ka_riba` | barba | `[grumbling] Šta čekaš, da riba zagrize?` | "What are you waiting for, a fish to bite?" |
| 34 | `stari_ja` | barba | `[laughs] Igra' san ja ovo prije nego si se ti rodija!` | "I was playing this before you were born!" |

Each persona folder therefore holds the 28 common lines plus its 2 exclusives = **30 files**.

Line metadata (id, subtitle HR, gloss EN, personas, mood) lives in `src/data/voiceLines.ts`. Moods are used for portrait reactions: `angry` → lines 1, 6, 7, 17, 18; `laugh` → 11, 25, 27, 29, 34; `sad` → 5, 15, 19, 32; everything else `neutral`.

### 9.4 Events, probabilities and cooldowns

The controller sends game events to `VoiceDirector.onEvent(type, ctx)`. Probability p is multiplied by the opponent's `cussMult` (capped at 1.0).

**Trick-end selection:** after each trick, evaluate the trick events in the order listed (`player_great`, `bot_lose_big`, `bot_win_big`, `bot_lose_trick`, `bot_win_trick`). **Only the first matching event is rolled.** If its roll fails, nothing is said. On trick 20, `ultima_*` replaces the trick-end events.

| Event | Fires when (exact) | p | Event cooldown | Priority | Line pool |
|---|---|---|---|---|---|
| `match_start` | The deal animation of hand 1 starts | 1.0 | – | 2 | sidi_misaj |
| `bot_play_strong` | The bot leads a 3, **or** plays a card that is certain to win (a master, or the follower beating the lead) in a trick with V ≥ 3 | 0.35 | 10 s | 1 | aha_sta_je_sad, evo_ti_ga_na |
| `bot_forced_bad` | The bot plays a card with val ≥ 1 into a trick it is certain to lose **and** every legal option had val ≥ 1 | 0.85 | 6 s | 2 | ajme_majko, jebate_led, same_lisine, ko_je_misaja |
| `player_great` | The player, as **follower**, beats a bot lead of rank 2 or A, **or** a player ukras/fora effect gives the player ≥ +1 punat in this trick | 0.6 | 8 s | 2 | ej_ko_te_napravi, vrag_ti_sricu, ukra_si_mi |
| `bot_lose_big` | The bot loses a trick worth ≥ 3 thirds (after the multiplier), or loses its own A or 3 | 0.8 | 5 s | 2 | jebem_ti_mliko, jebem_ti_pasa, grom_te_spanija, ukra_si_mi, ne_mogu_virovat |
| `bot_win_big` | The bot wins a trick worth ≥ 3 thirds, or captures the player's A | 0.7 | 5 s | 2 | gledaj_i_uci, lipo_daj_ovamo, sta_si_mislija, ka_bombone, u_mojoj_konobi, stari_ja |
| `bot_lose_trick` | The bot loses any other trick | 0.12 | 10 s | 1 | jarca_ti, srice_nima |
| `bot_win_trick` | The bot wins any other trick | 0.2 | 8 s | 1 | lipo_daj_ovamo, sta_si_mislija, ka_bombone |
| `bot_bad_draw` | The bot draws a val-0 card while holding ≤ 1 card with val ≥ 1 | 0.25 | 15 s | 1 | ko_je_misaja, same_lisine |
| `player_fora` | The player uses a fora | 0.5 | 12 s | 1 | ej_ko_te_napravi, jebate_led |
| `bot_fora` | The bot uses a fora | 1.0 (`tucem`) / 0.6 (others) | 10 s | 2 | `tucem` → tucem; others → aha_sta_je_sad |
| `akuza_bot` | The bot is awarded an akuža | 1.0 | – | 3 | any napolitana → napolitana; else any four → akuzan_cetiri; else akuzan_tri |
| `akuza_player` | The player is awarded an akuža | 0.75 | – | 2 | opet_akuza, ajme_majko, jarca_ti |
| `ultima_bot` | The bot wins trick 20 | 0.6 | – | 2 | ultima_moja |
| `ultima_player` | The player wins trick 20 | 0.5 | – | 2 | jebem_ti_pasa, jarca_ti |
| `big_swing` | At hand end, the player's hand total (including this hand's akuže) exceeds the bot's by ≥ 6 | 0.9 | – | 2 | jebem_ti_mliko, grom_te_spanija, vrag_ti_sricu |
| `hand_end_bot_win` | At hand end, the bot's hand total > the player's | 0.4 | – | 1 | gledaj_i_uci, lipo_daj_ovamo |
| `hand_end_bot_lose` | At hand end, the bot's total < the player's and `big_swing` did not fire | 0.4 | – | 1 | srice_nima, jarca_ti |
| `idle` | It is the player's turn and there has been no input for 12 s | 1.0 | 25 s | 1 | igraj_vise, ajde_tovare, oces_danas, ka_riba |
| `player_illegal` | The player tries an illegal card | 0.3 | 20 s | 1 | ajde_tovare |
| `match_bot_win` | The bot wins the match | 1.0 | – | 3 | plati_rakiju |
| `match_bot_lose` | The bot loses the match | 1.0 | – | 3 | ajme_majko, jebem_ti_mliko, runda_na_mene |

### 9.5 Director rules

```
onEvent(type, ctx):
  cfg = EVENTS[type]
  if cfg.priority < 3:
     if now - lastLineEndAt < 3500 ms: return                 // global gap
     if linesThisHand >= 8: return                            // per-hand cap
  if now - lastFiredAt[type] < cfg.cooldown: return
  if rng() > min(1, cfg.p * opponent.cussMult): return
  pool = cfg.lines filtered to lines the persona has
  pool = pool minus the last 3 lines spoken (if that empties the pool, keep the full pool)
  if pool contains a persona-exclusive line and rng() < 0.5: line = that exclusive line
  else line = uniform pick from pool
  speak(line, cfg.priority)

speak(line, priority):
  if a line is playing:
     if priority == 3: stop it (fade out 80 ms) and play the new line
     else: drop the new line
  play audio voice/<persona>/<id>.mp3 at playbackRate (Bepo 0.93), voice bus
  show bubble (A25); portrait reaction by mood (A26)
  angry mood: 40% chance to also play sfx glass_slam 150 ms after the line starts
  duck ambient to 60% for the duration (200 ms ramps)
```

The director uses its own RNG stream (`rngFor(runSeed, 'voice', matchIndex)`) so that voice choices never change gameplay randomness.

---

## 10. Scene (Three.js)

### 10.1 Renderer and layers

- `WebGLRenderer({ antialias: true, alpha: true })`, `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`, `toneMappingExposure = 1.05`, shadows on (`PCFSoftShadowMap`), pixel ratio `min(devicePixelRatio, 2)`.
- Layering from back to front: **CSS background** (`env/bg_konoba.jpg`, `background-size: cover`, centred) → **transparent WebGL canvas** (clear alpha 0) → **CSS vignette** (`radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(20,10,4,0.55) 100%)`, `pointer-events: none`) → **HTML UI layer** (`#ui`).
- World units: 1 unit ≈ 10 cm. The table top is the plane y = 0. +x is right, +z is toward the player.

### 10.2 Camera

`PerspectiveCamera(fov 38, aspect, 0.1, 100)` at **(0, 10.5, 8.6)**, `lookAt(0, 0, 0.9)` (about 52° down). On resize, update the aspect. If the aspect is < 1.6, move the camera back along its view axis by `(1.6 - aspect) * 4` units so the table stays framed. The target minimum is 1280×720; mobile is not required.

### 10.3 Table and lighting

| Object | Spec |
|---|---|
| Table | `BoxGeometry(18, 0.6, 11)` at y = −0.3 (top at 0). The top face uses `env/table_wood.jpg` (`MeshStandardMaterial`, roughness 0.85, metalness 0). The side faces use the same texture tinted `#6B4A2E`. `receiveShadow`. |
| Hemisphere light | sky `#FFE6C4`, ground `#3A2618`, intensity 0.6 |
| Key light | `DirectionalLight #FFD9A0`, intensity 1.6, position (2.5, 12, 5), target (0, 0, 0.5), `castShadow`, shadow map 2048, camera bounds ±10, bias −0.0005, radius 4 |
| Lamp | `PointLight #FFB86B`, intensity 1.0, distance 20, position (0, 6, 0). Flicker: `1.0 + 0.06·sin(t·7.3)·sin(t·3.1)` |
| Fallback table | If the texture is missing: colour `#7A5232` with procedural plank lines drawn on a 1024×683 canvas |

### 10.4 Cards in 3D

- Card size **0.80 × 1.28** units (ratio 1.6 = texture 480×768).
- Mesh: two `PlaneGeometry` quads back to back (front face texture, back texture), material `MeshStandardMaterial({ roughness 0.6, alphaTest 0.5 })`, `castShadow = true`. Rounded corners come from texture alpha (placeholders draw rounded corners too).
- Front texture = `CanvasTexture` composited at runtime: base face (`cards/<suit>_<rank>.png`) + ukras badge (`ukrasi/<id>.png`) drawn at (338, 118), size 112×112 on the 480×768 canvas + a 6 px inner edge stroke in the ukras colour at 70% alpha. Cache by `suit_rank|ukras`.
- Glow: a child plane scaled 1.08× behind the card, additive blending, a soft rounded-rect gradient texture (procedural), `opacity` 0 by default. Colours: hover/legal `#FFD27A`, winning card `#FFE9A8`, Pogled reveal `#E0483A`.
- Back texture: `cards/back_player.png` for player-owned cards, `cards/back_bot.png` for bot-owned cards.

### 10.5 Layout (positions)

| Element | Position / transform |
|---|---|
| **Player hand** | A `Group` attached to the camera (`camera.add(handGroup)`; add the camera to the scene). Local anchor (0, −1.95, −7). Fan pivot = anchor + (0, −6.0, 0), radius R = 6.0. Card i of n: θᵢ = (i − (n−1)/2) × step, step = min(4.2°, 36°/(n−1)). Position = pivot + R·(sin θᵢ, cos θᵢ, 0), rotation.z = −θᵢ, local z = i × 0.004. Scale 1.0. |
| **Opponent hand** | Flat on the table at (0, 0.02, −4.0), rotated 180° about y. Fan radius 5, step = min(3.5°, 30°/(n−1)), scale 0.85, card y += i × 0.003. Face down. |
| **Trick: bot card** | (−0.55, y, 0.20), rotation y = +7° ± 4° random. |
| **Trick: player card** | (0.55, y, 0.75), rotation y = −6° ± 4° random. The first card played uses y = 0.03 and the second y = 0.05. |
| **Player mac** | (3.6, 0, 1.6), rotation y = −8°, face down, card k at y = 0.004·k. A count label (HTML, follows the projected position): "Mac 7". |
| **Bot mac** | (−3.6, 0, −1.4), rotation y = +8°, same stacking and label. |
| **Player trick pile** | (6.4, 0, 3.0), face down, each card at a random rotation y ±12°, y += 0.004. |
| **Bot trick pile** | (−6.4, 0, −2.6), same. |
| **Draw reveal point** | Player: world (2.0, 2.6, 3.2), facing the camera (copy the camera quaternion), scale 1.3. Bot: (−2.0, 2.4, −0.4), facing the camera, scale 1.15. |
| **Akuža showcase** | Centre (0, 3.0, 1.0), facing the camera, cards spaced 0.95 apart, scale 1.35. |
| **Deck stacks (deal source)** | Player (4.8, 0, 2.6); bot (−4.8, 0, −2.4). Shown only during the shuffle and deal. |

When a hand card is played, reparent it to the scene with `scene.attach(mesh)` (keeps the world transform) before tweening.

### 10.6 Particles and FX (procedural, no assets)

- One `Points` system per effect, with sprite textures drawn on canvas (soft radial dot, 64×64).
- **Dust puff** (card land): 8 particles, colour `#CDBB9A`, alpha 0.4, spread radius 0.5, life 400 ms.
- **Sparks** (strong play): 24 particles, `#FFD27A`, additive, initial speed 2–4 units/s upward and outward, gravity −6, life 600 ms.
- **Confetti** (akuža, win): 40 small quads in the palette colours (terracotta, ochre, olive, Adriatic blue, cream), tumbling, life 1500 ms.
- **Camera shake:** offset the camera position by a random vector of amplitude A, decaying over the duration (`power2.out`). Restore it exactly at the end.
- **Flash:** the lamp intensity +2.0 and back over 300 ms.

"Strong play" is any of: a **3** is played; a played card has **Pozlaćeno** or **Nabrušeno**; the trick resolves with an **A** captured by the other side.

---

## 11. Interaction and animation spec

All tweens use **gsap**. All durations are multiplied by the speed setting: Fast mode sets `gsap.globalTimeline.timeScale(1.6)` and also scales the controller's waits by 1/1.6. The animator exposes promise-returning functions; the controller awaits them in sequence (§16.4).

### 11.1 Animation table

| # | Animation | Duration (ms) | Easing | Details |
|---|---|---|---|---|
| A1 | Hand card hover lift | 140 | `power2.out` | +0.55 local y, +0.5 local z (toward camera), scale 1.25. Tilt follows the pointer: rotation.x = −dy·8°, rotation.y = dx·8°, where dx, dy ∈ [−1, 1] is the pointer offset within the card. Neighbours shift ±0.18 x. sfx `ui_hover`. |
| A2 | Hover exit | 180 | `power2.inOut` | Back to the fan slot. |
| A3 | Hand re-layout (card added/removed) | 260 | `power2.inOut` | All cards tween to new fan slots. |
| A4 | Illegal-move shake | 320 | keyframes, `none` | Local x offsets 0, −0.08, 0.08, −0.06, 0.06, −0.03, 0. Red glow flash (300 ms). sfx `ui_error`. Toast (§12.2). |
| A5 | Drag follow | per frame | lerp 0.35 | The card follows the pointer ray projected on the plane y = 1.2. rotation.z = clamp(−vx·0.04, ±0.35) with lerp 0.2 (lags behind the motion). |
| A6 | Drag cancel return | 260 | `back.out(1.4)` | Released outside the drop zone. |
| A7 | Player card → trick | 420 | position `power3.out` on a quadratic Bézier (control = midpoint + (0, 1.6, 0)); rotation `power2.inOut` | Ends flat (face up) at the trick slot with a random yaw ±4°. sfx `card_slide` at start. |
| A8 | Card land squash | 120 | `power1.out`, yoyo | scale 1 → 1.06 → 1; dust puff; sfx `card_place`. |
| A9 | Bot card → trick | 450 | `power3.out` | Lifts out of the opponent fan (+0.3 y in the first 80 ms), arcs (control +1.4 y) and flips face up (180° about its long axis) between 30% and 70% of the flight. sfx `card_slide` at start, `card_flip` at 50%, `card_place` on landing (A8). |
| A10 | Strong-play FX | shake 250, sparks 600, flash 300 | shake `power2.out` | Shake amplitude 0.06. **Replaces** `card_place` with `card_slam_strong`. |
| A11 | Trick hold | 550 | – | Both cards visible; the winning card's glow fades in (A12) at the start of the hold. |
| A12 | Winner glow | 200 | `power2.out` | Glow opacity 0 → 0.9. |
| A13 | Gather | 180 | `power2.in` | The losing card slides onto the winning card (+0.01 y). |
| A14 | Sweep to pile | 380 | `power2.inOut` | Both cards arc (+0.4 y) to the winner's pile, spinning 90° about y and flipping face down at 50%. sfx `trick_whoosh` at start, `card_pile` at end. |
| A15 | Points pop-up | 900 | `power1.out` | HTML text at the trick centre's screen position, e.g. "+1⅓" (thirds shown as a mixed fraction, ⅓ and ⅔ glyphs). It rises 60 px and fades over the last 300 ms. Gold `#FFD27A` for the player, brick `#C0533A` for the bot. Shown only if the trick has thirds > 0 or a bonus. Bonuses get a second line: "Pozlaćeno +1". |
| A16 | Draw: mac → reveal point | 380 | `power2.out` | Flips face up on the way. sfx `card_slide` at start, `card_flip` at 60%. |
| A17 | Reveal hold | 600 | – | Both players see the drawn card. A bot reveal also adds it to the Viđeno strip with a 200 ms pop. |
| A18 | Reveal → hand | 320 | `power2.inOut` | Player: into its new fan slot (A3 runs in parallel). Bot: flips face down and joins the opponent fan. |
| A19 | Draw choreography | ≈1500 total | – | The winner's draw runs A16 → A17 → A18. The loser's draw starts 250 ms after the winner's A17 begins. An akuža check runs after each A18 and may insert A23. |
| A20 | Shuffle | 700 | `sine.inOut` | Each deck stack splits into two half-stacks that hop 3 times (+0.15 y) and interleave. sfx `shuffle` once. |
| A21 | Deal | flight 300 per card, stagger 90 | `power2.out` | From each deck stack to its owner's hand, in packets of 5: player 5, bot 5, player 5, bot 5 (about 2.1 s). sfx `deal` per card (pitch ±5% random, at most 1 per 70 ms). Player cards flip face up on arrival (200 ms). |
| A22 | Mac form and remainder | 300 | `power2.out` | The next 10 cards slide to the mac position. The unused remainder slides 2 units off the table edge and fades (300 ms). |
| A23 | Akuža callout | 500 in + 1400 hold + 400 out | in `back.out(1.7)`, out `power2.in` | The combination cards fly to the showcase (the bot's cards flip face up = revealed). An HTML banner "NAPOLITANA! +3" (or "TRI TRICE! +3") scales 0.4 → 1 with `elastic.out(1, 0.5)` over 700 ms. Confetti. sfx `akuza_fanfare`. The match score counts up (A24). Several combinations in one check: one banner per combination, chained (hold 900 each). |
| A24 | Score count-up | 600 | `power1.out` | The number ticks to its new value. Scale pop 1 → 1.25 → 1 (`back.out`). sfx `chalk_tick` per point (max 6 ticks). |
| A25 | Speech bubble | in 220, hold, out 250 | in `back.out(2)`, out fade | Typewriter at 25 ms/char. Hold = max(2200, audioDuration + 600). Croatian text plus, if subtitles are on, the English gloss in italics below. |
| A26 | Portrait reaction | while speaking | – | Neutral: talk-bounce scale 1 ↔ 1.04, 120 ms yoyo loop. Angry: shake ±6 px for 300 ms plus a red inner glow. Laugh: bounce ±8 px vertical, 2 cycles of 160 ms. Sad: lean down 4 px, desaturate 30% for 1 s. |
| A27 | Fora activation | 350 fly + 300 hold + 400 dissolve | `power2.out` / `power2.in` | The fora card (HTML) flies from its slot to screen centre at scale 1.4, glows, then dissolves into gold sparks (CSS + canvas). The spent rakija glass drains: the liquid height goes from 100% to 0 over 300 ms and the icon swaps to empty. sfx `fora_use`, then `glass_clink`. A Tučem! use also plays `table_knock`. |
| A27b | Pogled reveal (player uses it) | 400 flip + hold until played | `power2.out` | The revealed bot cards lift 0.3 out of the opponent fan, flip face up for 1200 ms, flip back and join the Viđeno strip. When the bot uses Pogled: the targeted player cards flash a red glow for 600 ms. |
| A28 | Turn indicator | 300 fade in/out | `sine.inOut` | Player's turn: legal hand cards get a soft gold glow pulse (opacity 0.25 ↔ 0.55, 1.6 s loop); illegal cards are tinted `#8A8A8A` and lowered 0.05. |
| A29 | Bot thinking | loop 900 | – | Three dots bounce in the bubble position (CSS keyframes). |
| A30 | Hand summary panel | 400 slide from top | `power3.out` | Rows stagger in 150 ms apart; numbers count up (600). |
| A31 | Match win screen | fade 600 | `power2.out` | Title scale 0.6 → 1 with `elastic.out(1, 0.6)` over 900. Coin icons fly from the centre to the šoldi counter (1 coin per šoldo, max 20, stagger 60, flight 500 `power2.in`). sfx `win_stinger`, then `coins`. |
| A32 | Match lose screen | fade 600 | `power2.out` | The canvas gets a CSS filter `grayscale(0.6) brightness(0.8)` over 800 ms. sfx `lose_stinger`. |
| A33 | Screen transitions | 400 | `power2.inOut` | Crossfade between overlays and the table. |
| A34 | Shop offers deal-in | 300 each, stagger 80 | `back.out(1.5)` | From the top with rotation −8° → 0. |
| A35 | Ukras stamp | 250 fly + 120 stamp | `power2.in` / `back.out` | The badge flies onto the chosen card in the deck grid: scale 1.4 → 1, small dust ring. sfx `stamp`. |
| A36 | Map travel | 900 | `power2.inOut` | The token moves along the SVG path to the next node. sfx `map_step` twice. |
| A37 | Card removal (Izbaci) | 400 | `power2.in` | The card burns away (CSS mask gradient sweep plus ember sparks) and the grid reflows over 260 ms. |

### 11.2 Trick timeline (normal speed)

```
player turn: glow legal cards (A28) ─▶ player input ─▶ A7+A8 (≈540)
bot turn:    thinking dots (thinkMs) ─▶ A9+A8 (≈570)
both down:   A11 hold 550 (A12 inside) ─▶ A13 180 ─▶ A14 380 ─▶ A15 in parallel
if t ≤ 10:   A19 draw ≈1500 (+A23 if akuža)
next turn
```

### 11.3 Input rules

- Raycast only against player hand meshes (pick the highest index hit). Hover = A1.
- **Click** (pointerdown and pointerup on the same card with < 8 px movement) on a **legal** card plays it right away. **Drag** (> 8 px) starts A5; releasing within 2.5 units (table plane) of the trick centre plays the card, otherwise A6.
- Clicking or dropping an **illegal** card → A4, a toast and the `player_illegal` voice event.
- Input is ignored when it is not the player's turn or while any blocking animation runs; hover still works.
- Keyboard: `Esc` cancels targeting or closes overlays. Keys `1`–`9` and `0` play hand cards by index (left to right) if legal.

### 11.4 Hover tooltips

Hovering a card that has an ukras shows an HTML tooltip near the card's screen position: the badge, name and one-line description in the current language. Hovering a fora slot shows the name, cost, description and, if greyed out, the reason text (§6.3 reason keys).

### 11.5 Fora use

Clicking a usable fora slot either:
- (no target) applies it right away → A27; or
- (needs target: `zamjena`, `trica_iz_rukava`) enters **targeting mode**: the slot stays raised, hand cards glow cyan `#7FD6E0`, and the cursor becomes a crosshair. Clicking a hand card applies the fora → A27. Right-click or `Esc` cancels (no cost).

### 11.6 Pending choices

- `pickDraw` (Ribarsko): the two mac cards rise face up to the reveal point, side by side, with the caption "Ribarsko: izaberi kartu / pick one". Click one: it goes to the hand (A18) and the other slides to the bottom of the mac (300 ms).
- `reorderMac` (Namješteno): up to 3 cards fan face up at the reveal point. The player drags them to reorder (a horizontal HTML overlay with card images is acceptable), then clicks "Gotovo / Done". The leftmost card becomes the top of the mac.

---

## 12. Screens and HUD (HTML/CSS overlays)

General: all overlays live in `#ui`, styled in `src/ui/styles.css`. The reference resolution is 1920×1080. Set `--ui-scale: min(innerWidth/1920, innerHeight/1080)` (min 0.6) and size elements in `calc(px * var(--ui-scale))`. Fonts: **Alegreya** (headings, numbers) and **Alegreya Sans** (body), bundled via `@fontsource/alegreya` and `@fontsource/alegreya-sans` with the `latin-ext` subset so Croatian diacritics work. Palette: cream `#F3E6C8`, ink `#3A2618`, terracotta `#B5452B`, ochre `#D9A441`, olive `#6B7A3A`, Adriatic `#2F5D7C`; panels are dark wood `#2A1A10` at 92% opacity with a 2 px ochre border and 10 px radius. Buttons: cream text on terracotta, hover ochre, active pressed 2 px; sfx `ui_click` on click and `ui_hover` on hover.

### 12.1 Main menu

- Background: `env/bg_konoba.jpg` (blurred 6 px, darkened 30%). Ambient audio starts after the first click.
- `ui/logo.png` centred at the top (max-width 720 px). If it is missing, render "TREŠETA" in Alegreya 120 px with a cream fill and a 4 px ink stroke.
- Buttons (vertical): **Nastavi / Continue** (only if a save exists) · **Nova igra / New run** (confirms if it would overwrite a save) · **Kako se igra / How to play** · **Postavke / Settings**.
- Footer: stats ("Runde: 5 · Pobjede: 1").

### 12.2 In-match HUD

| Element | Position (1920×1080 ref) | Content |
|---|---|---|
| Opponent portrait | top centre, 150×150, top 18 px | Portrait in a round frame (4 px ochre ring); name plate below ("Gazda Jure") |
| Speech bubble | right of the portrait, max-width 380 px | Cream bubble, ink text, tail pointing to the portrait (A25) |
| Thinking dots | bubble position | A29 |
| Viđeno strip | left of the portrait, right-aligned | Label "Viđeno / Seen" + mini card faces (46×74) of bot hand cards known to the player |
| Score board | top-right, 300×190 | Chalkboard look (CSS: `#2E3B2F` with noise, chalk-white text in Alegreya). Line 1: "TI **12** : **9** JURE". Line 2: "do 21 · ruka 2". Line 3: "u ruci: 4⅔ : 3⅓" (live thirds this hand). |
| Rakija | bottom-left, glasses 44×60 each, 8 px gap | Full glasses (`ui/rakija_full.png`) for the rakija left, then empty ones up to the base. Glasses above base (Pijano) get an ochre outline. Label "Rakija". |
| Fore slots | bottom-left above the rakija, 4 slots of 104×166 | Fora art (`fore/<id>.png`) in a cream frame, name on a ribbon, cost as small glass icons top-right. Used this hand: greyed out with "✓". Not usable now: 60% opacity. Empty slot: dashed outline. |
| Šoldi | bottom-right | `ui/coin.png` 40×40 + number (Alegreya 36) |
| Mac counts | following the projected 3D positions | "Mac 7" chips (cream on ink, 14 px) |
| Toasts | centre, 62% height | 1600 ms fade toasts: "Tvoj red" / "Your turn" (shown only when the bot just finished and the player hasn't acted for 1.5 s), follow-suit errors, fora feedback |
| Settings gear | top-left | Opens settings (§12.9). Pauses the bot. |

Toast strings are in Appendix A.

### 12.3 Map and opponent intro

- **Map:** full-screen `env/bg_map.jpg`. An SVG overlay draws a dashed cream path through 7 nodes at fixed percentage coordinates (x%, y%): K1 (14, 78) · B1 (27, 64) · K2 (40, 55) · B2 (53, 46) · K3 (66, 38) · B3 (77, 30) · K4 (88, 18). Konoba nodes are 64 px circles holding the opponent portrait; butiga nodes are 44 px circles holding the coin icon. Beaten nodes get an ochre check, the current node pulses (scale 1 ↔ 1.08, 1.2 s), and the token (a small rakija glass icon) sits on the current node. Clicking the current konoba node opens the intro.
- **Intro panel** (centred, 720×520): large portrait 260×260; name, konoba name, bio (current language); difficulty as 1–4 glass icons; "Fore:" list of the bot's fore (mini art 48×76 plus name); "Ukrasi:" list of the bot's enhanced cards (mini card plus badge); "Špil: 40 karata" (36 for Bepo). Button **Sjedni za stol / Take a seat**.

### 12.4 Hand summary (after every hand)

Panel slides from the top (A30), 640×420:

| Row | Ti / You | Jure |
|---|---|---|
| Karte (bele) | 4 (13 bela) | 6 (19 bela) |
| Ultima | +1 | – |
| Ukrasi | +1 | – |
| Akuže | +3 | – |
| **Ukupno ruka** | **9** | **6** |
| Partija | 17 | 12 |

"Ukupno ruka" = cards + ultima + ukrasi + akuže of this hand, as a display total. The akuže were already added to the score when declared (§3.7), so "Partija" (the score after the hand) equals the previous score + Ukupno ruka. Show the rounding note "(⅓ otpada)" / "(⅔ otpada)" when a remainder was dropped, or "(Krivi račun: zaokruženo gore)" when that fora was used. Button **Dalje / Continue**, or Space/Enter. If the match is over, the button leads to the match end screen.

### 12.5 Match end

- **Win:** "POBIJEDIO SI!" / "YOU WON!"; the opponent's portrait in its sad state; reward breakdown "Pobjeda +12 · Razlika +6 · Akuže +3 = **21 šoldi**" (A31); voice `match_bot_lose`. Button **U butigu / To the shop** (for match 4: **Dalje / Continue** to the run-end screen).
- **Lose:** "IZGUBIO SI..." / "YOU LOST..."; the opponent laughing; voice `match_bot_win`. Buttons **Revanš (1) / Rematch (1)** if available, and **Kraj / Give up** → run end.

### 12.6 Butiga (shop)

Full-screen `env/bg_shop.jpg`; title "Butiga" top-left in Alegreya 64; šoldi counter top-right.
- **Counter area** (centre, row of 3): offer cards 260×420, each showing art (ukras: badge 160×160 on a cream card; fora: fora art; čašica: rakija icon), name, type tag ("Ukras", "Fora", "Trajno / Permanent"), rarity pip (common cream, uncommon Adriatic blue, rare ochre), description, and a **Kupi · 7** button. Sold: "Prodano" stamp at 15° rotation.
- **Right column:** **Promišaj · 2** (reroll), **Izbaci kartu · 5** (with "0/2" usage), **Dalje / Continue**.
- **Bottom strip:** your fore slots (as in the HUD) and a "Špil (38)" button that opens the **deck grid**.
- **Deck grid** (modal, 10 columns × 4 rows of 96×154 mini cards, sorted by suit kupe → bate → spade → dinari, then by rank strength descending). Used for choosing ukras targets and removal targets, and for browsing. Removed cards are not shown.

### 12.7 Run end

The victory screen "KRALJ KONOBE!" or the defeat screen "KRAJ RUNDE" with the stats from §4.4. Button **Nova igra / New run** → menu. This clears the save.

### 12.8 How to play (overlay text)

The texts are in Appendix B, shown as a scrollable panel with a mini rank strip (3 2 1 13 12 11 7 6 5 4) drawn using the card images.

### 12.9 Settings

| Setting | Values | Default |
|---|---|---|
| Jezik / Language | `hr`, `en` | `navigator.language` starts with `hr` → `hr`, else `en` |
| Titlovi / Subtitles (EN gloss under bot lines) | on/off | on if language is `en`, off if `hr` |
| Brzo igranje / Fast animations | on/off | off |
| Glasnoća / Volume: master, voice, sfx, ambient | 0–1 sliders | 0.8, 1.0, 0.8, 0.5 |

### 12.10 First-run tips (non-blocking toasts, once each, stored in settings)

1. First player turn: "Moraš pratiti boju ako je imaš." / "Follow suit if you can."
2. First draw: "Karta koju povučeš vidi se protivniku, a i njegova tebi." / "Drawn cards are shown to both players."
3. First akuža (any side): "Akuže se prijavljuju same." / "Declarations are scored automatically."
4. First turn with a usable fora: "Fore troše rakiju; svaka jednom po ruci." / "Tricks cost rakija; each once per hand."
5. First hand summary: "Bele se zbrajaju; ostatak se gubi." / "Thirds add up; the leftover fraction is lost."

---

## 13. Visual asset manifest (contract for the visual asset agent)

### 13.1 Style

Everything shares one look: **painterly antique Triestine/Venetian playing card, warm Adriatic palette**. Use bold dark-brown ink outlines, flat warm colour areas with gouache brush and paper grain, and a slightly humorous character feel. Avoid glossy 3D, neon, gems, sci-fi frames and any likeness to existing games.

Prepend one of these prefixes to every prompt in §13.2:

- **`STYLE_CARD`** (cards, suits, badges, fore art, icons, logo):
  > Hand-painted gouache and ink illustration in the style of an antique 19th-century Triestine/Venetian Italian playing card, woodcut-coloured print look: bold confident dark-brown ink outlines, flat areas of warm colour with subtle brush texture and aged paper grain, limited palette of terracotta red #B5452B, ochre gold #D9A441, olive green #6B7A3A, Adriatic blue #2F5D7C, cream parchment #F3E6C8 and deep brown ink #3A2618. No religious symbols, no crosses, no halos. Absolutely no text, letters, numbers or watermark.
- **`STYLE_SCENE`** (portraits, backgrounds, table):
  > Warm painterly illustration with gouache and oil texture, Mediterranean Dalmatian atmosphere, oil-lamp and dusk lighting, palette of terracotta, ochre, olive, Adriatic blue, cream and deep brown, soft edges, cosy and slightly humorous, matching an antique Italian playing-card aesthetic. No religious symbols. Absolutely no text, letters, signs or watermark.
- **`CUTOUT`** (appended to prompts of transparent assets):
  > Single subject isolated on a plain flat light-grey (#DDDDDD) background, generous empty margin on all sides, no cast shadow, no other objects.

Generation: use the `gen-image` skill (Codex CLI, gpt-image-2). Generate only at **1024×1024, 1024×1536 or 1536×1024**. Transparent assets use the skill's `rembg` cutout step (or native transparency if available). Save raw outputs to `assets_src/gen/<gen_id>.png`. Then resize, crop and composite with Python PIL into `public/assets/...`. If a generation is clearly off-brief (wrong subject, text in the image, a religious symbol), regenerate it, at most 2 retries per id.

### 13.2 Generated images (41 generations)

| # | gen_id | Gen size | Cut-out | Final output(s) | Prompt (after the prefix) |
|---|---|---|---|---|---|
| 1 | `card_frame` | 1024×1536 | no | used by the compositor only | Front face of an antique Italian playing card, completely flat and front-on, the card fills the entire image edge to edge with no table, no perspective, no shadow. Warm cream parchment with faint paper grain, a thin double border inset about 3% from the edges in terracotta red and ochre gold, tiny symmetrical olive-leaf flourishes just inside the four corners, and a large completely empty plain centre covering 85% of the card. No symbols, no figures. |
| 2 | `suit_kupe` | 1024×1024 | yes | `cards/suits/kupe.png` 256×256 | A single Italian playing-card suit symbol for "coppe" (cups): an ornate golden wine goblet with a wide bowl, a terracotta-red band and a short stem on a round foot, perfectly frontal and upright, centred, filling 80% of the frame. |
| 3 | `suit_bate` | 1024×1024 | yes | `cards/suits/bate.png` 256×256 | A single Italian playing-card suit symbol for "bastoni" (clubs): a knobbly warm-brown wooden cudgel with small olive-green leaf buds sprouting from the knots, perfectly vertical with the thick end up, centred, filling 85% of the frame height. |
| 4 | `suit_spade` | 1024×1024 | yes | `cards/suits/spade.png` 256×256 | A single Italian playing-card suit symbol for "spade" (swords): a straight double-edged sword with an Adriatic-blue steel blade, a simple ochre-gold crossguard and a round pommel, perfectly vertical with the point up, centred, filling 85% of the frame height. |
| 5 | `suit_dinari` | 1024×1024 | yes | `cards/suits/dinari.png` 256×256 | A single Italian playing-card suit symbol for "denari" (coins): one round gold coin with a raised rim and a stylised eight-petal flower in the centre with a small terracotta-red dot, frontal, centred, filling 80% of the frame. |
| 6–17 | `court_<suit>_<k\|c\|f>` | 1024×1536 | no | used by the compositor | **Court template:** "Court-card figure for an antique Triestine-style Italian playing card: {SPEC}. Shown from the knees up (the knight: horse and rider complete), centred, three-quarter view, against a plain cream parchment background with a faint arched niche; the figure fills about 85% of the image height and the head is not cropped. Costume in 18th-century Venetian-Dalmatian style; crowns and hats carry no cross or religious symbol. Dominant colours: {COLOURS}." The 12 SPEC/COLOURS values are in §13.3. |
| 18 | `card_back` | 1024×1536 | no | `cards/back_player.png` 480×768 and (derived) `cards/back_bot.png` | The back of a playing card filling the entire image edge to edge, flat and front-on: a perfectly symmetric ornamental pattern in terracotta red, ochre and cream; a central oval medallion containing a small rakija shot glass and a sprig of olive, surrounded by a fine lattice of diamond and wave motifs inspired by Dalmatian stone carving and lace; thin cream border; symmetric vertically and horizontally. |
| 19 | `ukrasi_sheet_a` | 1536×1024 | yes | 5 badges (§13.4) | Five round wax-seal medallion icons in a single horizontal row, evenly spaced with wide empty gaps, all the same size (each about 230 px across), flat frontal view, each seal a different colour with an embossed symbol, left to right: (1) gold seal with a gilded laurel leaf and a sparkle, (2) silver seal with a small coin, (3) steel-blue seal with a whetstone and a knife blade, (4) chilli-red seal with a hot red pepper, (5) white-cream seal with a small salt cellar and salt crystals. |
| 20 | `ukrasi_sheet_b` | 1536×1024 | yes | 5 badges (§13.4) | Same layout and style as sheet A; left to right: (1) herb-green seal with a small tipped rakija bottle, (2) violet seal with a wild boar's head in profile, (3) orange seal with a brass horn, (4) midnight-blue seal with a crescent moon over waves, (5) sea-teal seal with a fishing net and a small fish. |
| 21 | `fora_pogled` | 1024×1536 | no | `fore/pogled.png` 480×768 | Small vignette scene: an old card player's single sly eye peeking over the top edge of a fan of face-down playing cards, warm oil-lamp light, dark tavern background. |
| 22 | `fora_zamjena` | 1024×1536 | no | `fore/zamjena.png` | Vignette: close-up of a hand sliding one playing card under a face-down deck on a wooden table while another card slips off the top, little swish lines. |
| 23 | `fora_namjesteno` | 1024×1536 | no | `fore/namjesteno.png` | Vignette: nimble fingers secretly arranging three face-down playing cards on top of a deck, a candle flame nearby, conspiratorial mood. |
| 24 | `fora_krivi_racun` | 1024×1536 | no | `fore/krivi_racun.png` | Vignette: a crumpled tavern bill covered only in illegible scribbles and tally strokes (no readable letters or digits), a stubby pencil and a few brass coins on a wooden table. |
| 25 | `fora_ti_otvaraj` | 1024×1536 | no | `fore/ti_otvaraj.png` | Vignette: a polite open hand gesturing "after you" across a wooden tavern table toward the viewer, the other hand holding a fan of cards. |
| 26 | `fora_tucem` | 1024×1536 | no | `fore/tucem.png` | Vignette: a weathered fist knocking hard on a thick wooden tavern table, small shot glasses and playing cards jumping from the impact, motion lines. |
| 27 | `fora_napij_ga` | 1024×1536 | no | `fore/napij_ga.png` | Vignette: a hand pouring clear golden rakija from a small bottle into an already overflowing shot glass, splashes, cheeky mood. |
| 28 | `fora_vrati` | 1024×1536 | no | `fore/vrati.png` | Vignette: a hand firmly pushing a single face-up playing card back across a wooden table toward the far side, the other hand raised in a "stop" gesture. |
| 29 | `fora_trica_iz_rukava` | 1024×1536 | no | `fore/trica_iz_rukava.png` | Vignette: a playing card showing three small golden cups sliding out of the cuff of a white linen shirt sleeve, sly dramatic light. |
| 30 | `fora_duplo_ili_nista` | 1024×1536 | no | `fore/duplo_ili_nista.png` | Vignette: two identical playing cards fanned side by side glowing with golden light above a small pile of brass coins, dramatic warm light. |
| 31 | `portrait_tonci` | 1024×1024 | no | `portraits/tonci.png` 512×512 | Character portrait, chest up, facing the viewer, background a softly blurred stone konoba wall: Mali Tonči, a cheeky 22-year-old Dalmatian guy, deeply tanned, curly black hair with sunglasses pushed up on his head, half-unbuttoned white linen shirt, a thin gold chain, a toothpick in his sly grin, holding playing cards close to his chest. |
| 32 | `portrait_jure` | 1024×1024 | no | `portraits/jure.png` | Same framing: Gazda Jure, a big loud 55-year-old Dalmatian tavern owner, round belly, thick black moustache, red cheeks, striped shirt with rolled sleeves under a stained apron, a kitchen towel over one shoulder, laughing with his mouth open, wine barrels behind him. |
| 33 | `portrait_luka` | 1024×1024 | no | `portraits/luka.png` | Same framing: Barba Luka, a 72-year-old Dalmatian fisherman, weathered sunburnt face with deep wrinkles and white stubble, navy knitted fisherman's cap, thick cream wool sweater, squinting suspiciously over his cards, a coil of fishing net behind him. |
| 34 | `portrait_bepo` | 1024×1024 | no | `portraits/bepo.png` | Same framing: Did Bepo, an 85-year-old island card champion, bald with a magnificent white moustache, a small flat red cap, a black traditional Dalmatian vest over a white shirt, calm mischievous half-smile, a tiny glass of rakija in front of him. |
| 35 | `env_table` | 1536×1024 | no | `env/table_wood.jpg` 1536×1024 (q 88) | Top-down orthographic view of the surface of a thick old tavern table made of wide oak planks running left to right, scratches and knife marks, a faint wine-ring stain near one corner, warm lamplight pooling in the centre with darker edges, nothing on the table, no perspective. |
| 36 | `env_bg_konoba` | 1536×1024 | no | `env/bg_konoba.jpg` 1536×1024 | Interior of a cosy stone Dalmatian konoba at dusk, eye-level view toward the back wall: rough limestone walls, dark wooden ceiling beams, wine barrels, a hanging pršut ham and garlic braids, an old fishing net and an oil lamp on the wall; in the upper centre an arched window shows the Adriatic sea and islands at sunset under a pink-orange sky; the lower third of the image is a darker, plainer floor area (it will be hidden behind the table); no people. |
| 37 | `env_bg_map` | 1536×1024 | no | `env/bg_map.jpg` | Illustrated painterly map of a Dalmatian coastline seen from above: turquoise Adriatic sea with small islands along the right side, rocky coast with olive groves, vineyards and little stone villages, a winding pale stone road from the lower left to the upper right, a compass rose drawn without letters, aged parchment border. |
| 38 | `env_bg_shop` | 1536×1024 | no | `env/bg_shop.jpg` | Interior of a small old Dalmatian village shop ("butiga"): a long wooden counter across the lower part, shelves behind with rakija bottles, olive-oil tins, jars of dried figs, packs of playing cards and a brass scale, a small bell above the door, warm afternoon light; the middle of the counter is clear and empty; no people. |
| 39 | `ui_coin` | 1024×1024 | yes | `ui/coin.png` 256×256 | A single old brass-gold coin, frontal, with a raised rim and an embossed small Dalmatian sailing boat (gajeta) with a lateen sail in the centre, warm metallic highlights, centred, filling 80% of the frame. |
| 40 | `ui_rakija` | 1024×1024 | yes | `ui/rakija_full.png` 256×256 and (derived) `ui/rakija_empty.png` | A small stemless shot glass full of clear, faintly golden herbal rakija with a little green herb sprig inside, a light glint on the glass, frontal, centred, filling 80% of the frame height. |
| 41 | `logo` | 1536×1024 | yes | `ui/logo.png` 1200×800 (trimmed, centred) | Game logo: the word "TREŠETA" in big hand-painted ornamental serif capitals, cream fill with a dark-brown outline and ochre-gold shading. The letter Š has a clearly visible háček (caron) above it. Behind the word are two crossed playing cards and an olive branch; below it sits a small rakija glass. Centred. **This is the only image that contains text.** |

Logo fallback: if the "Š" (or any letter) is malformed after 2 retries, generate `logo` without the word ("emblem only: two crossed playing cards, an olive branch and a small rakija glass") and render "TREŠETA" onto it with PIL (Georgia Bold, cream fill `#F3E6C8`, 6 px stroke `#3A2618`, above the emblem).

### 13.3 Court figures (SPEC and COLOURS for gens 6–17)

| gen_id | SPEC | COLOURS |
|---|---|---|
| `court_kupe_k` | Kralj kupe, the King of Cups: a jovial red-bearded king in a simple gold crown, raising a large golden goblet as if making a toast | terracotta red and ochre gold |
| `court_kupe_c` | Konj kupe, the Knight of Cups: a young rider on a sturdy chestnut horse, holding a golden goblet high in one hand | terracotta red and ochre gold |
| `court_kupe_f` | Fanat kupe, the Knave of Cups: a cheerful young page in a small red Dalmatian cap, carrying a golden goblet carefully in both hands | terracotta red and ochre gold |
| `court_bate_k` | Kralj bate, the King of Clubs: a stern grey-bearded king resting a big knobbly wooden club on his shoulder | olive green and ochre |
| `court_bate_c` | Konj bate, the Knight of Clubs: a rider on a dappled grey horse carrying a knobbly wooden club upright | olive green and ochre |
| `court_bate_f` | Fanat bate, the Knave of Clubs: a cheeky young page with a crooked grin, leaning on a knobbly wooden club | olive green and ochre |
| `court_spade_k` | Kralj špade, the King of Swords: a proud dark-bearded king holding a straight sword upright in front of him with both hands on the hilt | Adriatic blue and steel grey with ochre trim |
| `court_spade_c` | Konj špade, the Knight of Swords: a rider on a black horse with a straight sword raised | Adriatic blue and steel grey with ochre trim |
| `court_spade_f` | Fanat špade, the Knave of Swords: an alert young guard holding a straight sword lowered at his side | Adriatic blue and steel grey with ochre trim |
| `court_dinari_k` | Kralj dinari, the King of Coins: a plump smiling king holding a big gold coin against his chest | ochre gold and terracotta |
| `court_dinari_c` | Konj dinari, the Knight of Coins: a rider on a white horse holding a large gold coin like a small shield | ochre gold and terracotta |
| `court_dinari_f` | Fanat dinari, the Knave of Coins: a young page holding up a gold coin and admiring it with wide eyes | ochre gold and terracotta |

### 13.4 Badge sheet cutting

After the cut-out step, find connected components with alpha > 32, discard blobs smaller than 2% of the sheet area, and expect exactly **5 blobs** per sheet. Sort them left to right, crop each to its bounding box plus a 6% margin, pad to square and resize to **256×256**. Map them as follows:

| Sheet | Position 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| A | `ukrasi/pozlaceno.png` | `ukrasi/srebreno.png` | `ukrasi/nabruseno.png` | `ukrasi/ljuto.png` | `ukrasi/usoljeno.png` |
| B | `ukrasi/pijano.png` | `ukrasi/divlje.png` | `ukrasi/glasno.png` | `ukrasi/ponocno.png` | `ukrasi/ribarsko.png` |

If a sheet does not yield 5 clean blobs after 2 retries, generate the missing badges one at a time (1024×1024, `CUTOUT`, same seal description). That is the only allowed overrun of the image budget.

### 13.5 Card face compositing (PIL), producing the 40 faces

**Canvas:** 480×768 RGBA. The generated 1024×1536 images (ratio 1.5) are centre-cropped to 960×1536 (ratio 1.6) and then resized to 480×768 (Lanczos).

1. **Base:** the cropped and resized `card_frame`. Apply a rounded-rectangle alpha mask (radius 24 px) and draw a 2 px inner stroke in `#3A2618` at 60% alpha along the rounded edge.
2. **Corner index blocks** (all 40 cards): the index text uses the Triestine numerals: `A`→"1", `2`→"2", `3`→"3", `4`–`7`→"4"–"7", `F`→"11", `C`→"12", `K`→"13". Font: Georgia Bold (`/System/Library/Fonts/Supplemental/Georgia Bold.ttf`; fallback DejaVu Serif Bold; fallback the PIL default), 52 px, colour `#3A2618`, centred at (46, 52). The suit icon is 40×40, centred at (46, 104). Bottom-right: the same block rotated 180°, so the text is centred at (434, 716) and the icon at (434, 664).
3. **Number cards** (ranks `2`, `3`, `4`, `5`, `6`, `7`): suit pips at these centres. Pip size is 120 px for the 2 and 3, and 104 px for the 4–7. For **bate** and **spade**, pips in the lower half (y > 384) are rotated 180°; kupe and dinari pips stay upright.

| Rank | Pip centres (x, y) |
|---|---|
| 2 | (240, 250), (240, 518) |
| 3 | (240, 200), (240, 384), (240, 568) |
| 4 | (160, 250), (320, 250), (160, 518), (320, 518) |
| 5 | the 4 layout + (240, 384) |
| 6 | (160, 200), (320, 200), (160, 384), (320, 384), (160, 568), (320, 568) |
| 7 | the 6 layout + (240, 292) |

4. **Aces:** one 280×280 suit icon centred at (240, 384), surrounded by a PIL-drawn ornament: a circle of radius 170 (6 px stroke `#D9A441`), an inner circle of radius 160 (3 px stroke `#B5452B`), and 8 dots of radius 6 (`#B5452B`) at radius 188, every 45° starting at 22.5°.
5. **Courts (K, C, F):** the court art is cover-fitted into the panel rectangle (70, 128)–(410, 688) (340×560): scale to the panel height, then centre-crop the width. Mask the panel with an arched top (a semicircle of radius 170 centred at (240, 298), joined to the rectangle below) and draw a 4 px `#3A2618` border around the arch shape. Add a small 48×48 suit icon centred at (240, 724).
6. Save as `public/assets/cards/<suit>_<rank>.png` (PNG, RGBA).

**Card back derivation:** `back_player.png` = the cropped and resized `card_back` with the same rounded mask and stroke. `back_bot.png` = `back_player.png` with its hue rotated +150° and saturation ×0.85 (it reads as teal-green).

**Rakija empty derivation:** `rakija_empty.png` = `rakija_full.png` with saturation ×0.15 and alpha ×0.45.

**Fore art:** centre-crop to 960×1536 → 480×768, no mask (the UI frames it).

**Portraits:** resize to 512×512 (the UI applies a circular mask).

### 13.6 Final image file list (all under `public/assets/`)

| Group | Files |
|---|---|
| Card faces (40) | `cards/{kupe,bate,spade,dinari}_{3,2,a,k,c,f,7,6,5,4}.png`, e.g. `cards/kupe_3.png`, `cards/kupe_a.png`, `cards/bate_k.png`, `cards/spade_c.png`, `cards/dinari_f.png`, `cards/dinari_4.png` |
| Card backs (2) | `cards/back_player.png`, `cards/back_bot.png` |
| Suit icons (4) | `cards/suits/kupe.png`, `cards/suits/bate.png`, `cards/suits/spade.png`, `cards/suits/dinari.png` |
| Ukras badges (10) | `ukrasi/{pozlaceno,srebreno,nabruseno,ljuto,usoljeno,pijano,divlje,glasno,ponocno,ribarsko}.png` |
| Fore art (10) | `fore/{pogled,zamjena,namjesteno,krivi_racun,ti_otvaraj,tucem,napij_ga,vrati,trica_iz_rukava,duplo_ili_nista}.png` |
| Portraits (4) | `portraits/{tonci,jure,luka,bepo}.png` |
| Environment (4) | `env/table_wood.jpg`, `env/bg_konoba.jpg`, `env/bg_map.jpg`, `env/bg_shop.jpg` |
| UI (4) | `ui/coin.png`, `ui/rakija_full.png`, `ui/rakija_empty.png`, `ui/logo.png` |

Total: 78 final files from 41 generations. The asset agent should also save a QA contact sheet of all 40 faces plus the backs to `assets_src/preview/cards_contact_sheet.png` (not loaded by the game).

---

## 14. Audio manifest (contract for the audio agent)

**All audio is pre-generated by the audio agent with ElevenLabs and shipped as mp3 files. The game never calls ElevenLabs or any other service at runtime.**

### 14.1 Voice lines

- Model: the latest ElevenLabs TTS model that supports inline audio tags (eleven v3 or the newer "v4"). Language: Croatian (`hr`). Send the **TTS text** from §9.3 exactly, including the bracketed tags. The tags are free-form performance directions; if the model ignores one, keep the take anyway.
- Voices: one designed voice per persona from the briefs in §9.2 (Voice Design, or the closest library voice). Use the same voice for every line of a persona. Settings: expressive/"Creative" stability (about 0.35), similarity about 0.75, style about 0.6, speaker boost on.
- Generate 2 takes per line and keep the one that best fits the tag and sounds most natural in Croatian. The Dalmatian ikavian spelling (mliko, sriću, odnija, virovat, mišaja, dobivan) is intentional; do not "correct" it.
- Post-processing: trim leading silence to ≤ 50 ms and trailing silence to ≤ 150 ms, normalise to **−16 LUFS** integrated with a −1 dBTP peak, and export mono mp3 44.1 kHz 128 kbps.
- Paths: `public/assets/audio/voice/<persona>/<line_id>.mp3`.

| Persona | Files (30 each) |
|---|---|
| `barba` | the 28 common lines (ids 1–28 in §9.3) + `ka_riba`, `stari_ja` |
| `gazda` | the 28 common lines + `u_mojoj_konobi`, `runda_na_mene` |
| `mali` | the 28 common lines + `ka_bombone`, `oces_danas` |

Example paths: `audio/voice/barba/jebem_ti_mliko.mp3`, `audio/voice/gazda/u_mojoj_konobi.mp3`, `audio/voice/mali/aha_sta_je_sad.mp3`.

### 14.2 Sound effects and ambience

- ElevenLabs Sound Effects (text-to-SFX), prompt influence about 0.5, duration as listed. Export mp3 44.1 kHz: **mono** for short sfx, **stereo** for stingers and ambience.
- Normalisation: short sfx peak −3 dBFS; stingers −16 LUFS; ambience −26 LUFS. Trim leading silence to ≤ 20 ms.
- Loops (`loop: yes`): generate with the loop option if available; otherwise make them seamless with a 1.5 s crossfade of the tail into the head (ffmpeg). Verify there is no click at the loop point.
- Paths: `public/assets/audio/sfx/<id>.mp3`.

| id | Duration (s) | Loop | Default volume | ElevenLabs prompt |
|---|---|---|---|---|
| `card_slide` | 0.5 | no | 0.7 | A single playing card sliding quickly across a wooden table, soft papery swish, close-up, dry room. |
| `card_flip` | 0.3 | no | 0.7 | Crisp flick of a single paper playing card being flipped over, close-up. |
| `card_place` | 0.4 | no | 0.8 | A playing card slapped down onto a thick wooden tavern table, short papery thwack with a woody thump. |
| `card_slam_strong` | 0.7 | no | 0.9 | A playing card slammed hard onto a heavy wooden table, loud knuckle thump, small glasses on the table rattle briefly. |
| `shuffle` | 1.4 | no | 0.7 | Riffle shuffle of a deck of thin paper playing cards followed by a quick bridge, close-up. |
| `deal` | 0.25 | no | 0.5 | One playing card dealt and tossed onto a wooden table, quick soft flick. |
| `trick_whoosh` | 0.5 | no | 0.6 | Two playing cards swept quickly across a wooden table, soft whoosh. |
| `card_pile` | 0.3 | no | 0.6 | Cards dropping onto a small pile of cards on wood, soft papery pat. |
| `coins` | 1.0 | no | 0.8 | A handful of old brass coins dropped onto a wooden counter, bright jingling. |
| `coin_single` | 0.3 | no | 0.7 | A single small metal coin clinking on wood. |
| `glass_clink` | 0.6 | no | 0.7 | Two small shot glasses clinking together, bright glass ting. |
| `glass_slam` | 0.5 | no | 0.8 | A small heavy glass set down hard on a wooden table, angry thud with a little glass ring. |
| `rakija_pour` | 1.2 | no | 0.7 | Pouring a small shot of clear spirit from a bottle into a small glass, gentle glug glug. |
| `akuza_fanfare` | 2.0 | no | 0.8 | Short triumphant Mediterranean folk fanfare on mandolin and accordion, bright, ending on a strong major chord. |
| `win_stinger` | 3.5 | no | 0.8 | Joyful Dalmatian folk celebration flourish: mandolin tremolo, accordion and hand claps, ending with a short cheer from a small tavern crowd. |
| `lose_stinger` | 3.0 | no | 0.8 | Comic sad descending accordion phrase, deflating, with a few tavern patrons going "ooooh". |
| `ui_click` | 0.15 | no | 0.5 | Soft wooden click of a small wooden button. |
| `ui_hover` | 0.12 | no | 0.25 | Very soft, subtle papery tick. |
| `ui_error` | 0.35 | no | 0.6 | Dull double knock on wood, low and short, disapproving. |
| `stamp` | 0.45 | no | 0.8 | A wax seal stamped firmly onto paper, soft thump with a slight squish. |
| `fora_use` | 0.9 | no | 0.8 | Quick sleight of hand: a card snapped out of a sleeve, cloth rustle and a sharp card snap. |
| `table_knock` | 0.5 | no | 0.9 | Knuckles knocking twice, firmly, on a thick wooden table. |
| `chalk_tick` | 0.25 | no | 0.5 | A short scratch of chalk on a small blackboard writing one tally mark. |
| `shop_bell` | 0.9 | no | 0.7 | A small brass shop-door bell ringing once in an old village shop. |
| `map_step` | 0.4 | no | 0.6 | Two footsteps on stone pavement outdoors on a quiet evening. |
| `ambient_konoba` | 22 | **yes** | 0.35 | Inside a cosy stone Dalmatian tavern at night: low murmur of a few people talking indistinctly, an occasional glass clink, a chair creak, distant laughter, warm room tone, no music, no clear words. |
| `ambient_cicadas` | 22 | **yes** | 0.25 | Summer evening outdoors on the Adriatic coast heard through an open window: steady chorus of cicadas, gentle distant sea waves, warm still night, no voices. |

When each sound plays:

| Context | Sounds |
|---|---|
| Menu, map, shop, match | both ambient loops (shop: konoba loop at 50% of its volume) |
| Shop entry | `shop_bell` |
| Deal, play, trick, draw | see §11.1 |
| Fora | `fora_use`, `glass_clink`, plus `table_knock` for Tučem!; `rakija_pour` when rakija is gained (Pijano, new hand refill only if any glass was empty) |
| Score change | `chalk_tick` |
| Coins gained | `coin_single` (Srebreno) / `coins` (reward) |

---

## 15. `public/assets/manifest.json`

The **implementation agent writes this file** from the tables in §13.6 and §14 before any assets exist. Asset agents never edit it. The game loads it at startup, and every asset lookup goes through it. Paths are relative to `assets/`.

### 15.1 Schema (TypeScript shape)

```ts
interface AssetManifest {
  version: 1;
  basePath: 'assets/';
  images: {
    cards:     Record<`${Suit}_${RankFile}`, string>;      // 40 entries, key e.g. "kupe_3", "kupe_a"
    backs:     { player: string; bot: string };
    suits:     Record<Suit, string>;                       // kupe, bate, spade, dinari
    ukrasi:    Record<UkrasId, string>;                    // 10
    fore:      Record<ForaId, string>;                     // 10
    portraits: Record<OpponentId, string>;                 // tonci, jure, luka, bepo
    env:       { table: string; konoba: string; map: string; shop: string };
    ui:        { coin: string; rakija_full: string; rakija_empty: string; logo: string };
  };
  audio: {
    sfx:     Record<SfxId, { src: string; volume: number }>;                  // 25 one-shots
    ambient: Record<'konoba' | 'cicadas', { src: string; volume: number; loop: true }>;
    voice:   Record<PersonaId, Record<VoiceLineId, string>>;                  // 30 per persona
  };
}
type RankFile = '3' | '2' | 'a' | 'k' | 'c' | 'f' | '7' | '6' | '5' | '4';
```

### 15.2 Excerpt (the full file follows the same pattern for every id)

```json
{
  "version": 1,
  "basePath": "assets/",
  "images": {
    "cards": {
      "kupe_3": "cards/kupe_3.png",
      "kupe_2": "cards/kupe_2.png",
      "kupe_a": "cards/kupe_a.png",
      "kupe_k": "cards/kupe_k.png",
      "spade_c": "cards/spade_c.png",
      "dinari_4": "cards/dinari_4.png"
    },
    "backs": { "player": "cards/back_player.png", "bot": "cards/back_bot.png" },
    "suits": { "kupe": "cards/suits/kupe.png", "bate": "cards/suits/bate.png", "spade": "cards/suits/spade.png", "dinari": "cards/suits/dinari.png" },
    "ukrasi": { "pozlaceno": "ukrasi/pozlaceno.png", "ribarsko": "ukrasi/ribarsko.png" },
    "fore": { "pogled": "fore/pogled.png", "duplo_ili_nista": "fore/duplo_ili_nista.png" },
    "portraits": { "tonci": "portraits/tonci.png", "jure": "portraits/jure.png", "luka": "portraits/luka.png", "bepo": "portraits/bepo.png" },
    "env": { "table": "env/table_wood.jpg", "konoba": "env/bg_konoba.jpg", "map": "env/bg_map.jpg", "shop": "env/bg_shop.jpg" },
    "ui": { "coin": "ui/coin.png", "rakija_full": "ui/rakija_full.png", "rakija_empty": "ui/rakija_empty.png", "logo": "ui/logo.png" }
  },
  "audio": {
    "sfx": {
      "card_slide": { "src": "audio/sfx/card_slide.mp3", "volume": 0.7 },
      "card_place": { "src": "audio/sfx/card_place.mp3", "volume": 0.8 }
    },
    "ambient": {
      "konoba":  { "src": "audio/sfx/ambient_konoba.mp3",  "volume": 0.35, "loop": true },
      "cicadas": { "src": "audio/sfx/ambient_cicadas.mp3", "volume": 0.25, "loop": true }
    },
    "voice": {
      "barba": { "jebem_ti_mliko": "audio/voice/barba/jebem_ti_mliko.mp3", "ka_riba": "audio/voice/barba/ka_riba.mp3" },
      "gazda": { "u_mojoj_konobi": "audio/voice/gazda/u_mojoj_konobi.mp3" },
      "mali":  { "ka_bombone": "audio/voice/mali/ka_bombone.mp3" }
    }
  }
}
```

The full file has 40 cards, 2 backs, 4 suits, 10 ukrasi, 10 fore, 4 portraits, 4 env, 4 ui, 25 sfx (every id in §14.2 except the two ambience loops), 2 ambient entries and 90 voice entries. A vitest test (`tests/manifest.test.ts`) asserts these counts and that every id used in code data files exists in the manifest.

---

## 16. Technical architecture (implementation agent)

### 16.1 Stack and scripts

- **Vite + TypeScript (strict) + three + gsap.** Menus, HUD and shop are plain HTML/CSS overlays; no UI framework.
- Dependencies: `three`, `gsap`, `@fontsource/alegreya`, `@fontsource/alegreya-sans`. Dev dependencies: `typescript`, `vite`, `vitest`, `@types/three`.
- `package.json` scripts: `"dev": "vite"`, `"build": "tsc --noEmit && vite build"`, `"preview": "vite preview"`, `"test": "vitest run"`.
- `index.html`: `<div id="app"><canvas id="scene"></canvas><div id="vignette"></div><div id="ui"></div></div>`.
- Single player, offline, desktop browser (latest Chrome/Firefox/Safari). Runs with `npm install && npm run dev`.

### 16.2 Module layout

```
src/
  main.ts                    bootstrap: load settings, manifest and assets; init renderer, audio, UI; route to the menu
  data/
    strings.ts               hr/en UI strings (Appendix A), t(key, vars)
    voiceLines.ts            §9.3 table as data (id, personas, subtitleHr, glossEn, mood)
    voiceEvents.ts           §9.4 table as data
  game/                      PURE. No DOM, no three, no timers. Deterministic given seeds.
    types.ts                 core types (§16.3)
    cards.ts                 rank tables, strengths, thirds, deck builders, uid helpers
    rng.ts                   mulberry32 + fnv1a hash; rngFor(seed, ...parts)
    rules.ts                 createHand, legalPlays, canUseFora, applyAction, scoring (§3)
    akuze.ts                 detectNewAkuze(hand, declared) including Divlje and Glasno
    ukrasi.ts                ukras definitions and hooks (§5)
    fore.ts                  fora definitions, canUse, apply (§6)
    match.ts                 match state machine (§16.4)
    run.ts                   run state, rewards, shop generation and purchases (§4, §7)
    opponents.ts             §8.1 table as data
    botMemory.ts             memory filter, BotView builder (§8.3)
    bot.ts                   chooseCard, chooseFora, choosePending, pimc (§8.4–8.6)
    save.ts                  serialise/deserialise; storage interface injected (testable)
  render/
    scene.ts                 renderer, camera, lights, table, resize
    cardMesh.ts              card mesh factory, texture compositing and cache
    placeholders.ts          canvas placeholders (§16.7)
    handLayout.ts            fan math for the player and bot hands
    tableLayout.ts           positions from §10.5
    animator.ts              all A-numbered animations as Promise-returning functions
    fx.ts                    particles, shake, flash
    input.ts                 raycasting, hover, click/drag, targeting mode
  audio/
    audio.ts                 Web Audio manager: buses (master/voice/sfx/ambient), load, play, loop, duck
    voiceDirector.ts         §9.5
  ui/
    overlay.ts               screen router, transitions
    hud.ts                   portrait, bubble, Viđeno, scoreboard, rakija, fore slots, šoldi, toasts
    menus.ts                 main menu, settings, how to play
    runMap.ts                §12.3
    intro.ts                 opponent intro panel
    handSummary.ts           §12.4
    matchEnd.ts              §12.5
    shop.ts                  §12.6 including the deck grid
    runEnd.ts                §12.7
    styles.css
  controller/
    gameController.ts        orchestrates engine ↔ bot ↔ animator ↔ UI ↔ audio (§16.4)
  assets/
    loader.ts                loads manifest.json, images (as ImageBitmap/HTMLImageElement) and audio buffers; missing → null
    defaultManifest.ts       built-in manifest generated from the id tables (used if manifest.json is missing)
tests/
  rules.test.ts  akuze.test.ts  scoring.test.ts  fore.test.ts  ukrasi.test.ts
  bot.test.ts  run.test.ts  save.test.ts  manifest.test.ts
```

### 16.3 Core types (spec; implement in `src/game/types.ts`)

```ts
export type Suit = 'kupe' | 'bate' | 'spade' | 'dinari';
export type Rank = '3' | '2' | 'A' | 'K' | 'C' | 'F' | '7' | '6' | '5' | '4';
export type Side = 'player' | 'bot';
export type UkrasId = 'pozlaceno' | 'srebreno' | 'nabruseno' | 'ljuto' | 'usoljeno'
                    | 'pijano' | 'divlje' | 'glasno' | 'ponocno' | 'ribarsko';
export type ForaId = 'pogled' | 'zamjena' | 'namjesteno' | 'krivi_racun' | 'ti_otvaraj'
                   | 'tucem' | 'napij_ga' | 'vrati' | 'trica_iz_rukava' | 'duplo_ili_nista';
export type OpponentId = 'tonci' | 'jure' | 'luka' | 'bepo';
export type PersonaId = 'barba' | 'gazda' | 'mali';

export interface DeckCard { suit: Suit; rank: Rank; ukras?: UkrasId }           // persistent (run)
export interface CardInst extends DeckCard { uid: string; owner: Side }        // per hand

export interface Played { uid: string; side: Side }
export interface TrickState {
  no: number;                 // 1..20
  leader: Side;
  lead?: Played; follow?: Played;
  forcedHighest: boolean;     // Ljuto lead or Tučem!
  multiplier: 1 | 2;          // Duplo ili ništa
  excludedLead?: string;      // Vrati!
}

export interface SideState {
  hand: CardInst[]; mac: CardInst[]; pile: CardInst[];
  thirds: number; bonusPoints: number; akuzaPoints: number;
  rakija: number; fore: ForaId[]; foreUsed: ForaId[];
  akuzeDeclared: Record<string, number>;   // key -> points recorded (kind:x = 3|4)
  knownByOpp: string[]; voidKnown: Suit[];
  tricaTarget?: string; pijanoUsed: string[];
  drunk: boolean; kriviRacun: boolean;
}

export type Pending =
  | { kind: 'pickDraw'; side: Side; uids: [string, string] }
  | { kind: 'reorderMac'; side: Side; uids: string[] };

export interface HandState {
  seed: string; handNo: number; dealer: Side;
  turn: Side; phase: 'lead' | 'follow' | 'pending' | 'over';
  trick: TrickState; tricksDone: number;
  sides: Record<Side, SideState>;
  pending?: Pending; pendingResume?: 'drawLoser' | 'nextTrick';
  ultima?: { side: Side; points: number };
  rngCounter: number;
}

export type Action =
  | { type: 'play'; side: Side; uid: string }
  | { type: 'fora'; side: Side; fora: ForaId; targetUid?: string }
  | { type: 'resolvePending'; side: Side; pick?: string; order?: string[] };

export type GameEvent =
  | { t: 'handStarted'; handNo: number; dealer: Side; leader: Side }
  | { t: 'dealt'; side: Side; hand: string[]; mac: string[] }
  | { t: 'akuza'; side: Side; combos: { key: string; label: string; points: number; uids: string[] }[]; total: number }
  | { t: 'turn'; side: Side; role: 'lead' | 'follow'; legal: string[] }
  | { t: 'foraUsed'; side: Side; fora: ForaId; targetUid?: string; revealed?: string[]; drawn?: string }
  | { t: 'pending'; pending: Pending }
  | { t: 'cardPlayed'; side: Side; uid: string; role: 'lead' | 'follow'; drunk: boolean }
  | { t: 'leadReturned'; side: Side; uid: string }
  | { t: 'rakija'; side: Side; value: number }
  | { t: 'trickResolved'; trickNo: number; winner: Side; leadUid: string; followUid: string;
      thirdsTo: Record<Side, number>; bonus: { side: Side; ukras: UkrasId; points?: number; soldi?: number }[];
      ultima?: { side: Side; points: number } }
  | { t: 'cardDrawn'; side: Side; uid: string; via: 'mac' | 'ribarsko' | 'zamjena' }
  | { t: 'handScored'; breakdown: Record<Side, { thirds: number; cardPoints: number; rounding: 'floor' | 'ceil';
      ultima: number; ukrasPoints: number; akuzaPoints: number; total: number }> };
```

Engine API (all pure; input state is never mutated; the implementation may `structuredClone` and mutate the copy):

```ts
createHand(p: { seed: string; handNo: number; dealer: Side;
                decks: Record<Side, DeckCard[]>; fore: Record<Side, ForaId[]>;
                rakija: Record<Side, number> }): { state: HandState; events: GameEvent[] };
legalPlays(s: HandState, side: Side): string[];
canUseFora(s: HandState, side: Side, fora: ForaId): { ok: boolean; reason?: string };
applyAction(s: HandState, a: Action): { state: HandState; events: GameEvent[] };   // throws on illegal
effectiveStrength(s: HandState, uid: string): number;
```

### 16.4 State machines

**Run** (`run.ts`, persisted):

```
RunState { version: 1; seed: string; ladderIndex: 0..3; deck: DeckCard[]; fore: ForaId[];
           rakijaBase: 3|4; soldi: number; revans: 0|1; status: 'map'|'intro'|'match'|'shop'|'won'|'lost';
           shop?: ShopState; match?: MatchSave; stats: RunStats; attempt: number }
ShopState { visit: 1..3; rerolls: number; removals: number; offers: Offer[] /* with sold flags */ }
map → intro → match → (win) shop → map … ; (lose) revans? match : lost ; (win at index 3) won
```

**Match** (`match.ts`):

```
MatchState { opponentId; target: 21; scores: Record<Side, number>; handNo; dealer: Side;
             akuzaPointsPlayer: number; hand?: HandState; status: 'playing'|'handOver'|'over'; winner?: Side }
startMatch → nextHand (dealer alternates; hand seed = rngFor(run.seed,'hand',ladderIndex,attempt,handNo))
  → [HandState loop] → handScored → applyHandResult (scores, end check §3.8) → handOver → nextHand | over
```

**Hand** (inside `rules.ts`):

```
createHand: DEAL → initial AKUŽA (leader, then follower) → phase 'lead' (turn = leader)
'lead'   --fora*--> 'lead' | --play--> 'follow' (turn = follower)
'follow' --fora*--> 'follow' | (Vrati!) --> 'lead' (same leader, excludedLead)
         --play--> RESOLVE
RESOLVE  → if trick 20: ULTIMA → SCORE → 'over'
         → if trick ≤ 10: DRAW(winner) [→ 'pending' pickDraw → resolvePending] → AKUŽA(winner)
                          → DRAW(loser) [→ 'pending' …] → AKUŽA(loser)
         → next trick: leader = winner, phase 'lead'
fora namjesteno → 'pending' reorderMac → resolvePending → back to the same phase
```

**Controller loop** (`gameController.ts`):

```
async runHand():
  { state, events } = createHand(...); await present(events)
  while state.phase != 'over':
     if state.phase == 'pending' and pending.side == 'bot': act(bot.choosePending(view))
     elif state.turn == 'bot':
        await wait(thinkMs)
        for fora in bot.chooseFora(view, tentativeCard): act(fora)      // each is presented before the next
        act({ type: 'play', side: 'bot', uid: bot.chooseCard(view) })
     else: await playerInput()           // resolves with a play/fora/resolvePending Action
  await present(handScored) → hand summary → match update → save

act(action): { state, events } = applyAction(state, action); memory.observe(events); await present(events)
present(events): for each event, in order: animator + HUD + audio + voiceDirector (await blocking animations)
```

Pause: while settings or the how-to overlay is open, the controller awaits before starting the next bot action. Running tweens finish.

### 16.5 Determinism and RNG

- `rng.ts`: `mulberry32(seed32)` and `fnv1a(str)`. `rngFor(runSeed, ...parts)` = mulberry32(fnv1a([runSeed, ...parts].join('|'))).
- Streams: `hand` (shuffles + Napij ga + Pogled picks), `bot` (mistakes, memory rolls, PIMC sampling), `shop` (`rngFor(seed,'shop',visit,rerolls)`), `voice`.
- Run seed: random on New run (`crypto.getRandomValues`), or `?seed=<string>` from the URL.

### 16.6 Persistence (localStorage)

| Key | Content | Written |
|---|---|---|
| `treseta.save.v1` | `{ version: 1, run: RunState }`. `run.match` holds `{ scores, handNo, dealer, akuzaPointsPlayer, botMemory: null }` | on run start, at every hand end, at match end, on every shop action, on every map/intro transition |
| `treseta.settings.v1` | language, subtitles, fast, volumes, tipsSeen[] | on change |
| `treseta.stats.v1` | runsStarted, runsWon, bestLadder, bestRunSoldi | at run end |

Resume ("Nastavi"): load the save. If `status == 'match'`, rebuild the match from `run.match` and start the **next hand** (`handNo`); the interrupted hand is replayed from its deterministic start. The save version must match; if it doesn't, discard the save with a toast. `save.ts` takes a storage interface so tests can use an in-memory map.

### 16.7 Graceful fallbacks (the game must run with an empty `public/assets/`)

| Missing | Fallback |
|---|---|
| `manifest.json` | Use a built-in manifest generated in code from the same id tables (`src/assets/defaultManifest.ts`). |
| Card face | Canvas 480×768: rounded rect (r 24) filled `#F3E6C8`, 10 px border in the suit colour, the corner index (Triestine numeral) in Georgia 52 px, a big centre glyph (the rank label "3"/"1"/"13" in 150 px bold), the suit name in caps below in the suit colour, and a simple drawn suit shape (kupe: a cup polygon; bate: a rounded bar; spade: a thin blade with a cross-guard bar; dinari: a filled circle with a ring). |
| Card back | Canvas 480×768 with diagonal 24 px stripes: `#B5452B`/`#F3E6C8` (player), `#2F7C6B`/`#F3E6C8` (bot), plus a 10 px cream border. |
| Ukras badge | A circle of radius 56 filled with the ukras colour, a 4 px darker rim, and the first letter of the name in white Alegreya 64. |
| Fora art | A vertical gradient from the fora's rarity colour to `#2A1A10` with the name centred in cream. |
| Portrait | A circle in the persona colour (barba `#2F5D7C`, gazda `#B5452B`, mali `#6B7A3A`) with initials. |
| Env table | Procedural plank canvas (§10.3). |
| Env backgrounds | CSS gradients: konoba `linear-gradient(#3B2416, #120A05)`; map `#CBB88E` with a `#3A7CA5` sea on the right 40%; shop `#4A2F1C`. |
| UI icons | Coin: a gold circle; rakija: a CSS trapezoid glass; logo: CSS text. |
| Any audio | `play()` returns immediately; log each missing id once with `console.info('[audio] missing', id)`. Voice bubbles still show for 2200 ms. |

Loading: images load in parallel with a progress bar on the menu. Each failure resolves to `null` (never rejects). The rest of the game asks `assets.image(id) ?? placeholder(id)`.

### 16.8 Required unit tests (vitest)

| File | Must cover |
|---|---|
| `rules.test.ts` | rank order; leader wins ties; off-suit never wins; follow-suit legality; forcedHighest (Ljuto, Tučem!); 20 tricks and 10 draws per side; winner draws first; drawn cards added to `knownByOpp`; void tracking set and cleared; Vrati! re-lead excludes the returned card; Ti otvaraj swaps the leader; Napij ga forces a random legal play; a deterministic deal for a fixed seed |
| `scoring.test.ts` | floor of thirds per side (e.g. 7 thirds → 2); ultima +1; Ponoćno ultima +3; Krivi račun ceil; Pozlaćeno +1 only for the owner who won; Usoljeno redirect; Duplo ×2 (bonuses not doubled); with two standard decks and no ukrasi, the hand totals equal floor(a/3) + floor(b/3) + 1 |
| `akuze.test.ts` | napolitana; three and four of a kind; upgrade 3 → 4 gives +1; no double scoring; check after a draw; Glasno +2; Divlje best assignment; reveal uids |
| `fore.test.ts` | each of the 10 fore: preconditions (reason keys), cost, once per hand, effect |
| `ukrasi.test.ts` | each of the 10 ukrasi in a minimal scenario |
| `bot.test.ts` | the bot only returns legal moves across 500 random seeded hands per opponent; BotView leaks no unknown player uids; follows the §8.4 rules in hand-built positions (takes a led A when it can; dumps a lišina when it can't win; keeps a master for the ultima with 2 cards left) |
| `run.test.ts` | reward formula; shop offer generation is seeded and has no duplicates or owned fore; reroll pricing; removal limit and min deck 30; fora slot cap 4; Veća čašica only once |
| `save.test.ts` | round trip; version mismatch is discarded |
| `manifest.test.ts` | counts from §15.2; every id in data files exists in the manifest |

### 16.9 Debug flags (URL query)

`?debug=1` (bot hand face up plus an event log in the console) · `?seed=abc` · `?start=3` (start the run at ladder index 3 with 30 šoldi, for testing) · `?fast=1` (force fast animations) · `?nosound=1`.

### 16.10 Performance budget

60 fps on a mid-range laptop at 1920×1080: under 150 draw calls, at most one shadow-casting light, texture cache of at most 100 card textures (reuse the base face plus badge composites), and every particle system pooled.

---

## 17. MVP acceptance checklist

The MVP is done when **all** of the following hold. They cover Dvoboj; **Partneri (2v2) must also pass the §18.12 checklist.**

**Build and test**
- [ ] `npm install && npm run dev` starts the game. `npm run build` succeeds with no TypeScript errors.
- [ ] `npm test` passes all suites in §16.8.
- [ ] The game runs start to finish with `public/assets/` **empty** (placeholders, no sound, no errors), and with all assets present.
- [ ] No runtime network requests except to the local dev server (no ElevenLabs, CDN or font calls).

**Rules**
- [ ] Two separate decks, each side with its own 10-card mac; 10 cards dealt each; 20 tricks; draws after tricks 1–10 with the winner first; every drawn card is visibly revealed.
- [ ] Rank order 3 > 2 > A > K > C > F > 7 > 6 > 5 > 4. Follow suit is enforced for the player (illegal cards dimmed and shaking) and the bot. Ties go to the leader.
- [ ] Scoring in thirds with fractions dropped per side, +1 ultima, a correct hand summary, akuže auto-declared at the deal and after draws, a match to 21 ending only at hand end (an equal score ≥ 21 plays another hand).

**Run and progression**
- [ ] Menu → map → intro → 4 matches in ladder order → shop after matches 1–3 → victory or defeat screen → menu.
- [ ] Rewards follow §4.3. Revanš works once per run.
- [ ] All 10 ukrasi and all 10 fore behave exactly as in §5–§6. Rakija refills per hand; every fora is once per hand; there are 4 slots.
- [ ] The shop shows 3 seeded offers, reroll with rising prices, removal (max 2 per visit, min deck 30), Veća čašica, and target selection through the deck grid.
- [ ] Save and resume through localStorage (Nastavi). Reloading in the shop does not give new offers.

**Bot**
- [ ] 4 opponents with the knobs, decks, rakija and fore from §8.1. The bot never makes an illegal move and never reads hidden information.
- [ ] Higher opponents play noticeably better (Luka and Bepo use PIMC in the endgame).

**Cussing**
- [ ] All 22 voice events from §9.4 are wired with the stated probabilities, cooldowns, global gap, per-hand cap and priorities.
- [ ] Bubbles show the Croatian line plus the EN gloss when subtitles are on. Audio plays from `voice/<persona>/<id>.mp3` when present; Bepo uses barba at 0.93.
- [ ] Every user-supplied line is present verbatim. No line references anything religious (except the user's own "Vrag ti sriću odnija!").

**Presentation**
- [ ] The scene layout from §10 and every animation A1–A37 from §11.1, at the stated durations and easings (Fast mode = ×1.6 speed).
- [ ] Hover lift and tilt, click and drag play, illegal shake, an arcing play with landing squash, the bot's flip-in, trick sweep, draw reveal, deal, akuža callout, strong-play shake and sparks, score pops, speech bubble and portrait reactions, and match win/lose screens.
- [ ] HUD: portrait, bubble, Viđeno strip, chalkboard score with live thirds, rakija glasses, fore slots with disabled reasons, šoldi, mac counts.
- [ ] Croatian and English UI strings switchable in settings, with Croatian diacritics rendering correctly.

---

## Appendix A: UI strings (`src/data/strings.ts`)

`{x}` = interpolation. Suit names are always Kupe, Bate, Špade, Dinari (in both languages); Croatian game terms (akuža, mac, ultima, fora, ukras, rakija, šoldi, butiga) are kept in English too.

| Key | hr | en |
|---|---|---|
| `menu.continue` | Nastavi | Continue |
| `menu.new` | Nova igra | New run |
| `menu.newConfirm` | Započeti novu igru? Stara će se izbrisati. | Start a new run? Your current run will be lost. |
| `menu.howto` | Kako se igra | How to play |
| `menu.settings` | Postavke | Settings |
| `menu.stats` | Runde: {runs} · Pobjede: {wins} | Runs: {runs} · Wins: {wins} |
| `hud.you` | TI | YOU |
| `hud.target` | do {n} · ruka {h} | to {n} · hand {h} |
| `hud.inHand` | u ruci: {a} : {b} | this hand: {a} : {b} |
| `hud.seen` | Viđeno | Seen |
| `hud.mac` | Mac {n} | Stock {n} |
| `hud.rakija` | Rakija | Rakija |
| `toast.yourTurn` | Tvoj red | Your turn |
| `toast.followSuit` | Moraš pratiti boju: {suit} | You must follow suit: {suit} |
| `toast.mustHighest` | Moraš baciti najjaču {suit}! | You must play your highest {suit}! |
| `toast.botPeeked` | {name} ti viri u karte! | {name} peeked at your cards! |
| `toast.pickDraw` | Ribarsko: izaberi kartu | Ribarsko: pick a card |
| `toast.reorder` | Namješteno: složi karte (lijevo = vrh) | Rigged: order the cards (left = top) |
| `toast.target` | Odaberi kartu u ruci | Choose a card in your hand |
| `reason.notYourTurn` | Nije tvoj red | Not your turn |
| `reason.noRakija` | Nema dosta rakije | Not enough rakija |
| `reason.usedThisHand` | Već iskorišteno ove ruke | Already used this hand |
| `reason.macEmpty` | Mac je prazan | Your stock is empty |
| `reason.leaderOnly` | Samo kad ti otvaraš | Only when you lead |
| `reason.followerOnly` | Samo kad odgovaraš | Only when you follow |
| `reason.nothingToReveal` | Već sve znaš | You already know his hand |
| `reason.pendingChoice` | Prvo završi izbor | Finish your choice first |
| `reason.oppOneCard` | Protivnik ima samo jednu kartu | Opponent has only one card |
| `summary.title` | Kraj ruke | End of hand |
| `summary.cards` | Karte ({b} bela) | Cards ({b} thirds) |
| `summary.ultima` | Ultima | Last trick |
| `summary.ukrasi` | Ukrasi | Enhancements |
| `summary.akuze` | Akuže | Declarations |
| `summary.hand` | Ukupno ruka | Hand total |
| `summary.match` | Partija | Match |
| `summary.dropped` | (⅓ otpada) | (⅓ dropped) |
| `summary.dropped2` | (⅔ otpada) | (⅔ dropped) |
| `summary.ceil` | (Krivi račun: zaokruženo gore) | (Wrong bill: rounded up) |
| `common.continue` | Dalje | Continue |
| `match.win` | POBIJEDIO SI! | YOU WON! |
| `match.lose` | IZGUBIO SI... | YOU LOST... |
| `match.reward` | Pobjeda +{base} · Razlika +{margin} · Akuže +{ak} = {total} šoldi | Win +{base} · Margin +{margin} · Declarations +{ak} = {total} šoldi |
| `match.toShop` | U butigu | To the shop |
| `match.revans` | Revanš ({n}) | Rematch ({n}) |
| `match.giveUp` | Kraj | Give up |
| `map.sit` | Sjedni za stol | Take a seat |
| `intro.fore` | Fore | Tricks |
| `intro.ukrasi` | Ukrasi | Enhancements |
| `intro.deck` | Špil: {n} karata | Deck: {n} cards |
| `shop.title` | Butiga | The shop |
| `shop.buy` | Kupi · {p} | Buy · {p} |
| `shop.sold` | Prodano | Sold |
| `shop.reroll` | Promišaj · {p} | Reshuffle · {p} |
| `shop.remove` | Izbaci kartu · {p} ({u}/2) | Remove a card · {p} ({u}/2) |
| `shop.deck` | Špil ({n}) | Deck ({n}) |
| `shop.replaceUkras` | Zamijeniti {old} s {new}? | Replace {old} with {new}? |
| `shop.discardFora` | Džepovi su puni. Koju foru baciti? | Pockets full. Which trick to discard? |
| `shop.typeUkras` | Ukras | Enhancement |
| `shop.typeFora` | Fora | Trick |
| `shop.typePerm` | Trajno | Permanent |
| `shop.casica` | Veća čašica | Bigger glass |
| `shop.casicaDesc` | +1 rakija svake ruke. | +1 rakija every hand. |
| `shop.minDeck` | Špil ne može imati manje od 30 karata | Deck can't go below 30 cards |
| `run.won` | KRALJ KONOBE! | KING OF THE KONOBA! |
| `run.lost` | KRAJ RUNDE | RUN OVER |
| `settings.language` | Jezik | Language |
| `settings.subtitles` | Titlovi (EN) | Subtitles (EN) |
| `settings.fast` | Brzo igranje | Fast animations |
| `settings.master` / `.voice` / `.sfx` / `.ambient` | Glasnoća / Glasovi / Efekti / Ambijent | Volume / Voices / Effects / Ambience |
| `done` | Gotovo | Done |
| `cancel` | Odustani | Cancel |

## Appendix B: "How to play" text

**hr**
1. Igraš trešetu u dvoje: ti protiv domaćina konobe. Pobijedi četiri konobe zaredom.
2. Svatko igra svojim špilom. Na početku ruke dobiješ 10 karata, a još 10 ide u tvoj mac.
3. Jačina karata: 3, 2, as, kralj, konj, fanat, 7, 6, 5, 4. Nema aduta.
4. Moraš odgovoriti na boju ako je imaš. Ako je nemaš, baci što oćeš, ali ta karta ne može odnijeti štih.
5. Štih nosi najjača karta tražene boje. Ako su dvije iste, nosi ona koja je prva bačena.
6. Nakon štiha prvi peška onaj tko je odnija štih, pa drugi. Pešku vide oba igrača. Kad se mac isprazni, igraju se zadnje karte.
7. As vrijedi 1 punat; trica, duja, kralj, konj i fanat po 1 belu (⅓ punta); 4–7 su lišine. Zadnji štih (ultima) nosi 1 punat. Ostatak bela se gubi.
8. Akuže se prijavljuju same: napolitana (as, duja, trica iste boje) = 3; tri trice, tri duje ili tri asa = 3; četiri = 4.
9. Partija ide do 21. Pobjeda donosi šolde za butigu.
10. Fore su trikovi iz rukava: troše rakiju (3 čašice po ruci), svaka jednom po ruci. Ukrasi trajno pojačavaju tvoje karte.

**en**
1. You play two-player Trešeta against the konoba's locals. Beat four konobe in a row.
2. Each side plays from its own deck. Each hand you get 10 cards, and 10 more go into your stock (mac).
3. Card strength: 3, 2, Ace, King, Knight, Knave, 7, 6, 5, 4. There are no trumps.
4. You must follow suit if you can. If you can't, play anything, but that card can't win the trick.
5. The highest card of the led suit wins. If both are equal, the card played first wins.
6. After each trick the winner draws first, then the other player. Drawn cards are shown to both players. When the stock runs out, the last cards are played out.
7. An Ace is worth 1 point; 3, 2, King, Knight and Knave are worth ⅓ each; 4–7 are worth nothing. The last trick (ultima) is worth 1 point. Leftover thirds are lost.
8. Declarations (akuže) are scored automatically: Napolitana (A-2-3 of a suit) = 3; three 3s, 2s or Aces = 3; all four = 4.
9. A match is played to 21. Winning earns šoldi to spend in the shop (butiga).
10. Fore are tricks up your sleeve: they cost rakija (3 glasses per hand) and each works once per hand. Ukrasi permanently enhance your cards.

## Appendix C: Glossary

| Term | Meaning |
|---|---|
| akuža / akužati | a declaration of a scoring combination / to declare one |
| bela | ⅓ of a point (trica, duja, kralj, konj, fanat) |
| butiga | shop |
| barba | uncle/old man (Dalmatian); also our old-fisherman voice persona |
| did | grandpa (Dalmatian) |
| fora / fore | trick, gag (here: a trick card) |
| gazda | boss, owner (here: the tavern owner) |
| konoba | traditional Dalmatian tavern |
| lišine | worthless cards 4–7 |
| mac | the face-down stock you draw from |
| napolitana | A + 2 + 3 of the same suit |
| peškati | to draw from the mac |
| punat (punti/punta) | point |
| rakija | fruit or herb brandy; here the per-hand resource for fore |
| šoldi | money (from Venetian *soldi*); the run currency |
| štih | trick |
| tučem | "I knock": the Trešeta call (busso); here also a fora |
| ukras | decoration; here a permanent card enhancement |
| ultima | the last trick, worth +1 punat |

---

## 18. Partneri (2v2) mode: addendum

**Partneri** is the **primary** run mode: the player (seat S) and a bot partner (seat N, opposite) play against two bot opponents (W and E). The 1v1 game in §1–§17 stays unchanged as the secondary mode **Dvoboj**. In this section, "replaces" means the replacement applies *in Partneri mode only*. Everything not mentioned (art style, card faces, fonts, palette, sfx, how voice lines sound, the animation easing vocabulary) carries over unchanged.

Code strategy: the Dvoboj engine (`rules.ts`, `match.ts`, `bot.ts`, `botMemory.ts`) is **not modified**. Partneri gets parallel pure modules with a `4` suffix (§18.10) that reuse `cards.ts`, `akuze.ts`, `rng.ts`, the `UKRASI`/`FORE` metadata and the shop functions in `run.ts`.

### 18.1 Real four-player Trešeta (verified)

| Topic | Rule | Source |
|---|---|---|
| Seating | 2 vs 2, partners sit opposite each other | en.wiki ("most commonly… partners seated opposite"), hr.wiki ("u parovima dva protiv dva") |
| Deal | All 40 cards, **10 each**, **no talon**. Dealt alternately (Pagat: 5 at a time) | hr.wiki, pagat |
| Direction | **Clockwise in Croatia** (Montenegro and Italy play anticlockwise). Dealing is clockwise too. | en.wiki (Trešeta section), hr.wiki |
| Dealer rotation | The next player in order deals the next hand ("sljedeći po redu") | hr.wiki |
| First lead | The player dealt first, i.e. the dealer's next player clockwise, leads trick 1. The trick winner leads the next. | hr.wiki ("Igru započinje igrač kojemu su prvom podijeljene karte") |
| Play | Follow suit if able; otherwise any card. The highest card of the led suit wins; there are no trumps. Rank order and card values as in §3.1. | all sources |
| Points | Team thirds are pooled. Each team counts whole punti only, and the last trick (trick 10) gives +1 ultima → **exactly 11 per hand** | hr.wiki, pagat |
| Akuže | Declared by a player **before playing their first card** (during trick 1). Points go to that player's **partnership**, whose total is the team score. | hr.wiki, en.wiki ("until a player or two partnered players reach 41") |
| Target | 31 without akuže, 41 with | hr.wiki |
| Signals | Only the **leader** of a trick may signal. *Tučem* (busso): "beat with your strongest and return the suit". *Strišo* (striscio): "I have more of this suit" / "don't take my card, play low". *Volo*: "this was my last card of the suit". | hr.wiki, en.wiki, pagat |

**What Partneri decides on top of that:**

| Item | Decision |
|---|---|
| Seats | Seat ids `S` (player), `W` (left opponent), `N` (partner), `E` (right opponent). Teams: `mi` = S+N, `vi` = W+E. |
| Order | Clockwise as seen from above with the player at the bottom: **S → W → N → E → S**. |
| Hand 1 | Dealer = **E**, so **S leads trick 1**. The dealer then rotates clockwise each hand (E → S → W → N → E …). |
| Tricks per hand | 10 (all 40 cards). No draws, no mac. |
| Ties | Only possible through Trica iz rukava vs a real 3 (both strength 20): **the card played earlier wins**. |
| Akuža timing | The engine checks a seat's hand at the **start of that seat's first turn** (trick 1), before its turn event. Points go straight to the team's match score. |
| Match target | **31 points (akuže included)**. A hand takes about 80–90 s (10 tricks of about 7 s, plus the deal and summary) and produces about 13 points including akuže, so a match lasts about 4–5 hands, **≈ 6–8 min**. The end is checked only at hand end; a tie at ≥ 31 plays another hand. |

### 18.2 Partner signals (MVP)

A signal is attached to the **lead card** by the leader. At most one signal per trick. Signals are **public** (all seats see and hear them) and **honest**: the engine only accepts a signal if it is true.

| Signal | Callout | Legal when (checked against the leader's hand *including* the led card) | Meaning | Partner bot reaction (with probability `readSignals`, else normal play) |
|---|---|---|---|---|
| `tucem` | "TUČEM!" + sfx `table_knock`; bots also say line `tucem` | The leader holds **≥ 2 of {3, 2, A}** of the led suit | "I'm strong in this suit. Play your **highest** card of it, and lead this suit back to me." | **Follower:** play the highest-strength card of the suit; if void, carico discard (§18.6). **Next time the partner leads** in this hand: lead that suit (its master if it has one, else its lowest card of the suit) unless the signaller has since shown void in it. |
| `striso` | "STRIŠO" + sfx `card_slide` | The leader holds **≥ 2 other** cards of the led suit after this one | "I have more of this suit. **Don't overtake me**; play low." | **Follower:** play its **lowest** card of the suit. Exception: if an opponent is currently winning and the bot holds a safe winner (§18.6), take with the cheapest safe winner. If void: dump the lowest-val card (never carico). |
| `volo` | "VOLO" + sfx `card_place` | The led card is the leader's **last** card of that suit | "That was my last card of this suit." | The engine marks the leader void in the suit (public). **Later, when the partner leads:** if it holds a master in that suit, lead it so the void signaller can load points (carico). |

**Player UI:** 3 round buttons (56 px; labels "Tučem", "Strišo", "Volo"; icons ✊ ↔ ↓) sit bottom-right, left of the šoldi counter. They are enabled only when the player is leading. Clicking one **arms** it (ochre ring), clicking again disarms it, and arming another switches. While a signal is armed, hand cards for which it isn't legal are dimmed. Playing a legal card sends `play { signal }`. An incompatible card shakes (A4) with toast `toast.signalIllegal`. The armed signal clears after the play.

**Bot leaders** choose signals in priority order Tučem > Volo > Strišo, each only if legal for the chosen lead card and `rng() < signalUse`.

All bots read signals as information: a Volo sets a public void, and any bot may use that knowledge.

### 18.3 Deck-building in Partneri: one deck, team-owned ukrasi

- The table plays **one 40-card deck: the player's run deck**. Every hand all 40 cards are shuffled (`rngFor(handSeed,'deal')`) and dealt **10 to each seat** in packets of 5, clockwise starting with the seat after the dealer. Card uid = `p:<suit>_<rank>` (unique, so the existing uid helpers work). The card's holder is tracked by which seat's hand it is in.
- The Partneri run deck is **always exactly 40 cards**. **§7.1 "Izbaci kartu" is replaced** by the service **"Prebaci ukras"** (§18.3.3).
- **Every ukras has a beneficiary team** (`ukrasTeam`):
  - the player's permanent ukrasi (bought in the shop) → `mi`;
  - per-match **"šarane karte"** (marked cards) applied by the opponent pair → `vi` (§18.4.3). These are temporary, for that match only, and only go on cards without an ukras.
- **Rule:** an ukras only ever helps its beneficiary team **T**. Where the effect depends on who played the card, it fires only when a **seat of team T** played it. Ukrasi in the hand of the other team are inert, except Pozlaćeno and Srebreno (below), which pay T whenever the card **ends in T's trick pile**. That makes opposing-held gilded cards a target to capture.
- Display: Mi badges use the normal wax seal. Vi badges get an extra 6 px ring in `#C0392B` around the badge plus a small "VI" tag (drawn in code, no new art). In the deck grid and the intro, Vi marks are listed as "Šarane karte".

#### 18.3.1 The 10 ukrasi for 4 seats (replaces the §5 effect column in Partneri)

| Id | Partneri effect, for beneficiary team T (exact) |
|---|---|
| `pozlaceno` | If the card **ends in T's pile** (whoever played it): T +1 punat. |
| `srebreno` | If the card **ends in Mi's pile** (whoever played it): +3 šoldi. Only ever `mi`; never used as a Vi mark. |
| `nabruseno` | Effective strength +3 **only when played by a T seat**. |
| `ljuto` | When **led by a T seat**: **both** seats of the other team must play their highest card of the suit (forcedHighest applies to those 2 seats only; the leader's partner is free). |
| `usoljeno` | If **played by a T seat** and the trick is won by the other team: this card's thirds go to T. |
| `pijano` | When **played by S or N**: the player gets +1 rakija (cap 5). Only `mi`. |
| `divlje` | In the hand of a **T seat**: counts as the 3, 2 or A of its suit for akuža detection (§3.7 rule). For seats of the other team the card is its plain self. |
| `glasno` | An akuža **declared by a T seat** that uses this card: +2. |
| `ponocno` | If **played by a T seat** and it wins trick 10: the ultima is 3 instead of 1. |
| `ribarsko` | (No mac in 4p; **effect replaced**.) When a **T seat wins a trick with this card**: reveal 1 random card, unknown to T, from **each** seat of the other team to team T (Mi: into the Viđeno strips; Vi: into bot memory). Description EN "Win a trick with it: see 1 card from each opponent." HR "Kad odneseš štih s njom: vidiš po jednu kartu svakog protivnika." |

Implementation: `src/game/ukrasi4.ts` holds team-aware hook functions with the same names as `ukrasi.ts` but taking `(card, ctx: { playedBy: Seat; winner?: Seat; team: Team })`. Descriptions for Partneri live in `descEn4`/`descHr4` next to the existing ones (fallback: the 1v1 text). Akuža detection reuses `detectNewAkuze(hand, declared)`: before calling it for a seat, map the hand to copies **with `ukras` removed from cards whose `ukrasTeam` differs from the seat's team**.

#### 18.3.2 The 10 fore for 4 seats (replaces the §6.3 effect column in Partneri)

Only the **player** owns fore in team Mi (the partner has a perk instead, §18.4.1). Opponent bots own fore per §18.4.3. Rakija: player base 3 (+1 Veća čašica, +1 if partner Dino), cap 5; Vi bots per §18.4.3. "Opponents" means the two seats of the other team. Some fore need a **seat target**: the UI makes both opponent portraits glow and the player clicks one (`targetSeat`); Esc cancels at no cost.

| Id | Cost | When | Partneri effect (exact) | Target | New reason keys |
|---|---|---|---|---|---|
| `pogled` | 1 | your turn | Reveal up to 3 random cards, unknown to your team, from the **chosen opponent's** hand (they appear in that opponent's Viđeno strip). Not usable if your team knows all of that seat's cards. | opponent seat | `pickSeat` |
| `zamjena` | 1 | your turn | Choose a card in your hand; it is **swapped with a random card from your partner's hand**. Both cards become known to your team. Requires the partner to hold ≥ 1 card. | hand card | `partnerEmpty` (replaces `macEmpty`) |
| `namjesteno` | 1 | your turn | Your partner's **whole hand** is shown to you (in the partner's Viđeno strip) for the rest of this hand. | – | – |
| `krivi_racun` | 1 | your turn | At hand end, **your team's** thirds round up. | – | – |
| `ti_otvaraj` | 1 | your turn as leader | The **next seat clockwise** leads this trick instead. The order becomes W, N, E, S (you play last). | – | – |
| `tucem` | 1 | your turn as leader | **Both opponents** must play their highest card of the led suit (your partner is free). This is separate from the Tučem *signal*: the player can also arm the signal if it is legal. | – | – |
| `napij_ga` | 1 | your turn | The **chosen opponent's** next card is random among its legal plays. | opponent seat | `pickSeat` |
| `vrati` | 2 | your turn as **2nd seat** after an **opponent's** lead (only possible when E led) | E takes back the led card (it becomes known to your team) and must lead a different card. The lead's signal and Tučem! stay in effect if still legal; otherwise the signal is dropped. | – | `secondOnly` (replaces `followerOnly`) |
| `trica_iz_rukava` | 2 | your turn | Unchanged: the chosen hand card has strength 20 for the rest of the hand. | hand card | – |
| `duplo_ili_nista` | 2 | your turn | Card thirds in this trick ×2 for the **team** that wins it. | – | – |

New `ReasonKey` values: `pickSeat` ("Odaberi protivnika" / "Pick an opponent"), `partnerEmpty` ("Partner nema karata" / "Your partner has no cards"), `secondOnly` ("Samo kad igraš drugi, iza protivnika" / "Only when you play second, after an opponent"). Action shape: `{ type: 'fora'; seat; fora; targetUid?; targetSeat? }`.

#### 18.3.3 Shop in Partneri (changes to §7)

| §7 element | Partneri |
|---|---|
| 3 random offers, reroll, Veća čašica, prices, offer generation | **Unchanged** (reuse `generateOffers`, `reroll`, `buyUkras`, `buyFora`, `buyCasica`) |
| Izbaci kartu (remove) | **Replaced by "Prebaci ukras"** (move an enhancement): **3 šoldi**, max **2 per visit**. Pick a card in the deck grid that has a Mi ukras, then a card **without** any ukras; the ukras moves (A35 stamp animation on the target, a fading badge on the source). Disabled if no card has an ukras. Strings: `shop.move` = "Prebaci ukras · {p} ({u}/2)" / "Move an enhancement · {p} ({u}/2)". |
| Discount | If the match just won was played with partner **Gazda Jure**, every price in that shop visit is **−1** (min 1), including reroll and Prebaci (§18.4.1 perk). |

### 18.4 Run structure with partner pick (replaces §4.2–§4.3 in Partneri)

#### 18.4.1 Characters (8): `src/game/characters.ts`

`CharacterId = OpponentId | 'dino' | 'stipe' | 'ive' | 'frane'`. The voice is the persona folder; the rate is the Web Audio `playbackRate` for that character's lines.

| Id | Name | Persona | Rate | Tier | Aggression | Partner perk (id, name, exact effect) | Bio EN / HR |
|---|---|---|---|---|---|---|---|
| `tonci` | Mali Tonči | mali | 1.00 | 1 | 0.6 | `brzi_jezik`, **Brzi jezik**: every akuža declared by team Mi scores **+1** | (from §8.1) |
| `dino` | Dino "Galeb" | mali | 1.06 | 3 | 0.8 | `sarmer`, **Šarmer**: the player's rakija base **+1** per hand (cap 5) | "Every summer a new girlfriend, every winter a new card trick." / "Svako lito nova cura, svaku zimu nova fora." |
| `jure` | Gazda Jure | gazda | 1.00 | 2 | 0.7 | `na_crtu`, **Na crtu**: the shop after a match won with Jure has every price **−1** (min 1) | (from §8.1) |
| `stipe` | Stipe Kamenar | gazda | 0.94 | 2 | 0.3 | `zidar`, **Zidar**: an ultima won by team Mi is worth **+1** more (2, or 4 with Ponoćno) | "Builds walls on Brač that will outlive us all. Plays the same way." / "Zida mure na Braču koji će nas sve nadživit. Tako i igra." |
| `ive` | Ive Poštar | barba | 1.08 | 2 | 0.4 | `postar`, **Poštar zna sve**: at the start of every hand, **1 random card of each opponent** is revealed to the player (Viđeno) | "Delivers the mail and every rumour on the island." / "Nosi poštu i sve ča se na otoku priča." |
| `luka` | Barba Luka | barba | 1.00 | 3 | 0.2 | `pamcenje`, **Pamćenje**: the HUD shows each opponent's **known void suits** (crossed suit chips under the portrait) | (from §8.1) |
| `frane` | Kapetan Frane | gazda | 1.04 | 3 | 0.5 | none (never a partner in the MVP) | "Forty years on cargo ships. Still gives orders at the table." / "Četrdeset godina na brodu. I za stolom još zapovida." |
| `bepo` | Did Bepo | barba | 0.93 | 4 | 0.5 | none (never a partner in the MVP) | (from §8.1) |

**Persona pools:** mali {tonci, dino} · gazda {jure, stipe, frane} · barba {luka, ive, bepo}.

#### 18.4.2 Ladder of opponent pairs

| # | Konoba | Opponents (W, E) | Personas | Pair tier sum | Valid partner persona | Base reward |
|---|---|---|---|---|---|---|
| 1 | Konoba "Škoj" | Mali Tonči (W), Stipe Kamenar (E) | mali + gazda | 3 | **barba** | 10 |
| 2 | Konoba "Kod Jure" | Gazda Jure (W), Ive Poštar (E) | gazda + barba | 4 | **mali** | 12 |
| 3 | Konoba "Ribarska" | Barba Luka (W), Dino "Galeb" (E) | barba + mali | 6 | **gazda** | 14 |
| 4 | Konoba "Na Brdu" (boss) | Did Bepo (W), Kapetan Frane (E) | barba + gazda | 7 | **mali** | 20 |

**Partner pick rules (guarantee distinct voices):**
1. The partner must be **unlocked** and must have the match's **valid partner persona** (the persona that neither opponent uses). Because each pair uses two different personas and the partner uses the third, **the 3 bots at the table always have 3 different personas.**
2. **Unlocking:** a run starts with **Barba Luka, Ive Poštar and Dino "Galeb"** unlocked. When the player beats a pair, **both** of its characters join the pool for the rest of the run (Frane and Bepo then have no match left, and neither ever partners in the MVP).
3. The resulting choices are always 2:

| Match | Valid persona | Unlocked candidates at that point |
|---|---|---|
| 1 | barba | Luka, Ive |
| 2 | mali | Dino, Tonči (beaten in M1) |
| 3 | gazda | Stipe (beaten in M1), Jure (beaten in M2) |
| 4 | mali | Dino, Tonči |

4. A character who is an opponent this match is never a valid partner, and this is guaranteed by rule 1. Unit-tested over every path (§18.11).
5. The pick is stored in the run (`run.partner`) when the match starts and is kept for a Revanš.

**Partner pick screen** (new, after clicking the konoba node, before the intro): a title "Odaberi partnera" / "Pick your partner", then one 300×420 card per valid candidate showing the portrait (200 px), name, tier (1–4 glass icons), perk name and description, and play style (one line from aggression: < 0.4 "oprezan / careful", 0.4–0.69 "uravnotežen / balanced", ≥ 0.7 "napadač / aggressive"). Unlocked characters with the wrong persona are shown greyed with "Sjedi s njima / Sits with them". Locked characters are dark silhouettes with "Pobijedi ga da se pridruži / Beat him to unlock". Button **Sjedni / Sit down** → intro.

#### 18.4.3 Opponent fore, rakija and marked cards per match

| # | Opponent fore (rakija per hand) | Šarane karte (`vi` marks, applied at match start) |
|---|---|---|
| 1 | none (0 / 0) | none |
| 2 | Jure: `pogled` (1) · Ive: none (0) | 1: Pozlaćeno on a random A |
| 3 | Luka: `tucem`, `krivi_racun` (2) · Dino: `duplo_ili_nista` (2) | 2: Nabrušeno on a random K, Usoljeno on a random A |
| 4 | Bepo: `tucem`, `trica_iz_rukava`, `duplo_ili_nista` (3) · Frane: `krivi_racun`, `pogled` (2) | 4: Pozlaćeno on a random 3, Ljuto on a random 3, Nabrušeno on a random 2, Glasno on a random A |

"Random X" uses `rngFor(seed,'marks',ladderIndex,attempt)` and picks among cards of that rank **without any ukras**, falling back to any card without an ukras. Marks are shown on the intro panel and removed when the match ends.

#### 18.4.4 Rewards and run numbers (Partneri)

| Item | Value |
|---|---|
| Match reward (win) | base (table above) + min(8, final margin) + akuža points declared by **team Mi** (player + partner) |
| Starting deck, fore, šoldi, revanš, fore slots | as §4.1 (40 cards, `pogled` + `zamjena`, 5 šoldi, 1 Revanš, 4 slots) |
| Match target | 31 |
| Run flow | MENU → MAP → **PICK** → INTRO → MATCH → (win) REWARD → BUTIGA (after matches 1–3) → MAP …; (lose) Revanš (same pair, same partner, 0:0, new attempt seed) or RUN_LOST |

#### 18.4.5 New portrait art (4 generations, same style and framing as §13.2 rows 31–34)

Prefix `STYLE_SCENE`, then: "Character portrait, chest up, facing the viewer, background a softly blurred stone konoba wall: …". Generate at 1024×1024 (not transparent) and resize to **512×512**.

| gen_id | Final file | Prompt (after the shared opening) |
|---|---|---|
| `portrait_dino` | `public/assets/portraits/dino.png` | Dino "Galeb", a 26-year-old Dalmatian summer charmer, slicked-back dark hair, deep tan, a tight white T-shirt, a seashell necklace and a flashy watch, one eyebrow raised in a confident smirk, holding a fan of cards casually in one hand. |
| `portrait_stipe` | `public/assets/portraits/stipe.png` | Stipe Kamenar, a broad-shouldered 45-year-old stonemason from the island of Brač, square jaw and stubble, dusty muscular forearms, a sleeveless grey work vest dusted with white limestone, a carpenter's pencil behind one ear, a heavy hand pressing a card onto the table. |
| `portrait_ive` | `public/assets/portraits/ive.png` | Ive Poštar, a skinny 58-year-old village postman, thin grey moustache, round glasses on the tip of his nose, a faded blue postman's cap and shirt, a leather mail-satchel strap across his chest, leaning in with a nosy, knowing look. |
| `portrait_frane` | `public/assets/portraits/frane.png` | Kapetan Frane, a pompous 65-year-old retired merchant-ship captain, neat white beard, a navy captain's cap with a plain gold anchor emblem (no lettering), a double-breasted navy jacket with brass buttons, chin raised proudly, a small glass of rakija in his hand. |

The manifest gains `images.portraits.{dino,stipe,ive,frane}` (8 portraits in total). Placeholder colours for the new characters follow their persona colour (§16.7).

### 18.5 Engine (`src/game/types4.ts`, `rules4.ts`, `match4.ts`)

```ts
export type Seat = 'S' | 'W' | 'N' | 'E';
export type Team = 'mi' | 'vi';
export const SEATS_CW: Seat[] = ['S', 'W', 'N', 'E'];            // clockwise play order
export const TEAM_OF: Record<Seat, Team> = { S: 'mi', N: 'mi', W: 'vi', E: 'vi' };
export const PARTNER_OF: Record<Seat, Seat> = { S: 'N', N: 'S', W: 'E', E: 'W' };
export function nextSeat(s: Seat): Seat;                            // clockwise
export type Signal = 'tucem' | 'striso' | 'volo';

export interface Card4 extends CardInst { ukrasTeam?: Team }        // owner is always 'player' (uid 'p:'); holder = whichever hand holds it

export interface SeatState {
  hand: Card4[];
  rakija: number; fore: ForaId[]; foreUsed: ForaId[];
  akuzeDeclared: Record<string, number>; akuzaChecked: boolean;    // checked at the first turn
  tricaTarget?: string; drunk: boolean;
}
export interface TeamState {
  pile: Card4[]; thirds: number; bonusPoints: number; akuzaPoints: number;
  kriviRacun: boolean; soldi: number;
}
export interface Play4 { seat: Seat; uid: string }
export interface Trick4 {
  no: number;                       // 1..10
  leader: Seat;
  plays: Play4[];                   // in play order
  signal?: { seat: Seat; kind: Signal; suit: Suit };
  forcedTeam?: Team;                // team whose seats must play highest (Ljuto / Tučem!)
  multiplier: 1 | 2;
  excludedLead?: string;            // Vrati!
  tucemFora?: boolean;
}
export interface Hand4State {
  seed: string; handNo: number; dealer: Seat;
  turn: Seat; phase: 'play' | 'over';
  trick: Trick4; tricksDone: number;
  seats: Record<Seat, SeatState>;
  teams: Record<Team, TeamState>;
  knownTo: Record<string, Team[]>;  // uid (in some hand) -> teams that know it
  voidKnown: Record<Seat, Suit[]>;  // public
  signalsLog: { trickNo: number; seat: Seat; kind: Signal; suit: Suit }[];
  partnerHandShown: boolean;        // Namješteno
  perks: Perks4;                    // { akuzaBonusMi, ultimaBonusMi, revealEachHand }
  ultima?: { team: Team; points: number };
  rngCounter: number; table: Card4[];
}
export type Action4 =
  | { type: 'play'; seat: Seat; uid: string; signal?: Signal }
  | { type: 'fora'; seat: Seat; fora: ForaId; targetUid?: string; targetSeat?: Seat };
export type GameEvent4 =
  | { t: 'handStarted'; handNo: number; dealer: Seat; leader: Seat }
  | { t: 'dealt'; hands: Record<Seat, string[]> }
  | { t: 'akuza'; seat: Seat; team: Team; combos: AkuzaCombo[]; total: number }
  | { t: 'turn'; seat: Seat; pos: 1 | 2 | 3 | 4; legal: string[]; signals: Record<string, Signal[]> /* per legal uid, leader only */ }
  | { t: 'signal'; seat: Seat; kind: Signal; suit: Suit }
  | { t: 'cardPlayed'; seat: Seat; uid: string; pos: 1 | 2 | 3 | 4; drunk: boolean }
  | { t: 'leadReturned'; seat: Seat; uid: string }
  | { t: 'revealed'; seat: Seat; uids: string[]; to: Team; via: 'pogled' | 'ribarsko' | 'postar' | 'namjesteno' | 'zamjena' | 'vrati' }
  | { t: 'swapped'; a: string; b: string }                               // Zamjena
  | { t: 'rakija'; seat: Seat; value: number }
  | { t: 'foraUsed'; seat: Seat; fora: ForaId; targetUid?: string; targetSeat?: Seat }
  | { t: 'trickResolved'; trickNo: number; winner: Seat; team: Team; plays: Play4[];
      thirdsTo: Record<Team, number>; bonus: { team: Team; ukras: UkrasId; points?: number; soldi?: number }[];
      ultima?: { team: Team; points: number } }
  | { t: 'handScored'; breakdown: Record<Team, SideBreakdown> }          // reuse the SideBreakdown shape
  | { t: 'matchScoreChanged'; scores: Record<Team, number> }
  | { t: 'matchOver'; winner: Team; finalScores: Record<Team, number> };
```

API (pure, same conventions as §16.3): `createHand4({ seed, handNo, dealer, deck: DeckCard[] (40, with ukrasTeam), fore: Record<Seat, ForaId[]>, rakija: Record<Seat, number>, perks })`, `legalPlays4(s, seat)`, `legalSignals4(s, seat, uid): Signal[]`, `canUseFora4(s, seat, fora)`, `applyAction4(s, a)`, `scoreHand4(s)`.

**Hand state machine:**

```
createHand4: shuffle 40 → deal 10 per seat (packets of 5, clockwise from nextSeat(dealer))
  → [perk postar: revealed W 1 card, E 1 card to 'mi']
  → leader = nextSeat(dealer); phase 'play'; turn = leader
on every turn start: if !seat.akuzaChecked → akuža check (team-filtered ukrasi), award to the team score, reveal to all
  → emit turn
'play' --fora*--> 'play' (same turn)
       --play(+signal if leader)--> next seat clockwise; after the 4th play → RESOLVE
RESOLVE: winner = highest effective strength in the led suit (earlier play wins ties)
         thirds → winner's team (Usoljeno exception), bonuses, Ribarsko reveals
         trick 10 → ultima (+1; Ponoćno 3; Zidar +1 for Mi) → SCORE → 'over'
         else next trick, leader = winner
```

**Legal plays (follower):** follow suit if able. If `trick.forcedTeam === TEAM_OF[seat]` and the seat holds the led suit, only its highest-strength card(s) of that suit are legal. Otherwise any card. A seat that fails to follow is added to `voidKnown` (public). A Volo signal adds the leader to `voidKnown` for that suit at once.

**Scoring:** for each team, `cardPoints = floor(thirds/3)`, or `ceil` if any member used Krivi račun. `total = cardPoints + ultima + bonusPoints`. Akuže are already in the score. Without ukrasi the two teams' totals always sum to 11 (unit test).

**Match (`match4.ts`):** `MATCH4_TARGET = 31`. `scores: Record<Team, number>`. Hand 1 dealer `E`, then `nextSeat(dealer)`. Hand seed = `rngFor(run.seed,'hand4',ladderIndex,attempt,handNo)`. End check as §3.8 with 31.

### 18.6 Bot AI for partnerships (`src/game/bot4.ts`, `botMemory4.ts`)

#### Knobs by tier (character table in §18.4.1 gives tier and aggression)

| Knob | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| `memory` (chance to remember each played card) | 0.50 | 0.75 | 0.92 | 1.00 |
| `mistakeRate` | 0.18 | 0.10 | 0.04 | 0.00 |
| `signalUse` (give a legal signal) | 0.50 | 0.75 | 0.90 | 1.00 |
| `readSignals` (obey the partner's signal) | 0.60 | 0.85 | 1.00 | 1.00 |
| `carico` (load points on a safe partner trick) | 0.50 | 0.80 | 0.95 | 1.00 |
| `huntAce` | false | true | true | true |
| `pimcMaxCards` / `pimcSamples` | 0 / – | 0 / – | 3 / 8 | 4 / 12 |
| `thinkMs` | [500, 900] | [600, 1100] | [700, 1300] | [800, 1500] |

Signals, void flags and akuža reveals are public, so they are **always remembered** (memory applies only to played cards). A mistake picks a random legal non-ace card.

#### Definitions

- `unseen` = the 40-card deck list − own hand − remembered played cards − cards known to my team in other hands.
- `possible(seat, S)` = cards of S known to my team in that seat's hand, plus (if the seat is not void in S) unseen cards of S.
- `pHas(seat, x)` = 1 if x is known in that seat's hand. Else 0 if the seat is void in x.suit. Else `unknownCount(seat) / Σ unknownCount(s')` over the other seats not void in x.suit.
- `after` = the seats still to play after me in this trick.
- `W` = the currently winning play; `V` = thirds on the table × multiplier.
- `safe(card)`: no opponent in `after` has a possible card of the led suit stronger than `card` (opponents void in the suit cannot beat it).
- `isMaster(c)`: no other seat has a possible card of `c.suit` stronger than c.
- `val(c)`: thirds (A 3; 3/2/K/C/F 1), +3 if the card has a Pozlaćeno that pays the team that would capture it.

#### Following (pos 2–4)

```
if partner led with a signal and rng() < readSignals: apply the §18.2 reaction (it overrides the rules below)
SC = my legal cards of the led suit
if SC non-empty:
  if W.seat == partner:
     if safe(W.card) or after has no opponent:
        if rng() < carico: play the max-val card of SC that is NOT a master in the suit
                           (if all are masters: the min-val SC card)            // CARICO
        else: play min (val, str) of SC
     else:                                                                       // partner can still be beaten
        if I hold a safe winner w in SC (str > W and safe): play the lowest such w   // secure the trick
        else: play min (val, str)                                               // never feed points to an unsure trick
     NEVER overtake a partner card that is safe (unless mistake)                 // NO-OVERTAKE
  else (an opponent is winning):
     winners = SC with str > W.str
     safeWinners = winners where safe(c)
     if pos == 4: if winners and (V >= 1 or trick 10): play the lowest winner; elif a winner has val 0: play it; else dump
     elif safeWinners non-empty and (V >= 1 or trick 10 or rng() < aggression): play the lowest safe winner
     elif winners non-empty and V >= 3: play the highest winner                  // contest an ace
     else: dump = min (val, str) of SC
else (void in the led suit; cannot win):
  if W.seat == partner and (safe(W.card) or no opponent after) and rng() < carico:
       discard order: a non-master A → a non-master 3/2/K/C/F (by val desc, str asc) → else a lišina   // CARICO
  else: discard a lišina from my shortest suit; never an A while a non-A exists
```

#### Leading

```
1. Partner signalled Tučem in suit S earlier this hand (and is not void in S) and I hold S → lead my master of S if I have one, else my lowest S card.
2. Partner is void in S (Volo or failed to follow) and I hold a master m in S → lead m (the partner can load points).
3. Two cards left and one is a master → lead the other (keep the master for the ultima).
4. huntAce: I hold the 3 (or a master 2) of S, the A of S is possibly held by an opponent (Σ pHas over opponents ≥ 0.5),
   and the opponents are not both void in S → lead that master.
5. Cash masters with val ≥ 1 in suits where an opponent is not void, if trick ≥ 6, or earlier with probability `aggression`.
6. Lead the lowest lišina of my longest suit. Prefer suits where my partner is not known void, and avoid suits where an opponent is void
   (they would discard freely).
7. Otherwise min (val, str), preferring masters.
After choosing the card: attach a signal (Tučem > Volo > Strišo) if legal and rng() < signalUse.
```

**PIMC (tiers 3–4):** when the bot's hand has ≤ `pimcMaxCards` cards, sample K deals of `unseen` to the other 3 seats, respecting the hand sizes and voids (relax the voids if impossible). Run an alpha-beta two-team minimax over the remaining tricks (my team maximises team thirds + ultima·3 + Pozlaćeno·3). Pick the best average move. Node cap 100,000 per sample.

**Bot fore (Vi seats):**

| Fora | Use when |
|---|---|
| `pogled` | First own turn of the hand; target whichever of S/N has more cards unknown to Vi (tie: S). |
| `tucem` | Leading a master 2 or 3 of S, and Σ val·pHas of S over the 2 opponents (the Mi seats) ≥ 2. |
| `duplo_ili_nista` | Leading a 3 with Σ val·pHas of S over the Mi seats ≥ 2, or at pos 4 when my team wins the trick with V ≥ 3. |
| `trica_iz_rukava` | At pos 3–4, an opponent's A or 2 is winning, I hold the suit without a winner, and the target card would be safe after it is boosted. |
| `krivi_racun` | Trick ≥ 9 and Vi thirds % 3 ≠ 0. |

**Fairness:** `BotView4` is built from the true state through `BotMemory4`. It contains only: own hand, all played cards (memory-filtered), the current trick, signals, voids, cards known to the bot's team, hand sizes, the deck list with ukrasi and teams, and scores. Test: across 300 seeded hands, no view contains the uid of a card in another seat's hand unless `knownTo` includes the bot's team.

### 18.7 Voice director in Partneri (extends §9; no new lines)

Three speakers: **partner (N)**, **left opponent (W)**, **right opponent (E)**. Each uses its character's persona folder, `playbackRate` and a `cussMult` (tier 1: 1.1, tier 2: 1.2, tier 3: 0.9, tier 4: 0.9). **Only the existing 34 line ids are used; the text and subtitles are unchanged** (§9.3). Exclusive lines play only for their persona (the director filters as today).

#### 18.7.1 Shared arbitration (replaces the §9.5 gap and cap in Partneri)

| Rule | Value |
|---|---|
| Lines playing at once | 1 (one global "mouth"); a priority-3 line interrupts (80 ms fade) |
| Global gap between any two lines | **2500 ms** (priority 3 bypasses it) |
| Per-hand cap | **9 lines in total**, and **4 per speaker** (priority 3 bypasses both) |
| Event cooldowns | per **(speaker, event)** pair |
| No-repeat | a speaker doesn't repeat any of the **last 3 lines spoken at the table** (if the pool is empty, ignore this rule) |
| Exclusive preference | 50% chance to pick a persona-exclusive line when one is in the pool (as in §9.5) |

Implementation: one `VoiceArbiter` (now, gap, cap, playing state, recent lines) shared by three `VoiceDirector` instances, one per seat with its own persona, rate and cussMult. `VoiceDirector` gains an optional `arbiter` dependency; without it, Dvoboj behaviour is unchanged.

#### 18.7.2 Speaker routing

- **Opponent events** are the §9.4 events with "bot" read as **team Vi** and "player" as **team Mi**. Pools, probabilities and cooldowns are unchanged. The speaker is:
  - for losses: the Vi seat whose own card in the trick had the highest val (tie: the one who played later);
  - for wins: the Vi seat that won the trick;
  - for akuže: the declaring seat;
  - for match end: W;
  - for `match_start`: W says `sidi_misaj`.
- Trick-end evaluation order: **partner misplay** → partner events → opponent events (§9.4 order). **At most one line per trick.**
- `idle` (player idle 12 s): the partner speaks with 60% probability, otherwise a random opponent. The pool is unchanged.

#### 18.7.3 Partner events (new event ids, existing lines)

| Event | Fires when (exact) | p | Cooldown | Prio | Lines |
|---|---|---|---|---|---|
| `partner_misplay` | One of: (a) **point dump**: the player's card had val ≥ 1, Vi won the trick, and the player had a legal val-0 card; (b) **overtake**: the partner's card was winning and safe at the player's turn, and the player beat it with an A, 2 or 3 while holding a lower legal card of the suit; (c) **ignored Tučem**: the partner signalled Tučem, the player held the suit, and the player didn't play their highest card of it | 0.75 (a, c) / 0.6 (b) | 10 s | 2 | `ajde_tovare`, `ej_ko_te_napravi`, `sta_si_mislija`, `ne_mogu_virovat`, `jarca_ti` |
| `partner_team_big` | Mi wins a trick worth ≥ 3 thirds (after the multiplier) | 0.45 | 8 s | 1 | `lipo_daj_ovamo`, `evo_ti_ga_na`, `aha_sta_je_sad`, `gledaj_i_uci` |
| `partner_player_great` | The player captures an opponent's A or 3, **or** the player's carico puts ≥ 3 thirds onto the partner's winning trick | 0.55 | 8 s | 2 | `aha_sta_je_sad`, `evo_ti_ga_na`, `lipo_daj_ovamo` |
| `partner_lose_big` | Vi wins a trick worth ≥ 3 thirds and `partner_misplay` did not fire | 0.4 | 10 s | 1 | `jebem_ti_pasa`, `grom_te_spanija`, `jarca_ti`, `srice_nima` |
| `partner_akuza` | The partner is awarded an akuža | 1.0 | – | 3 | as `akuza_bot` (napolitana / akuzan_cetiri / akuzan_tri) |
| `partner_signal` | The partner leads with Tučem (signal or fora) | 1.0 | – | 2 | `tucem` |
| `opp_signal` | An opponent leads with Tučem (signal or fora) | 1.0 | – | 2 | `tucem` |
| `partner_ultima` | Mi wins trick 10 | 0.5 | – | 2 | `ultima_moja` |
| `partner_hand_win` | Mi's hand total ≥ Vi's + 6 | 0.6 | – | 2 | `gledaj_i_uci`, `lipo_daj_ovamo`, `u_mojoj_konobi`, `stari_ja`, `ka_bombone` |
| `partner_match_win` | Mi wins the match (said after the opponent's `match_bot_lose` line) | 1.0 | – | 3 | `plati_rakiju` |
| `partner_match_lose` | Vi wins the match (after the opponent's `match_bot_win`) | 1.0 | – | 3 | `ajme_majko`, `srice_nima`, `runda_na_mene` |

Strišo and Volo have **no voice line**: callout and sfx only (§18.2).

#### 18.7.4 The "argument" moment

When an opponent's line with mood `angry` finishes, then with **p = 0.25, at most once per hand**, the partner answers **900 ms** later with one of `sta_si_mislija`, `gledaj_i_uci`, `lipo_daj_ovamo`, `ajde_tovare` (priority 2). The reply ignores the global gap but counts toward both caps. The two portraits face-off: the opponent's portrait shakes (A26 angry) and the partner's bounces (A26 laugh).

Match end order: the losing side's line first, then the winning side's line 600 ms after it ends (both priority 3).

### 18.8 Scene and layout for 4 seats (extends §10–§12)

The camera, lights and table are unchanged (§10.2–10.3). Macs, mac labels and draw reveal points are not used. Add the following to `src/render/layout.ts` (world units; DEG = π/180):

| Element | Spec |
|---|---|
| **S** player hand | unchanged (`playerSlot`, camera space) |
| **N** partner hand | the existing `botSlot` fan at `BOT_HAND_CENTER` (0, 0.02, −2.6), face down, scale 0.85, back `back_player` (it is the player's deck) |
| **W** left opponent hand | fan radius 4, step = min(3.2°, 28°/(n−1)), scale 0.80, face down. Pivot (−9.2, 0.02, 0.2). Card i: θ = (i−(n−1)/2)·step; pos = (pivot.x + 4·cos θ, 0.02 + i·0.003, pivot.z + 4·sin θ); yaw = +90° − θ (card tops point toward the table centre). |
| **E** right opponent hand | mirror of W: pivot (9.2, 0.02, 0.2); pos.x = pivot.x − 4·cos θ; yaw = −90° + θ |
| Trick slots (face up, readable from S) | S (0.15, y, 1.25) yaw −4° · W (−1.00, y, 0.50) yaw +10° · N (−0.15, y, −0.30) yaw +5° · E (1.00, y, 0.50) yaw −10°; jitter ±3°; y = 0.03 + 0.008·(play index 0–3) |
| Team piles | Mi (6.4, 0, 3.0) · Vi (−6.4, 0, −2.6) (the existing pile positions) |
| Deck stack (deal source, in front of the dealer) | S (2.4, 0, 2.8) · W (−4.2, 0, 1.6) · N (−2.4, 0, −2.0) · E (4.2, 0, −0.6) |
| Akuža showcase | unchanged (`SHOWCASE`); bot akuža cards fly there from that seat's fan |
| Card backs | all 40 cards use `back_player` (one deck) |

**Animation changes (timings in ms, eases as in §11.1):**

| # | Change |
|---|---|
| A9 (bot card → trick) | Generalised to seats W, N and E: duration **420**; lift +0.3 from that seat's fan; flip face up between 30% and 70%. |
| A11 hold | **650** after the 4th card (instead of 550). |
| A13 gather | **200**: all 3 other cards slide onto the winning card. |
| A14 sweep | to the **winning team's** pile (Mi or Vi), 380. |
| A20/A21 deal | Shuffle the single deck stack at the dealer (700). Then **8 packets of 5** clockwise from the seat after the dealer; card flight **280**, stagger **50** within a packet, **300** between packets (≈ 2.9 s). sfx `deal` at most 1 per 70 ms. S cards flip face up on arrival. |
| A22 | Not used (no mac). |
| New A38: signal callout | A chip (180×48 px, cream on ink, icon + "TUČEM!" / "STRIŠO" / "VOLO") pops at the leader's trick-slot screen position: in 200 `back.out(1.7)`, hold 1200, fade 300. A 28 px signal icon stays pinned to the lead card until the sweep. |
| New A39: turn indicator | The active bot seat's portrait ring pulses ochre (scale 1 ↔ 1.06, 900 loop) with thinking dots in that seat's bubble spot. On the player's turn: A28 as before. |
| New A40: void chips (Luka perk) | A crossed 24 px suit icon pops under the opponent's nameplate (200 `back.out`). |

**HUD (1920×1080 reference; replaces the §12.2 portrait, bubble and score rows):**

| Element | Position | Notes |
|---|---|---|
| Partner N portrait | top centre, 150×150 (the existing spot) | ring colour Adriatic blue `#2F5D7C` (teammate); nameplate "Partner: Ive Poštar" |
| N bubble | right of the N portrait, max-width 380 | |
| N Viđeno strip | left of the N portrait | partner cards known to the player (Zamjena, Namješteno) |
| W portrait | left edge: left 24 px, top 300 px, 120×120 | ring terracotta `#B5452B` (opponent); nameplate below; Viđeno strip and void chips below the nameplate |
| W bubble | right of the W portrait, max-width 300 | tail pointing left |
| E portrait | right edge: right 24 px, top 300 px (below the chalkboard), 120×120 | same as W, mirrored |
| E bubble | left of the E portrait, max-width 300 | tail pointing right |
| Chalkboard | top-right, 300×190 | "MI **17** : **12** VI" · "do 31 · ruka 3" · "u ruci: 4⅔ : 3⅓" |
| Signal buttons | bottom-right, left of the šoldi counter, 3 × 56 px round | §18.2 |
| Seat target mode | – | Opponent portraits glow cyan `#7FD6E0`; click to choose; Esc cancels |
| Hand summary | as §12.4 | columns "MI" and "VI"; an extra row "od toga partner" (partner's akuže) |
| Intro panel | as §12.3 | two opponent portraits side by side; their fore; "Šarane karte: n" with the mini cards; your partner's portrait and perk |
| Map nodes | as §12.3 | each konoba node shows two mini portraits (the pair) |

**New strings (Appendix A additions):** `mode.partneri` "Partneri (2v2)" / "Partners (2v2)" · `mode.dvoboj` "Dvoboj (1v1)" / "Duel (1v1)" · `hud.mi` "MI" / "US" · `hud.vi` "VI" / "THEM" · `pick.title` "Odaberi partnera" / "Pick your partner" · `pick.busy` "Sjedi s njima" / "Sits with them" · `pick.locked` "Pobijedi ga da se pridruži" / "Beat him to unlock" · `pick.sit` "Sjedni" / "Sit down" · `signal.tucem` "Tučem" · `signal.striso` "Strišo" · `signal.volo` "Volo" · `toast.signalIllegal` "Taj znak ne ide s tom kartom" / "That signal doesn't fit that card" · `toast.partnerSignal` "{name}: {signal}!" · `summary.partner` "od toga partner" / "of which partner" · `intro.marks` "Šarane karte: {n}" / "Marked cards: {n}" · `shop.move` (§18.3.3) · reason keys `pickSeat`, `partnerEmpty`, `secondOnly` (§18.3.2).

**How to play (Partneri addition, shown first in the overlay):**
- hr: "Igraš u paru s partnerom preko puta. Sve 40 karte se podijele, po 10 svakome, bez maca. Igra se u smjeru kazaljke na satu. Akuže se prijavljuju prije prve karte i idu paru. Partija do 31. Kad otvaraš, možeš dati znak: Tučem (imam jake karte, baci najjaču i vrati mi boju), Strišo (imam još te boje, ne uzimaj), Volo (to mi je zadnja te boje)."
- en: "You play with a partner sitting opposite. All 40 cards are dealt, 10 each, with no stock. Play goes clockwise. Declarations are made before your first card and score for your team. A match goes to 31. When you lead you may signal: Tučem (I'm strong here: play your highest and lead this suit back), Strišo (I have more of this suit: don't overtake), Volo (that was my last card of this suit)."

### 18.9 Menu and saves (extends §12.1 and §16.6)

- **Main menu:** a large primary button **"Partneri (2v2)"**, a smaller secondary button **"Dvoboj (1v1)"**, then How to play and Settings. For each mode with a save, a **"Nastavi · Partneri · Konoba 2"** / **"Nastavi · Dvoboj · Konoba 3"** button sits above the mode buttons. Starting a new run in a mode with a save asks for confirmation and overwrites **only that mode's** save.
- **Separate saves per mode:**

| Key | Content |
|---|---|
| `treseta.save.v1` | Dvoboj `RunState` (unchanged, so existing saves keep working) |
| `treseta.save.partneri.v1` | `{ version: 1, run: RunState4 }` |
| `treseta.stats.v1` | Dvoboj stats (unchanged) |
| `treseta.stats.partneri.v1` | Partneri stats (same fields) |
| `treseta.settings.v1` | shared |

- `RunState4` = the `RunState` fields + `mode: 'partneri'`, `partner?: CharacterId`, `unlocked: CharacterId[]` (start `['luka','ive','dino']`), `shop.moves` (instead of `removals`), `discount: 0 | 1` (Jure perk), status adds `'pick'`, and `match?: { scores: Record<Team, number>; handNo; dealer: Seat; akuzaPointsMi }`. The deck is always 40 cards. Resume rules as §16.6 (restart the interrupted hand from its seed).

### 18.10 Module layout additions

```
src/game/types4.ts       Seat, Team, Card4, Hand4State, Action4, GameEvent4 (§18.5)
src/game/rules4.ts       createHand4, legalPlays4, legalSignals4, canUseFora4, applyAction4, scoreHand4
src/game/ukrasi4.ts      team-aware hooks (§18.3.1)
src/game/fore4.ts        canUse/apply for seats, reuses FORE metadata (+ descEn4/descHr4) (§18.3.2)
src/game/characters.ts   the 8 characters, perks, knobs by tier (§18.4.1, §18.6)
src/game/ladder4.ts      PAIRS (§18.4.2–18.4.3), validPartners(run, matchIndex)
src/game/match4.ts       target 31, team scores, dealer rotation
src/game/run4.ts         newRun4, rewards, unlocks, moveUkras, discount; reuses generateOffers/reroll/buy* from run.ts
src/game/bot4.ts         follow/lead/signals/fore/PIMC (§18.6)
src/game/botMemory4.ts   BotMemory4, buildView4
src/audio/voiceArbiter.ts        shared gap/cap/mouth (§18.7.1)
src/audio/voiceTriggers4.ts      misplay detection, speaker routing (§18.7.2–18.7.4)
src/data/voiceEvents4.ts         partner events table (§18.7.3)
src/controller/gameController4.ts
src/render/layout.ts     + seat fans, 4 trick slots, deck stacks (§18.8)
src/render/animator.ts   + seatToTrick, resolveTrick4, deal4, signalCallout (existing methods untouched)
src/ui/hud4.ts           3 portraits/bubbles, team chalkboard, signal buttons, seat targeting
src/ui/partnerPick.ts    the pick screen
src/ui/menus.ts          mode buttons and per-mode continue
```

Run `generateOffers`, `reroll`, `buyUkras`, `buyFora` and `buyCasica` from `run.ts` on `RunState4` by typing their parameter as `Pick<RunState, 'seed' | 'fore' | 'rakijaBase' | 'soldi' | 'shop' | 'deck'>` (a widening only; Dvoboj behaviour is unchanged).

### 18.11 Tests to add (vitest)

| File | Must cover |
|---|---|
| `rules4.test.ts` | all 40 dealt, 10 per seat, no duplicates; clockwise order S→W→N→E; hand 1 dealer E and S leads; dealer rotation; follow suit; off-suit never wins; earlier play wins a 20-vs-20 tie; team thirds pooled; **without ukrasi team totals sum to 11** (500 seeded hands); akuža at each seat's first turn, credited to the team, revealed to all; `legalSignals4` (Tučem ≥ 2 of top-3, Strišo ≥ 2 others, Volo last card); a Volo sets the void; forcedTeam (Ljuto, Tučem!) forces both opponents and not the partner; match to 31 with the tie rule |
| `ukrasi4.test.ts` | each of the 10 with a Mi card and a Vi mark: Pozlaćeno/Srebreno pay when the card ends in the team pile whoever played it; Nabrušeno/Usoljeno/Ponoćno only when played by T; Ljuto forces both of the other team; Divlje/Glasno only in T hands; Ribarsko reveals 1 card per opponent; Pijano → player rakija |
| `fore4.test.ts` | each fora's 4-seat rules: seat targets (Pogled, Napij ga), the Zamjena partner swap, the Namješteno reveal, the Ti otvaraj order (W,N,E,S), Vrati! only as 2nd after E's lead, team Krivi račun and Duplo; reason keys |
| `bot4.test.ts` | only legal plays and signals (300 seeded hands per tier); `BotView4` leak test; no-overtake of a safe partner; carico of a non-master A onto a safe partner trick; obeys Tučem (highest) and Strišo (lowest); returns the suit after Tučem; leads a master into a Volo partner's void; Vi fore policy |
| `characters.test.ts` | for **every** match and **every** valid partner: the 3 bot personas are pairwise distinct; each match has exactly 2 valid unlocked partners on the winning path; the unlock progression; Frane and Bepo never offered as partners |
| `voice4.test.ts` | routing (misplay → N speaks), gap 2500 ms across speakers, cap 9 per hand and 4 per speaker, priority 3 bypass, the argument at most once per hand with a 900 ms delay, **only the 34 existing line ids appear** in `voiceEvents4.ts`, persona-exclusive filtering |
| `run4.test.ts` | rewards (team akuže), Prebaci ukras (price 3, max 2, target without an ukras, deck stays 40), no removal service, Jure discount, Dino rakija, Šarane karte seeded and removed after the match |
| `save4.test.ts` | separate keys; a Partneri save doesn't touch the Dvoboj save and vice versa; version mismatch is discarded |
| `manifest.test.ts` (update) | portraits count 8 |

### 18.12 Partneri acceptance checklist

- [ ] The main menu shows Partneri (primary) and Dvoboj (secondary), each with its own Continue. Dvoboj still passes all §17 items unchanged.
- [ ] A full Partneri run: map → partner pick → intro → 4 matches against the §18.4.2 pairs → butiga after matches 1–3 → victory or defeat.
- [ ] 4-seat rules: 40 cards dealt, 10 each; clockwise play; dealer rotation; follow suit; 10 tricks; team scoring with 11 points per hand plus ultima; akuže at the first turn for the team; match to 31.
- [ ] Signals: the player's 3 buttons with legality dimming; bots give and obey signals per §18.2; callouts (A38); `tucem` voiced.
- [ ] Partner bots don't overtake a safe partner card and they load points (carico) per §18.6. Bots never make illegal moves or read hidden cards.
- [ ] All 10 ukrasi and 10 fore behave per §18.3. Vi marks are shown and work only for Vi. Prebaci ukras replaces Izbaci kartu.
- [ ] Partner pick: only valid unlocked partners are offered, and **at every table the 3 bot voices are different personas**. Perks work (Brzi jezik, Šarmer, Na crtu, Zidar, Poštar zna sve, Pamćenje).
- [ ] Voice: three speakers share one arbiter (2500 ms gap, 9 per hand / 4 per speaker). The partner reacts to the player's misplays and big team tricks. The argument moment fires. No new audio files are needed and only the 34 existing line ids are used.
- [ ] Scene: 4 fans (§18.8), 4 trick slots, sweep to the team pile, a 4-seat deal, turn indicators, 3 portraits with bubbles, the MI : VI chalkboard.
- [ ] Separate localStorage saves per mode. The game runs with the 4 new portraits missing (placeholders) and with them present.
- [ ] All §18.11 tests pass.

---

## 19. Revision 2 (play-test changes)

§19 **overrides every earlier section where they conflict**, in **both** modes unless a subsection says "Dvoboj" or "Partneri". Summary of the changes:

1. **A match is played to 11 points** (usually 2 hands), checked at hand end.
2. **Dvoboj uses one shared 40-card deck with a shared mac.**
3. **Drawn cards are hidden.**
4. **The run escalates from plain Trešeta to rule-bending chaos** through shop tiers, and forgeries bring duplicates back in.
5. **Aces have no corner index.**

### 19.0 Replaced or changed subsections

| Earlier subsection | Status under §19 |
|---|---|
| §2.3 rows "Each side plays from its own deck…", "Ties are possible…" and "About 11 per hand…" | **Replaced** by §19.3: one deck; ties only through forgeries or Trica iz rukava |
| §3.2 (two decks) | **Replaced** by §19.3.1 |
| §3.3 steps 3–5 (deal, draws) | **Replaced** by §19.3.1 |
| §3.4 legal plays | **Extended** by Prevrtljivo (§19.2.3) and identity rules (§19.4) |
| §3.5 step 1 (winner, ties) | **Replaced** by §19.4.2 |
| §3.7 (akuže timing) | Unchanged, except reveals now come only from declarations (draws are hidden) |
| §3.8 and §18.5 "Match" (targets 21/31) | **Replaced** by §19.1.1: first to 11, checked at hand end, an exact tie plays another hand |
| §3.9 knowledge, §8.2 `pHas`, §8.3 memory | **Replaced** for Dvoboj by §19.3.2 |
| §4.1–§4.3 and §18.4.2–§18.4.4 (ladders, rewards, revanš, starting kit) | **Replaced** by §19.1 |
| §5 / §6.3 / §18.3 item lists | **Extended**: tiers (§19.2), new items `prevrtljivo`, `briskula`, Falsa karta. Ukrasi in Dvoboj follow the §18.3.1 team rules (§19.3.3). |
| §7.1–§7.2 (shop offers, Izbaci kartu) | **Replaced** by §19.2. "Izbaci kartu" no longer exists in any mode; **Prebaci ukras** is used in both. |
| §8.1 bot decks and per-character knobs (Dvoboj) | **Replaced** by the §19.1.3 match table (knobs by match tier) |
| §9.4 / §18.7 voice events | **Adjusted** for forgeries, Briškula and hidden draws (§19.6) |
| §10.5 macs, piles, reveal points (Dvoboj) | **Replaced** by §19.3.4 |
| §11.1 A16–A19, A22, A30 | **Replaced** by §19.3.4 and §19.5 |
| §12.2 Viđeno strip; §12.3 map nodes; §12.4 hand summary (now light); §12.5 match end | **Replaced** by §19.5 |
| §13.5 step 2 for aces; §3.1 "Corner index" for A | **Replaced**: aces have **no index** (§19.7) |
| §16.6 and §18.9 save keys | **Replaced** by §19.8 |
| §17 and §18.12 | Still apply where not contradicted, **plus** §19.10 |

### 19.1 Matches to 11 and the new run

#### 19.1.1 Match = first to 11 (replaces §3.8 and §18.5 "Match")

| Item | Rule |
|---|---|
| Hand length | **Dvoboj:** 20 tricks (10 in hand + 20-card shared mac). **Partneri:** 10 tricks. Every card of the 40-card deck is played in every hand. |
| Target | **11 points** (card points + ultima + ukras bonuses + akuže). Akuže enter the score immediately, as before. |
| End check | **Only at hand end.** If at least one side/team has ≥ 11: the higher score wins. If both have ≥ 11 and are **exactly tied**, play another hand. Otherwise (no one at 11 yet), play the next hand. |
| Typical length | A hand distributes about 11 points plus akuže, so a match is usually **2 hands**: 1 with big akuže, sometimes 3. Dvoboj ≈ 4.5 min, Partneri ≈ 3.5 min. |
| Dealer | **Dvoboj:** hand 1 of match i (0-based): the bot deals if i is even, the player if i is odd. Within a match the dealer alternates each hand. **Partneri:** hand 1 of match i: dealer `SEATS_CW[(3 + i) % 4]` (match 1 dealer E, so S leads), then it rotates clockwise each hand. A Revanš restarts with the same first dealer. |
| Hand seed | `rngFor(run.seed, 'hand', mode, ladderIndex, attempt, handNo)` |
| Between hands | A **light summary** (§19.5.2): auto-continues after 3500 ms, or on click / Space. |

#### 19.1.2 Run numbers (both modes)

| Item | Value |
|---|---|
| Matches per run | **6** (matches 1–5, then the boss at match 6). About 30–40 min per run: Dvoboj ≈ 6 × 4.5 min + 5 shops ≈ 35 min; Partneri ≈ 30 min. |
| Shops | after matches **1–5** (5 visits); none after the boss |
| Starting deck | the standard 40 cards, **no ukrasi** |
| Starting fore | **`pogled` only** |
| Fore slots | 4 |
| Starting šoldi | 6 |
| Rakija per hand | **2** at the start. **Veća čašica** gives +1 and can be bought **twice** (8, then 10 šoldi; the base goes 2 → 3 → 4). Partner Dino +1. Cap 5. With only Pogled at the start, 2 is enough; the base grows as the run gets wilder. |
| Deck size | always exactly 40 (no removal in either mode) |
| **Revanš** | **2 tokens per run.** Losing a match spends 1 token and **replays the same match from 0:0** right away: same opponent(s), same partner, same first dealer, new seed (attempt + 1), no shop in between, no reward for the lost attempt. Losing with 0 tokens ends the run (the boss included). Tokens are shown as chalk marks under the map token. |
| Match reward (win) | `base(match) + min(6, final margin) + akuža points of the player's side/team in that match`, plus Srebreno coins paid as they trigger |
| Expected income | about 14 šoldi per match → about 75 over 5 shops → about 9 purchases |

#### 19.1.3 Ladders

Opponent **knobs come from the match tier**, not the character: Dvoboj tier T uses the §8.1 knob row of tonci/jure/luka/bepo for T = 1/2/3/4; Partneri uses the §18.6 tier table. Characters supply only name, portrait, persona, playbackRate and aggression. Partner knobs (Partneri) still use the partner's own tier (§18.4.1). For the four new characters in Dvoboj, `cussMult` by tier is 1.1 / 1.2 / 0.9 / 0.9.

**Dvoboj ladder**

| # | Konoba | Opponent | Tier | Bot fore (rakija/hand) | Bot šarane karte (marks, `vi`) | Bot forgeries (`vi`) | Base |
|---|---|---|---|---|---|---|---|
| 1 | "Škoj" | Mali Tonči | 1 | – (0) | – | – | 8 |
| 2 | "Kod Jure" | Gazda Jure | 2 | – (0) | – | – | 9 |
| 3 | "Pod Lozom" | Ive Poštar | 2 | `pogled`, `krivi_racun` (1) | Pozlaćeno on a random A | – | 10 |
| 4 | "Ribarska" | Dino "Galeb" | 3 | `tucem`, `duplo_ili_nista` (2) | Nabrušeno on a random K, Usoljeno on a random A | – | 11 |
| 5 | "Kamenolom" | Barba Luka | 3 | `tucem`, `krivi_racun`, `trica_iz_rukava` (2) | Ljuto on a random 3, Pozlaćeno on a random A | 1: a lišina → copy of a random 2 | 12 |
| 6 | "Na Brdu" (boss) | Did Bepo | 4 | `tucem`, `trica_iz_rukava`, `duplo_ili_nista`, `briskula` (3) | Pozlaćeno on a random 3, Ljuto on a random 3, Nabrušeno on a random 2, Glasno on a random A | 1: a lišina → copy of a random 3 | 15 (stats) |

**Partneri ladder** (start unlocked: Luka, Ive, Dino; beating a pair unlocks both members; the partner persona is the one neither opponent uses)

| # | Konoba | W | E | Partner persona (candidates) | Tier | Fore W / E (rakija W / E) | Marks (`vi`) | Forgeries (`vi`) | Base |
|---|---|---|---|---|---|---|---|---|---|
| 1 | "Škoj" | Tonči | Stipe | barba (Luka, Ive) | 1 | – / – (0/0) | – | – | 8 |
| 2 | "Kod Jure" | Jure | Ive | mali (Dino, Tonči) | 2 | – / – (0/0) | – | – | 9 |
| 3 | "Pod Lozom" | Tonči | Ive | gazda (Stipe, Jure) | 2 | `pogled` / `krivi_racun` (1/1) | Pozlaćeno on a random A | – | 10 |
| 4 | "Ribarska" | Stipe | Dino | barba (Luka, Ive) | 3 | `tucem` / `duplo_ili_nista` (1/2) | Nabrušeno on a random K, Usoljeno on a random A | – | 11 |
| 5 | "Kamenolom" | Dino | Luka | gazda (Stipe, Jure) | 3 | `duplo_ili_nista` / `tucem`, `krivi_racun` (2/2) | Ljuto on a random 3, Pozlaćeno on a random A | 1 (→ random 2) | 12 |
| 6 | "Na Brdu" (boss) | Bepo | Frane | mali (Tonči, Dino) | 4 | `tucem`, `trica_iz_rukava`, `duplo_ili_nista`, `briskula` / `krivi_racun`, `pogled`, `briskula` (3/2) | Pozlaćeno on a random 3, Ljuto on a random 3, Nabrušeno on a random 2, Glasno on a random A | 1 (→ random 3) | 15 (stats) |

- Every row has exactly 2 valid unlocked partners, and the 3 bot personas at each table are all different (asserted by the test in §19.9).
- The §18.4.1 partner perks are unchanged. The Jure perk discount applies to the shop after that match.
- In Dvoboj, Stipe and Frane do not appear.

Marks and forgeries use `rngFor(seed,'marks',mode,ladderIndex,attempt)`. They go only on cards with no ukras and no forgery (fallback: any such card). They last for the whole match (all its hands) and are removed after it.

### 19.2 Escalation: shop tiers and rule-bending items (replaces §7.1–§7.2)

Match 1 is **plain, classic Trešeta**: a standard deck, no ukrasi anywhere, and the player has only Pogled. Bots have no fore and no marks in matches 1–2 (§19.1.3). From then on, the shop unlocks wilder items with ladder depth.

#### 19.2.1 Tiers and item prices

| Tier | Display rarity pip | Ukrasi (price) | Fore (price) | Other (price) |
|---|---|---|---|---|
| **T1 mild** | common (cream) | `srebreno` 5, `usoljeno` 5, `pijano` 5, `ponocno` 5, `pozlaceno` 7 | `zamjena` 4, `krivi_racun` 4, `namjesteno` 4, `ti_otvaraj` 4 | Veća čašica 8, then 10 (max twice per run) |
| **T2 strong** | uncommon (blue) | `nabruseno` 7, `ljuto` 7, `glasno` 7, `ribarsko` 7 | `tucem` 6, `napij_ga` 6, `vrati` 6, `duplo_ili_nista` 7 | – |
| **T3 rule-bending** | rare (ochre) | `divlje` 9, **`prevrtljivo`** 10 | `trica_iz_rukava` 8, **`briskula`** 9 | **Falsa karta** 12 |

#### 19.2.2 Offer generation (per visit v = 1…5; seeded `rngFor(seed,'shop',mode,v,rerolls)`)

For each of the 3 slots:
1. **Tier roll** by visit:

| Visit | T1 | T2 | T3 |
|---|---|---|---|
| 1 (after match 1) | 100 | 0 | 0 |
| 2 | 60 | 40 | 0 |
| 3 | 30 | 70 | 0 |
| 4 | 15 | 45 | 40 |
| 5 | 10 | 35 | 55 |

2. **Type roll** (only types that have an available item in the rolled tier; renormalise the weights): ukras 50, fora 35, Veća čašica 10 (T1 only; excluded once bought twice), Falsa karta 15 (T3 only).
3. Pick an item uniformly among those of that type and tier that are **not already offered** in this set (and for fore, **not owned**). If none is left, take the next lower tier, then the next higher one.

| Service | Rule |
|---|---|
| **Promišaj** (reroll) | **1** šoldo, then +1 per reroll in the same visit; replaces all 4 offers |
| **Prebaci ukras** (both modes) | **2** šoldi, max 2 per visit: move one of your ukrasi onto a card with no ukras and no forgery (§18.3.3 flow) |
| Jure discount (Partneri) | −1 on every price, min 1 (§18.4.1) |

#### 19.2.3 New rule-bending items

New ids: `UkrasId += 'prevrtljivo'`, `ForaId += 'briskula'`, `Offer.kind += 'falsa'`. They were first drawn procedurally (§19.4.3). **Play-test round 3** gave them painted art from the same pipeline as §13 (`tools/art/prompts.py`): `fore/briskula` (gen `fora_briskula`), `ukrasi/prevrtljivo` (gen `badge_prevrtljivo`, a single wax seal) and `ui/falsa` (gen `shop_falsa`, the Falsa karta shop offer). All three are in the manifest; the procedural drawings in `src/assets/procedural.ts` remain only as fallbacks for missing files.

| Item | Exact effect | Notes |
|---|---|---|
| **`prevrtljivo`**, "Prevrtljivo" (Turncoat), ukras, colour `#C46FA0` | When **its beneficiary side/team plays it as a non-leader**, the card **counts as the led suit**: it is always a legal follow, it satisfies the follow-suit obligation, and it competes for the trick with its own strength. As a lead card it has its printed suit. Under forcedHighest it is legal only if its strength ≥ the highest real card of the led suit in that hand. For the other side it is a plain card. | EN "Played second (or later), it counts as the suit led." HR "Kad ne otvaraš, vrijedi kao tražena boja." |
| **`briskula`**, "Briškula!" (Trump!), fora, cost **2** rakija, `when: 'follow'` | Usable only on your turn when you **cannot follow** the led suit. The card you then play makes its suit **trump for this trick**: any trump card beats every non-trump card; among trump cards the highest effective strength wins (equal → earlier play). Other seats still must follow the led suit if able. Reason key `mustBeVoid` ("Samo kad nemaš traženu boju" / "Only when you can't follow suit"). | Named after briškula, Dalmatia's other card game. Bots: use when void with V ≥ 2 thirds or on the last trick. Dvoboj: play the lowest-val card. Partneri: the lowest-val card if no opponent plays after you, else the highest-strength card. |
| **Falsa karta** (Forgery), shop service offer | Choose a **lišina (4–7) without ukras or forgery** in your deck, then choose a **target identity: any 3, 2 or A of any suit**. The card is permanently forged into a copy of that identity (beneficiary: the player's side/team). The deck stays 40 cards. **Max 4 forged cards per deck.** | Shown as "Falsa karta: 4 bate → 3 kupe" in the deck grid. |

### 19.3 Dvoboj: one shared deck, hidden draws

#### 19.3.1 Deck, deal, mac (replaces §3.2 and §3.3 steps 3–5)

- The table plays **one 40-card deck: the player's run deck** (with Mi ukrasi and forgeries), plus that match's Vi marks and forgeries.
- Shuffle `rngFor(handSeed,'deal')`. Deal **10 to each side** in packets of 5, non-dealer first (non-dealer 5, dealer 5, non-dealer 5, dealer 5). The remaining **20 cards form one shared mac** (face down, index 0 = top).
- After each of tricks 1–10: the **winner draws the top card first, then the loser**. 20 tricks in total; the mac is empty after trick 10.
- Engine shape changes (`rules.ts`):
  - `HandState.mac: CardInst[]` is shared; `SideState.mac` and `SideState.rest` are removed.
  - Every card's uid = `p:<slot>` (the card's original suit_rank, unique).
  - `CardInst.owner` now means the **current holder** (set on deal and draw). Code must not derive the holder from the uid prefix; `ownerOf`/`parseUid` are not used for that.
  - `DeckCard`/`CardInst` gain `slot: string`, `ukrasSide?: Side` (Partneri: `ukrasTeam`) and `forge?: { suit; rank; side }` (Partneri: `team`).
- Ribarsko (Dvoboj keeps its §5 effect) and Namješteno look at the **top of the shared mac**. A Ribarsko card that isn't chosen goes to the **bottom** of the shared mac. Zamjena puts your card on the bottom of the shared mac and draws the top one.

#### 19.3.2 Hidden draws and knowledge (replaces §3.9, §8.2 `pHas`, §8.3)

| Item | Rule |
|---|---|
| Draw visibility | A drawn card is **seen only by its drawer**. The engine still emits `cardDrawn { side, uid }`, but the UI renders a bot draw face down, and `botMemory.observe` **ignores** the player's `cardDrawn` uid. |
| `knownByOpp` | Filled **only** by reveals: akuža combination cards, Pogled, Vrati! return, Ribarsko (Partneri). Draws (including Zamjena and Ribarsko picks) never add to it. |
| `voidKnown` | Set when a side fails to follow. **Cleared for that side whenever it draws** (the hidden card might be of that suit). From trick 11 on (mac empty) voids are exact. |
| Bot `unseen` | 40-card deck − own hand − remembered played cards − known opponent cards. Each unseen card is either in the opponent's hand or in the mac. |
| Bot `pHas(x)` | 0 if the opponent is void in x.suit; otherwise `handUnknown / (handUnknown + mac.length)`, where handUnknown = opponent hand size − known. Once the mac is empty this is exact (= 1 for every unseen card), so PIMC endgames are perfect information again. |
| Bot memory knob | Applies to played cards only (there are no draw reveals left to remember). |
| Fairness test | Across 300 seeded hands, the BotView never contains a uid that the player drew unless it was revealed by an effect. |

#### 19.3.3 Ukrasi and fore in Dvoboj (team rules)

Dvoboj ukrasi follow **§18.3.1 with "T seat" read as "side T"**: player side = `mi`, bot side = `vi`. Exceptions:
- `ribarsko` keeps the §5 effect (choose 1 of the top 2 of the shared mac) when the beneficiary side wins a trick with it.
- `ljuto` forces "the opponent" (one seat).
- `pijano` and `srebreno` are Mi only.

Fore keep §6.3 with these changes:

| Fora | Dvoboj change |
|---|---|
| `zamjena` | The card goes to the bottom of the shared mac; the top card is drawn **hidden** from the bot. |
| `namjesteno` | Reorders the top 3 of the **shared** mac. This changes what both sides draw; the bot doesn't see the order. |
| `pogled` | Unchanged, and now the only way to see the bot's hand. |
| `briskula`, Prevrtljivo, Falsa karta | As §19.2.3. |

Akuže are still announced (at the deal and after each draw) and reveal **only the declared cards**.

#### 19.3.4 Scene and animation (Dvoboj; replaces the §10.5 mac/reveal rows and A16–A19, A22)

| Element | Spec |
|---|---|
| Shared mac | (3.3, 0, 0.3), yaw −8°, face down, card k at y = 0.004·k; chip "Mac 14" |
| Deck stack (deal source) | in front of the dealer: player (2.4, 0, 2.8) · bot (−2.4, 0, −1.8) |
| Piles | unchanged (player (6.4, 0, 3.0), bot (−6.4, 0, −2.6)) |
| Card backs | all `back_player` (one deck); `back_bot.png` is no longer used |
| Deal (A21) | from the dealer stack in packets of 5 as §19.3.1; flight 280 ms, stagger 60 ms, 250 ms between packets; then the remaining 20 slide to the mac (300 ms) |
| Draw: player | mac → the player's fan slot, 420 ms `power2.inOut`. It flips face up during the last 40% (only the player sees it). No reveal hold. sfx `card_slide` |
| Draw: bot | mac → the bot fan, **face down**, 380 ms `power2.inOut`. sfx `card_slide` |
| Draw choreography | the winner's draw starts; the loser's starts 200 ms later (≈ 620 ms in total); then the akuža check (A23 if any) |
| Reveal points | unused |

### 19.4 Forgeries, identity and duplicates

#### 19.4.1 Identity

A card's **identity** (suit, rank) is computed for whoever holds or plays it: `ident(card, holderSide|Team)` = `forge` if `forge.side/team === holder's side/team`, else the printed (slot) identity. Legality, strength, thirds, akuže, Prevrtljivo and Briškula all use `ident()`. A card's identity is **fixed at the moment it is played**.

Consequences:
- Your forged 4 of bate (a copy of the 3 of kupe) is a 3 of kupe in your hand and your partner's, but a plain 4 of bate if the bot draws it or an opponent is dealt it.
- Vi forgeries work the same way in reverse.

#### 19.4.2 Duplicates and ties (replaces §3.5 step 1 and §18.1 "Ties")

- With one deck, duplicate identities exist **only** through forgeries. Equal effective strength also arises from Trica iz rukava vs a 3, or Nabrušeno combinations.
- **Rule (both modes): among cards eligible to win (the led suit, or trump under Briškula), the highest effective strength wins; if several share it, the one played earliest wins.**
- **Akuže with duplicates:** a napolitana needs A, 2 and 3 of one suit; three/four of a kind need **distinct suits**. A duplicate identity never adds a combination or upgrades one; it can only stand in for a missing card. Example: forged 3 of kupe + real 3 of bate + real 3 of špade = three 3s (3 points), but two 3s of kupe + a 3 of bate is not.
- Points: a forged card scores its copy's thirds when played by its beneficiary (a forged 3 = 1 bela; a forged A = 3 thirds). Per-hand totals can therefore exceed 11. That is intended.

#### 19.4.3 Display (no new image generation)

| Case | Rendering (composited on the card canvas texture, §10.4) |
|---|---|
| Your forgery, in your hand / played by your side | Face of the **copy** identity + a diagonal stamp band "FALSA" (Alegreya bold 54 px, `#C0392B` at 75% alpha, rotated −20°, centred at (240, 560)) + a 4 px dashed `#C0392B` inner border |
| Your forgery, held or played by the other side | The **printed** face + a small ochre "F" tag (28 px circle, top-left under the index block) so you can track it |
| Vi forgery, played by Vi | Copy face + the same FALSA stamp, with the band in `#7A1F14` and "VI" appended |
| Vi forgery, in your hand | Printed face + a red dashed border + a small red "F" tag |
| `prevrtljivo` badge | Painted `ukrasi/prevrtljivo` (mauve wax seal with a chameleon). Fallback: circle r 56 filled `#C46FA0`, 4 px darker rim, glyph "⇄" white, 64 px |
| `briskula` fora art | Painted `fore/briskula`. Fallback: vertical gradient `#2F5D7C` → `#2A1A10`, with the 4 suit icons (`cards/suits/*.png`) in a diamond (each 120 px) and "BRIŠKULA!" in cream, Alegreya 48 |
| Falsa karta shop offer | A cream card with a lišina mini face → arrow → "?" (strong) mini face, plus the stamp band |
| Deck grid and tracker | Forged cards show the copy face with the stamp; tooltip "4 bate → 3 kupe" |

### 19.5 UI changes

#### 19.5.1 Viđeno strip and the played-cards tracker (replaces §12.2 Viđeno)

- **Viđeno** (per opponent; partner strip in Partneri): shows **only cards revealed by effects** (Pogled, akuža reveals, Vrati!, Ribarsko-Partneri, Ive's perk, Namješteno/Zamjena for the partner). Cards leave the strip when played.
- **Odigrano tracker** (new, both modes): a collapsible panel on the right edge, opened with the "Odigrano" button (bottom-right) or the key `T`. Default: collapsed.

| Layout | Cell states |
|---|---|
| 4 rows (kupe, bate, špade, dinari) × 10 columns in rank order 3 2 A K C F 7 6 5 4; mini faces 26×42; panel 300×200. Cells are the deck's 40 slots placed by **printed** identity; a forged slot shows its copy face with a mini stamp. | **played**: 35% opacity (Partneri: plus a 6 px dot in the team colour of the seat that played it) · **in your hand**: ochre outline · **revealed in another hand**: red outline · **unknown**: normal |

#### 19.5.2 Between-hands summary and match-end screen (replaces §12.4 and §12.5)

**Between hands (light, replaces A30):** a compact 520×300 panel slides in from the top (300 ms `power3.out`):

| Row | Ti / Mi | Bot / Vi |
|---|---|---|
| Ova ruka (this hand: cards + ultima + ukrasi + akuže) | 7 | 6 |
| Partija (match score) / 11 | 7 | 6 |

- One small line under the table: "Karte 5 · Ultima 1 · Ukrasi 1 · Akuže 0" for each side, plus the rounding note.
- The panel **auto-continues after 3500 ms** (or on click / Space) and the next deal starts.

**Match end** (after the hand in which the match is decided, 400 ms `power3.out`):
- Title "POBIJEDIO SI!" / "IZGUBIO SI..." (A31/A32).
- The final score ("**12 : 9**").
- A per-hand table with one row per hand played (columns Karte, Ultima, Ukrasi, Akuže, Ukupno for each side) and the last hand highlighted.
- The rounding note, or Krivi račun.
- On a win, the reward line "Pobjeda +10 · Razlika +3 · Akuže +3 = 16 šoldi".
- Buttons: win → **U butigu** (match 6: **Dalje** to the run end); loss → **Revanš (n/2)** if a token is left, else **Kraj**.

#### 19.5.3 Map (replaces the §12.3 node list)

11 nodes (K = konoba, B = butiga) at (x%, y%):

| K1 | B1 | K2 | B2 | K3 | B3 | K4 | B4 | K5 | B5 | K6 |
|---|---|---|---|---|---|---|---|---|---|---|
| (10, 80) | (19, 69) | (28, 61) | (38, 55) | (48, 50) | (57, 44) | (65, 38) | (73, 31) | (80, 25) | (86, 19) | (91, 12) |

- Konoba nodes show the opponent portrait (Partneri: two mini portraits). K6 is the boss: a 1.25× node with an ochre laurel ring.
- Butiga nodes show a tier pip for the best tier they can roll (B1 cream, B2–B3 blue, B4–B5 ochre).
- Revanš tokens are shown under the token as chalk marks.

The intro panel adds "Falsifikati: n" (forgeries) next to "Šarane karte".

### 19.6 Voice changes

| Item | Change |
|---|---|
| Hand-end events (`hand_end_bot_win`, `hand_end_bot_lose`, `big_swing`; Partneri `partner_hand_win`) | **Still fire at the end of each hand that does not end the match.** At the end of the deciding hand, only the match events fire. |
| `match_bot_lose` | If the player's final margin ≥ 6, use the `big_swing` pool (`jebem_ti_mliko`, `grom_te_spanija`, `vrag_ti_sricu`). |
| Caps | Per hand, as before (Dvoboj 8; Partneri 9 total / 4 per speaker). |
| `bot_bad_draw` (Dvoboj) | Still fires from the bot's own hidden draw (same condition, p 0.25, cooldown 15 s). The bubble only shows the line; **the card is not revealed or highlighted**. |
| Forgery and Briškula moments | When a Vi forgery or Briškula wins a trick: the opponent speaks `aha_sta_je_sad` / `evo_ti_ga_na` (event `bot_play_strong`, p 1.0, cooldown 10 s). When the player's forgery or Briškula wins: `player_great` (p 0.8), and in Partneri also `partner_player_great`. **Only the existing 34 line ids are used.** |

### 19.7 Aces have no corner index

The art agent is regenerating the 4 ace faces as special cards with a large ornamented suit symbol and **no index**. Code changes:
- `src/game/cards.ts`: `RANK_INDEX.A = ''`.
- `src/render/placeholders.ts`: skip the corner numeral when the index is empty (keep the small corner suit icon) and draw the big ornamented suit.
- `src/ui/menus.ts`: the how-to rank-strip caption for A becomes "As" / "Ace" instead of "1".

§3.1's "Corner index" for A and §13.5 step 2 for aces are superseded.

### 19.8 Saves (replaces the §16.6 / §18.9 key table)

| Key | Content |
|---|---|
| `treseta.save.v2` | Dvoboj `RunState` (version 2) |
| `treseta.save.partneri.v2` | Partneri `RunState4` (version 2) |
| `treseta.stats.v1`, `treseta.stats.partneri.v1` | unchanged; `bestLadder` is now 1–6 (clamp older values) |
| `treseta.settings.v1` | unchanged, plus `trackerOpen: boolean` |

Version-2 run state:
- `ladderIndex` 0–5, `revans` 0–2, `rakijaBase` 2–4, `casicaBought` 0–2, `deck` always 40 `DeckCard` with `slot` / `ukras` / `forge`;
- `shop.moves` (Prebaci) in both modes, with no removal counter;
- `match` = `{ attempt, scores, handNo, dealer, akuzaPoints }` (Partneri: team scores and the `Seat` dealer), saved at every hand end. A mid-hand reload replays the interrupted hand from its seed.

On startup, delete `treseta.save.v1` and `treseta.save.partneri.v1` if present, and toast once: "Stara spremljena igra je obrisana (nova verzija)." / "Old save removed (new version)."

### 19.9 Vitest changes

| File | Add / change |
|---|---|
| `rules.test.ts` (Dvoboj, rewritten) | one 40-card deck; deal 10 + 10 in packets of 5 (non-dealer first); a shared mac of 20; the winner draws first; 20 tricks and **every card played once**; uids are `p:<slot>` and `owner` = holder; **draws never add to `knownByOpp`**; voids cleared on each draw and exact from trick 11; Ribarsko, Zamjena and Namješteno act on the shared mac |
| `ukrasi.test.ts` (Dvoboj) | the §18.3.1 team rules with sides (Mi card held by the bot is inert; Pozlaćeno/Srebreno pay when the card ends in the beneficiary's pile; Vi marks) |
| `forge.test.ts` (new) | `ident()` per holder (a Mi forgery held by Vi plays as its printed card); **equal effective strength → the earlier play wins** (forged 3 vs real 3, Trica vs 3); akuže never count a duplicate identity (napolitana / distinct-suit rule); forged thirds count; Falsa only on a lišina without ukras/forgery, max 4, deck stays 40; Vi forgeries are temporary for the match |
| `items3.test.ts` (new) | Prevrtljivo: legal as a follow, satisfies the follow-suit obligation, wins by strength, printed suit when leading, the forcedHighest restriction, inert for the other side; Briškula!: only when void (`mustBeVoid`), trump beats non-trump, highest trump wins, ties go to the earlier play, works in both modes |
| `match.test.ts` / `match4.test.ts` | target 11, checked only at hand end; the higher score wins once someone has ≥ 11; **an exact tie at ≥ 11 plays another hand**; nobody at 11 → next hand; dealer rotation within a match and the per-match first dealer; Revanš restarts 0:0 with the same first dealer |
| `run.test.ts` / `run4.test.ts` | 6 matches with shops after 1–5; the starting kit (Pogled only, rakija 2, 6 šoldi, plain 40-card deck); reward = base + min(6, margin) + akuže; 2 Revanš tokens; Veća čašica twice (8, then 10) raising the base to 4; Prebaci 2 šoldi ×2 per visit; reroll 1, +1 each; **tier weights per visit** (no T2 in visit 1, no T3 before visit 4); Falsa offered only from T3; no fora already owned; per-match bot fore, marks and forgeries exactly per the §19.1.3 tables; matches 1–2 plain |
| `characters.test.ts` (update) | over the 6-match Partneri ladder: 3 distinct bot personas at every table for every valid partner, exactly 2 unlocked candidates per match on the winning path |
| `bot.test.ts` (Dvoboj, update) | the BotView never contains a uid the player drew unless it was revealed (300 seeded hands); `pHas` = handUnknown / (handUnknown + mac) and 1 once the mac is empty; only legal plays with forgeries, Prevrtljivo and Briškula present |
| `voice.test.ts` (update) | `bot_bad_draw` emits no card highlight or reveal; at the deciding hand only match events fire; forgery and Briškula triggers use only the 34 existing ids |
| `save.test.ts` (update) | v2 keys per mode; v1 keys deleted on startup; resume replays the interrupted hand from the saved hand-end state |
| `cards.test.ts` (new) | `RANK_INDEX.A === ''`; the other indices unchanged |
| `manifest.test.ts` (update) | 11 ukrasi, 11 fore and 5 ui images (`ui/falsa`); every ukras and fora id has its image in the manifest |

### 19.10 Revision 2 acceptance checklist

- [ ] Matches are **first to 11** in both modes, checked at hand end. An exact tie at ≥ 11 plays another hand. A light between-hands panel auto-continues after 3.5 s. The match-end screen shows the per-hand breakdown and the reward.
- [ ] The run has **6 matches** (boss at 6), a shop after matches 1–5 and **2 Revanš tokens**; a run takes about 30–40 min.
- [ ] **Match 1 is plain Trešeta:** no ukrasi in the deck, the player has only Pogled, and the bots have no fore, marks or forgeries in matches 1–2.
- [ ] Shop tiers unlock as in §19.2.2. T3 offers Divlje, Prevrtljivo, Trica iz rukava, Briškula! and **Falsa karta**. The prices, reroll and Prebaci ukras (both modes) are exact. "Izbaci kartu" no longer exists.
- [ ] **Dvoboj plays one shared 40-card deck** with a 20-card shared mac (winner draws first) and uses `back_player` for every card. No card ever appears twice except through forgeries.
- [ ] **Draws are hidden:** the player never sees the bot's draws and the bot never learns the player's. Viđeno shows only effect reveals; the Odigrano tracker works (key `T`).
- [ ] Ukrasi follow the team rules in both modes. Vi marks and forgeries are shown, work only for Vi, and are cleared after the match.
- [ ] Forged duplicates resolve with **"equal strength → the earlier play wins"**, are stamped "FALSA" (procedural, no new images), and never create akuže from duplicate identities. The deck stays at exactly 40 cards.
- [ ] Prevrtljivo and Briškula! behave per §19.2.3, with painted badge and art (procedural fallback).
- [ ] Late bots get wilder per the §19.1.3 tables. The boss pair (Bepo + Frane) / boss Bepo uses Briškula, forgeries and 4 marks.
- [ ] Partneri keeps the partner pick and **3 distinct bot voices per table** on the 6-match ladder.
- [ ] Aces have no corner index (`RANK_INDEX.A = ''`; the placeholder and the how-to strip are updated).
- [ ] v2 saves per mode; v1 saves removed with a one-time toast; resume works at hand boundaries.
- [ ] All §19.9 tests pass, and the §17 and §18.12 items still pass where §19 doesn't override them.

---

## §20 Revision 3: signals as played in Croatia

Overrides the signal table in §18 (and any later references to Volo).

- Croatian trešeta uses **two** partner signs (hr.wikipedia "Trešeta", *Pravila igre*): **Tučem** and **Strišo**. Volo comes from Italian tressette and is **removed**.
- **Tučem** means **"throw your strongest card of this suit, and lead the suit back to me"**.
  - **Legal on any lead**, like Strišo: a claim, not a checked fact. It can go on a low card: holding the A and 2, you lead a lišina with Tučem to find the partner's 3; the partner takes it with the 3 and returns the suit to your 2 and A.
  - **The partner's answer.** Following suit, play the strongest card of the suit. Void, load points only if the leader's card already holds the trick (`partnerWinsSafe`), else a plain discard. Then, on the next lead, return the suit (lead step 1: a master of it, else the lowest card).
  - **Bot leaders** give Tučem only with two of the 3, 2 and A of the suit (`Eval4.tucemWorthy`), and either the led card wins by itself (`isMaster`: the partner's strongest card is then points for us) or it is a low card **seeking the 3** (`Eval4.seeks3`: the bot holds the 2 and A but not the 3, the 3 is not known with an opponent or known played, and the partner is not void there). Lead step 3c leads the lowest such card with Tučem, with probability `signalUse`, before trick 9. Lead steps that pick a card for its signal (3b, 3c) attach it directly (`Eval4.leadSignal`).
  - **Toasts.** When the partner bot leads Tučem, the player gets a hint ("Play your strongest card of this suit, then lead it back"). When the player then leads the next trick holding that suit, a reminder says "lead {suit} back to me".
- **Strišo** means **"this is my last card of this suit, and it wins"**. This is how the game's Dalmatian players use it. (hr.wikipedia gives other meanings for strišo: "which suit should I return?", "I'll come to your suit", "don't take my card". The game uses the players' local meaning.)
  - **Legal on any lead.** Strišo is a claim, not a checked fact, as at a real table: the engine never checks that the card is the leader's last of the suit or that it wins. Counting is the caller's job, and a wrong count costs the team (the partner loads points onto a trick that may be lost). The typical case: everyone is out of dinari, and you still hold one.
  - It sets **no void**: the claim may be false, and the engine must not confirm it.
  - **The partner's answer.** The partner takes the claim on trust: the trick is ours, so they either give points or ask for a suit:
    - If the partner follows suit, they play their most valuable card of the suit.
    - If the partner is void and holds a point card they can spare (a non-master A first, then other non-master point cards), they **load it** (`strisoReply` kind `points`).
    - With nothing to give, the partner throws a **lišina (4–7) of the suit they want led next**. This is an **ask** (`strisoReply` kind `ask`, stored in `Hand4State.asks`). A lišina thrown while following suit asks for nothing.
  - **Answering an ask.** The ask stays open until the Strišo leader next leads. A bot leader then leads its lowest card of the asked suit, unless the asker is known to be void there; that is lead step 0, ahead of the Tučem return. For the player, a toast repeats the ask on their lead.
  - **Bot leaders** call Strišo only when their **own count** says the card wins (`Eval4.strisoWorthy`): it is their last card of the suit, and no card they can't account for outranks it (`isMaster` over `unseen` and known cards, so a forgetful bot holds back when a stronger card might still be out). At lead step 3b such a card is led with probability `signalUse`, highest value first, never on trick 10; `chooseSignal4` applies the same check. A bot follower replies through `strisoReply`, gated by `readSignals`. The bot asks for its best suit: one where it holds a master, else its highest top card, and that keeps a card after the throw.
  - **Toasts.** When the partner bot leads Strišo, the player gets a hint toast ("Give points, or throw a low card of the suit you want led"). Toasts also cover the partner giving points, and any ask (the player's own asks and the opponents' asks).
- The last-trick point keeps the name **ultima**: hr.wikipedia uses "posljednji punat (ȕltima)", won by whoever takes the last trick (*zadnja ruka*).
- HUD: two signal buttons, both lit on every lead. Strišo uses the card-slide sound and the wave icon, and has no voice line.

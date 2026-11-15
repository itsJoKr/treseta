"""Prompt table for the 41 generations of GAME_DESIGN.md section 13.2 / 13.3.

Each entry: gen_id -> (width, height, cutout, prompt_without_prefix, prefix_kind)
prefix_kind is 'card' (STYLE_CARD) or 'scene' (STYLE_SCENE). Cut-out prompts get
the CUTOUT suffix appended.
"""

STYLE_CARD = (
    "Hand-painted gouache and ink illustration in the style of an antique 19th-century "
    "Triestine/Venetian Italian playing card, woodcut-coloured print look: bold confident "
    "dark-brown ink outlines, flat areas of warm colour with subtle brush texture and aged "
    "paper grain, limited palette of terracotta red #B5452B, ochre gold #D9A441, olive green "
    "#6B7A3A, Adriatic blue #2F5D7C, cream parchment #F3E6C8 and deep brown ink #3A2618. "
    "No religious symbols, no crosses, no halos. Absolutely no text, letters, numbers or watermark."
)

STYLE_SCENE = (
    "Warm painterly illustration with gouache and oil texture, Mediterranean Dalmatian "
    "atmosphere, oil-lamp and dusk lighting, palette of terracotta, ochre, olive, Adriatic "
    "blue, cream and deep brown, soft edges, cosy and slightly humorous, matching an antique "
    "Italian playing-card aesthetic. No religious symbols. Absolutely no text, letters, signs "
    "or watermark."
)

CUTOUT = (
    "Single subject isolated on a plain flat light-grey (#DDDDDD) background, generous empty "
    "margin on all sides, no cast shadow, no other objects."
)

COURT_TEMPLATE = (
    "Court-card figure for an antique Triestine-style Italian playing card: {SPEC}. Shown from "
    "the knees up (the knight: horse and rider complete), centred, three-quarter view, against "
    "a plain cream parchment background with a faint arched niche; the figure fills about 85% "
    "of the image height and the head is not cropped. Costume in 18th-century Venetian-Dalmatian "
    "style; crowns and hats carry no cross or religious symbol. Dominant colours: {COLOURS}."
)

COURTS = {
    "court_kupe_k": ("Kralj kupe, the King of Cups: a jovial red-bearded king in a simple gold crown, raising a large golden goblet as if making a toast", "terracotta red and ochre gold"),
    "court_kupe_c": ("Konj kupe, the Knight of Cups: a young rider on a sturdy chestnut horse, holding a golden goblet high in one hand", "terracotta red and ochre gold"),
    "court_kupe_f": ("Fanat kupe, the Knave of Cups: a cheerful young page in a small red Dalmatian cap, carrying a golden goblet carefully in both hands", "terracotta red and ochre gold"),
    "court_bate_k": ("Kralj bate, the King of Clubs: a stern grey-bearded king resting a big knobbly wooden club on his shoulder", "olive green and ochre"),
    "court_bate_c": ("Konj bate, the Knight of Clubs: a rider on a dappled grey horse carrying a knobbly wooden club upright", "olive green and ochre"),
    "court_bate_f": ("Fanat bate, the Knave of Clubs: a cheeky young page with a crooked grin, leaning on a knobbly wooden club", "olive green and ochre"),
    "court_spade_k": ("Kralj špade, the King of Swords: a proud dark-bearded king holding a straight sword upright in front of him with both hands on the hilt", "Adriatic blue and steel grey with ochre trim"),
    "court_spade_c": ("Konj špade, the Knight of Swords: a rider on a black horse with a straight sword raised", "Adriatic blue and steel grey with ochre trim"),
    "court_spade_f": ("Fanat špade, the Knave of Swords: an alert young guard holding a straight sword lowered at his side", "Adriatic blue and steel grey with ochre trim"),
    "court_dinari_k": ("Kralj dinari, the King of Coins: a plump smiling king holding a big gold coin against his chest", "ochre gold and terracotta"),
    "court_dinari_c": ("Konj dinari, the Knight of Coins: a rider on a white horse holding a large gold coin like a small shield", "ochre gold and terracotta"),
    "court_dinari_f": ("Fanat dinari, the Knave of Coins: a young page holding up a gold coin and admiring it with wide eyes", "ochre gold and terracotta"),
}

ACE_OPEN = ("The single central emblem of the ace of {SUIT} of an antique Triestine Italian playing card, "
            "painted as a stand-alone ornament (no card, no frame, no background scenery): ")
ACE_CLOSE = ("Everything forms one connected, mirror-symmetric ornament, perfectly frontal and upright, centred, "
             "filling about 85% of the image height. No text, no numbers, no letters, no crown.")

SAME_FRAMING = "Character portrait, chest up, facing the viewer, background a softly blurred stone konoba wall: "

GENS = {
    "card_frame": (1024, 1536, False, "card",
        "Front face of an antique Italian playing card, completely flat and front-on, the card fills the entire image edge to edge with no table, no perspective, no shadow. Warm cream parchment with faint paper grain, a thin double border inset about 3% from the edges in terracotta red and ochre gold, tiny symmetrical olive-leaf flourishes just inside the four corners, and a large completely empty plain centre covering 85% of the card. No symbols, no figures."),
    "suit_kupe": (1024, 1024, True, "card",
        "A single Italian playing-card suit symbol for \"coppe\" (cups): an ornate golden wine goblet with a wide bowl, a terracotta-red band and a short stem on a round foot, perfectly frontal and upright, centred, filling 80% of the frame."),
    "suit_bate": (1024, 1024, True, "card",
        "A single Italian playing-card suit symbol for \"bastoni\" (clubs): a knobbly warm-brown wooden cudgel with small olive-green leaf buds sprouting from the knots, perfectly vertical with the thick end up, centred, filling 85% of the frame height."),
    "suit_spade": (1024, 1024, True, "card",
        "A single Italian playing-card suit symbol for \"spade\" (swords): a straight double-edged sword with an Adriatic-blue steel blade, a simple ochre-gold crossguard and a round pommel, perfectly vertical with the point up, centred, filling 85% of the frame height."),
    "suit_dinari": (1024, 1024, True, "card",
        "A single Italian playing-card suit symbol for \"denari\" (coins): one round gold coin with a raised rim and a stylised eight-petal flower in the centre with a small terracotta-red dot, frontal, centred, filling 80% of the frame."),
    "card_back": (1024, 1536, False, "card",
        "The back of a playing card filling the entire image edge to edge, flat and front-on: a perfectly symmetric ornamental pattern in terracotta red, ochre and cream; a central oval medallion containing a small rakija shot glass and a sprig of olive, surrounded by a fine lattice of diamond and wave motifs inspired by Dalmatian stone carving and lace; thin cream border; symmetric vertically and horizontally."),
    "ukrasi_sheet_a": (1536, 1024, True, "card",
        "Five round wax-seal medallion icons in a single horizontal row, evenly spaced with wide empty gaps, all the same size (each about 230 px across), flat frontal view, each seal a different colour with an embossed symbol, left to right: (1) gold seal with a gilded laurel leaf and a sparkle, (2) silver seal with a small coin, (3) steel-blue seal with a whetstone and a knife blade, (4) chilli-red seal with a hot red pepper, (5) white-cream seal with a small salt cellar and salt crystals."),
    "ukrasi_sheet_b": (1536, 1024, True, "card",
        "Five round wax-seal medallion icons in a single horizontal row, evenly spaced with wide empty gaps, all the same size (each about 230 px across), flat frontal view, each seal a different colour with an embossed symbol, left to right: (1) herb-green seal with a small tipped rakija bottle, (2) violet seal with a wild boar's head in profile, (3) orange seal with a brass horn, (4) midnight-blue seal with a crescent moon over waves, (5) sea-teal seal with a fishing net and a small fish."),
    "fora_pogled": (1024, 1536, False, "card",
        "Small vignette scene: an old card player's single sly eye peeking over the top edge of a fan of face-down playing cards, warm oil-lamp light, dark tavern background."),
    "fora_zamjena": (1024, 1536, False, "card",
        "Vignette: close-up of a hand sliding one playing card under a face-down deck on a wooden table while another card slips off the top, little swish lines."),
    "fora_namjesteno": (1024, 1536, False, "card",
        "Vignette: nimble fingers secretly arranging three face-down playing cards on top of a deck, a candle flame nearby, conspiratorial mood."),
    "fora_krivi_racun": (1024, 1536, False, "card",
        "Vignette: a crumpled tavern bill covered only in illegible scribbles and tally strokes (no readable letters or digits), a stubby pencil and a few brass coins on a wooden table."),
    "fora_ti_otvaraj": (1024, 1536, False, "card",
        "Vignette: a polite open hand gesturing \"after you\" across a wooden tavern table toward the viewer, the other hand holding a fan of cards."),
    "fora_tucem": (1024, 1536, False, "card",
        "Vignette: a weathered fist knocking hard on a thick wooden tavern table, small shot glasses and playing cards jumping from the impact, motion lines."),
    "fora_napij_ga": (1024, 1536, False, "card",
        "Vignette: a hand pouring clear golden rakija from a small bottle into an already overflowing shot glass, splashes, cheeky mood."),
    "fora_vrati": (1024, 1536, False, "card",
        "Vignette: a hand firmly pushing a single face-up playing card back across a wooden table toward the far side, the other hand raised in a \"stop\" gesture."),
    "fora_trica_iz_rukava": (1024, 1536, False, "card",
        "Vignette: a playing card showing three small golden cups sliding out of the cuff of a white linen shirt sleeve, sly dramatic light."),
    "fora_duplo_ili_nista": (1024, 1536, False, "card",
        "Vignette: two identical playing cards fanned side by side glowing with golden light above a small pile of brass coins, dramatic warm light."),
    "portrait_tonci": (1024, 1024, False, "scene",
        SAME_FRAMING + "Mali Tonči, a cheeky 22-year-old Dalmatian guy, deeply tanned, curly black hair with sunglasses pushed up on his head, half-unbuttoned white linen shirt, a thin gold chain, a toothpick in his sly grin, holding playing cards close to his chest."),
    "portrait_jure": (1024, 1024, False, "scene",
        SAME_FRAMING + "Gazda Jure, a big loud 55-year-old Dalmatian tavern owner, round belly, thick black moustache, red cheeks, striped shirt with rolled sleeves under a stained apron, a kitchen towel over one shoulder, laughing with his mouth open, wine barrels behind him."),
    "portrait_luka": (1024, 1024, False, "scene",
        SAME_FRAMING + "Barba Luka, a 72-year-old Dalmatian fisherman, weathered sunburnt face with deep wrinkles and white stubble, navy knitted fisherman's cap, thick cream wool sweater, squinting suspiciously over his cards, a coil of fishing net behind him."),
    "portrait_bepo": (1024, 1024, False, "scene",
        SAME_FRAMING + "Did Bepo, an 85-year-old island card champion, bald with a magnificent white moustache, a small flat red cap, a black traditional Dalmatian vest over a white shirt, calm mischievous half-smile, a tiny glass of rakija in front of him."),
    # Ace centrepieces (play-test request after section 13): in a Triestine deck the
    # ace carries one large ornate suit emblem instead of a pip. The motifs and
    # colours follow the suit_* icons so the deck stays coherent.
    "ace_kupe": (1024, 1536, True, "card", ACE_OPEN.format(SUIT="cups (asso di coppe)") +
        "one large, richly ornamented gilded chalice: a tall golden goblet with a wide flared bowl decorated with a terracotta-red band of golden scrolls and a lower band of olive-green and Adriatic-blue acanthus leaves, a knopped stem with a fluted terracotta knot and a broad round foot. Around it, symmetrical golden scrollwork with terracotta accents, two small olive-leaf garlands with a flowing terracotta ribbon, and a few small flourishes and dots. " + ACE_CLOSE),
    "ace_bate": (1024, 1536, True, "card", ACE_OPEN.format(SUIT="clubs (asso di bastoni)") +
        "one large carved wooden club standing perfectly vertical with the thick knobbly end up: warm-brown wood with carved knots and small olive-green leaf buds sprouting from them, wrapped by a spiralling terracotta-red ribbon and a twining olive branch with a few olives. Around it, symmetrical golden scrollwork flourishes on both sides and a few small dots. " + ACE_CLOSE),
    "ace_spade": (1024, 1536, True, "card", ACE_OPEN.format(SUIT="swords (asso di spade)") +
        "one large ornate straight double-edged sword standing perfectly vertical with the point up: an Adriatic-blue steel blade with a central fuller, an elaborate ochre-gold crossguard whose ends curl into scrolls, a grip wrapped in terracotta and olive stripes, and a round gold pommel. Behind and around it, symmetrical golden scrollwork, an olive-leaf garland curving behind the blade and a flowing terracotta ribbon, plus a few small flourishes. " + ACE_CLOSE),
    "ace_dinari": (1024, 1536, True, "card", ACE_OPEN.format(SUIT="coins (asso di denari)") +
        "one large decorated gold medallion coin: a broad raised gold rim with a ring of small beads, an inner ring of cream and Adriatic-blue wave scrolls, and in the centre a stylised eight-petal golden flower with a terracotta-red centre dot. The medallion is framed by a symmetrical wreath of olive branches tied with a terracotta ribbon below, with golden scrollwork flourishes above and below it. " + ACE_CLOSE),
    # Partneri (2v2) characters, GAME_DESIGN.md section 18.4.5 (same framing as rows 31-34)
    "portrait_dino": (1024, 1024, False, "scene",
        SAME_FRAMING + "Dino \"Galeb\", a 26-year-old Dalmatian summer charmer, slicked-back dark hair, deep tan, a tight white T-shirt, a seashell necklace and a flashy watch, one eyebrow raised in a confident smirk, holding a fan of cards casually in one hand."),
    "portrait_stipe": (1024, 1024, False, "scene",
        SAME_FRAMING + "Stipe Kamenar, a broad-shouldered 45-year-old stonemason from the island of Brač, square jaw and stubble, dusty muscular forearms, a sleeveless grey work vest dusted with white limestone, a carpenter's pencil behind one ear, a heavy hand pressing a card onto the table."),
    "portrait_ive": (1024, 1024, False, "scene",
        SAME_FRAMING + "Ive Poštar, a skinny 58-year-old village postman, thin grey moustache, round glasses on the tip of his nose, a faded blue postman's cap and shirt, a leather mail-satchel strap across his chest, leaning in with a nosy, knowing look."),
    "portrait_frane": (1024, 1024, False, "scene",
        SAME_FRAMING + "Kapetan Frane, a pompous 65-year-old retired merchant-ship captain, neat white beard, a navy captain's cap with a plain gold anchor emblem (no lettering), a double-breasted navy jacket with brass buttons, chin raised proudly, a small glass of rakija in his hand."),
    "env_table": (1536, 1024, False, "scene",
        "Top-down orthographic view of the surface of a thick old tavern table made of wide oak planks running left to right, scratches and knife marks, a faint wine-ring stain near one corner, warm lamplight pooling in the centre with darker edges, nothing on the table, no perspective."),
    "env_bg_konoba": (1536, 1024, False, "scene",
        "Interior of a cosy stone Dalmatian konoba at dusk, eye-level view toward the back wall: rough limestone walls, dark wooden ceiling beams, wine barrels, a hanging pršut ham and garlic braids, an old fishing net and an oil lamp on the wall; in the upper centre an arched window shows the Adriatic sea and islands at sunset under a pink-orange sky; the lower third of the image is a darker, plainer floor area (it will be hidden behind the table); no people."),
    "env_bg_map": (1536, 1024, False, "scene",
        "Illustrated painterly map of a Dalmatian coastline seen from above: turquoise Adriatic sea with small islands along the right side, rocky coast with olive groves, vineyards and little stone villages, a winding pale stone road from the lower left to the upper right, a compass rose drawn without letters, aged parchment border."),
    "env_bg_shop": (1536, 1024, False, "scene",
        "Interior of a small old Dalmatian village shop (\"butiga\"): a long wooden counter across the lower part, shelves behind with rakija bottles, olive-oil tins, jars of dried figs, packs of playing cards and a brass scale, a small bell above the door, warm afternoon light; the middle of the counter is clear and empty; no people."),
    "ui_coin": (1024, 1024, True, "card",
        "A single old brass-gold coin, frontal, with a raised rim and an embossed small Dalmatian sailing boat (gajeta) with a lateen sail in the centre, warm metallic highlights, centred, filling 80% of the frame."),
    "ui_rakija": (1024, 1024, True, "card",
        "A small stemless shot glass full of clear, faintly golden herbal rakija with a little green herb sprig inside, a light glint on the glass, frontal, centred, filling 80% of the frame height."),
    "logo": (1536, 1024, True, "card",
        "Game logo: the word \"TREŠETA\" in big hand-painted ornamental serif capitals, cream fill with a dark-brown outline and ochre-gold shading. The letter Š has a clearly visible háček (caron) above it. Behind the word are two crossed playing cards and an olive branch; below it sits a small rakija glass. Centred. This is the only image that contains text."),
}

for _gid, (_spec, _col) in COURTS.items():
    GENS[_gid] = (1024, 1536, False, "card", COURT_TEMPLATE.format(SPEC=_spec, COLOURS=_col))


# The built-in image tool picks the aspect ratio from the prompt text rather than
# from a size argument, so non-square generations state their format in words.
# (Added after the first pass returned several fore vignettes and the konoba
# background in square or landscape format.)
FORMAT_PORTRAIT = ("Format: tall vertical portrait image, 2:3 aspect ratio (taller than wide), "
                   "the scene composed for a tall frame.")
FORMAT_LANDSCAPE = ("Format: wide horizontal landscape image, 3:2 aspect ratio (wider than tall), "
                    "the scene composed for a wide frame.")
FULL_BLEED = ("The illustration is full-bleed: it fills the entire image edge to edge, with no border, "
              "no frame, no margin and no rounded corners.")


def format_sentence(gen_id: str) -> str:
    w, h, cut, kind, body = GENS[gen_id]
    if gen_id.startswith("fora_"):
        return FORMAT_PORTRAIT + " " + FULL_BLEED
    if gen_id.startswith("env_"):
        return FORMAT_LANDSCAPE
    if gen_id.startswith("ace_"):
        return FORMAT_PORTRAIT
    return ""


def full_prompt(gen_id: str, extra: str = "", with_format: bool = True) -> str:
    w, h, cut, kind, body = GENS[gen_id]
    prefix = STYLE_CARD if kind == "card" else STYLE_SCENE
    if gen_id == "logo":
        # The logo is the one image that must contain text, so the "no text"
        # clause of STYLE_CARD is replaced by the logo's own lettering rule.
        prefix = prefix.replace(" Absolutely no text, letters, numbers or watermark.",
                                " No watermark; the only lettering is the single word described below.")
    p = prefix + " " + body
    fmt = format_sentence(gen_id) if with_format else ""
    if fmt:
        p += " " + fmt
    if extra:
        p += " " + extra
    if cut:
        p += " " + CUTOUT
    return p


if __name__ == "__main__":
    import sys
    print(len(GENS), "generations")
    for gid in (sys.argv[1:] or GENS):
        print(f"--- {gid} {GENS[gid][:3]}\n{full_prompt(gid)}\n")

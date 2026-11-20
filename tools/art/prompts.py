"""Prompt table for the generations of GAME_DESIGN.md section 13.2 / 13.3.

Each entry: gen_id -> (width, height, cutout, prompt_without_prefix, prefix_kind)
prefix_kind is 'tri' (STYLE_TRIESTINE: the playing cards themselves), 'card'
(STYLE_CARD: badges, fore art, ui icons, logo) or 'scene' (STYLE_SCENE).
Cut-out prompts get the CUTOUT suffix appended; 'tri' gens that are not cut out
are drawn on plain white (WHITE_BG) and multiplied onto the white card.
"""

STYLE_CARD = (
    "Hand-painted gouache and ink illustration in the style of an antique 19th-century "
    "Triestine/Venetian Italian playing card, woodcut-coloured print look: bold confident "
    "dark-brown ink outlines, flat areas of warm colour with subtle brush texture and aged "
    "paper grain, limited palette of terracotta red #B5452B, ochre gold #D9A441, olive green "
    "#6B7A3A, Adriatic blue #2F5D7C, cream parchment #F3E6C8 and deep brown ink #3A2618. "
    "No religious symbols, no crosses, no halos. Absolutely no text, letters, numbers or watermark."
)

# The card faces follow the real Triestine pattern played in Dalmatia (section 13.1):
# flat litho print colours on white, black outlines, no painterly texture.
STYLE_TRIESTINE = (
    "Traditional Italian playing-card art in the Triestine pattern, printed like a 19th-century "
    "chromolithograph from a woodcut: crisp black outlines of even weight, fine parallel black "
    "hatching lines for shading, and flat unshaded fills in a strictly limited palette of bright "
    "vermilion red, cobalt blue, golden yellow and black, with small touches of leaf green and pale "
    "flesh pink. Clean graphic print look: no gradients, no paper texture, no painterly brushwork, "
    "no 3D rendering. No text, letters, numbers, logo or watermark anywhere. No crosses and no "
    "religious symbols."
)

WHITE_BG = ("Plain flat pure white background (#FFFFFF) with nothing else on it: no card outline, "
            "no frame, no border line, no shadow.")

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
    "The upper half of a double-ended court card of the Triestine Italian playing-card pattern. "
    "{SPEC} The figure is seen from the front, from the top of the head down to the waist, and the "
    "bottom edge of the image cuts straight across the figure at the waist; the wide robe and "
    "sleeves spread out and touch both side edges of the image along the bottom. The head is in "
    "the upper middle with a little white space above the headgear. The upper-left corner of the "
    "image stays empty white. Flat vermilion red, cobalt blue and golden yellow clothes with black "
    "outlines and hatching, pale flesh-pink face and hands, a little green."
)

# Each figure holds its suit symbol on the viewer's right: the corner index sits top-left,
# and in the double-ended card the rotated half puts the symbol bottom-left.
COURTS = {
    "tri_court_kupe_f": "The knave of cups: a young page with straight brown hair to his shoulders and a flat red cap with a blue band, a red tunic with a yellow and blue front panel, holding one ornate hexagonal goblet (red, blue and yellow, like the cup pips of the deck) raised in his hand at shoulder height on the viewer's right.",
    "tri_court_kupe_c": "The knight of cups: a young rider with brown hair and a round yellow hat with a black ring pattern, a red tunic with yellow trim, sitting on a brown horse of which only the head and neck show, coming in from the viewer's left at chest height below the upper-left corner; the rider holds one tall ornate hexagonal goblet (red, blue and yellow) upright at shoulder height on the viewer's right.",
    "tri_court_kupe_k": "The king of cups: a young beardless king with brown hair and a simple golden crown with rounded points, a blue tunic with a red centre stripe and a wide yellow and red mantle, holding one ornate hexagonal goblet (red, blue and yellow) raised at shoulder height on the viewer's right.",
    "tri_court_bate_f": "The knave of clubs: a young page with brown hair and a flat blue and red cap, a yellow tunic with red and blue geometric patterns and a zigzag collar, holding one long ornate baton (red ribbed shaft, blue dome cap, yellow capital and yellow knob, like the club pips of the deck) diagonally across his chest with its cap end up on the viewer's right.",
    "tri_court_bate_c": "The knight of clubs: a young rider with brown hair and a blue and red hat with a small feather, a yellow and red tunic, sitting on a brown horse of which only the head and neck show, coming in from the viewer's left at chest height below the upper-left corner; the rider holds one long ornate baton (red shaft, blue cap, yellow knob) upright on the viewer's right.",
    "tri_court_bate_k": "The king of clubs: a young king with brown hair and a tall golden crown with pointed spikes, a red, yellow and blue robe with zigzag and diamond patterns, holding one big ornate baton (red shaft, blue cap, yellow knob) upright in both hands on the viewer's right.",
    "tri_court_spade_f": "The knave of swords: a bareheaded man with long dark hair and a curled moustache, a red and yellow tunic with a blue collar, holding one straight sword with a white blade, black outline and yellow hilt upright on the viewer's right, point up.",
    "tri_court_spade_c": "The knight of swords: a young rider with dark hair and a yellow and red hat, a red tunic with yellow and blue bands, sitting on a dark brown horse of which only the head and neck show, coming in from the viewer's left at chest height below the upper-left corner; the rider raises one short straight sword with a white blade and a yellow hilt on the viewer's right.",
    "tri_court_spade_k": "The king of swords: a young king with dark hair and a blue and golden crown with rounded points, a red and yellow robe with simple geometric diamond patterns, holding one straight sword with a white blade and yellow hilt upright on the viewer's right, point up.",
    "tri_court_dinari_f": "The knave of coins: a young page with brown hair and a flat red cap with a blue band, a tunic striped in red, blue and yellow, holding up one round coin (a flat rosette of blue and yellow petals with a red centre in a white ring, like the coin pips of the deck) at head height on the viewer's right.",
    "tri_court_dinari_c": "The knight of coins: a young rider with brown hair and a red hat with a blue band, a yellow and red tunic, sitting on a brown horse of which only the head and neck show, coming in from the viewer's left at chest height below the upper-left corner; the rider holds up one round coin (blue and yellow petals, red centre, white ring) at head height on the viewer's right.",
    "tri_court_dinari_k": "The king of coins: a king with a short dark beard and a golden crown with pointed spikes, a red robe with a blue and yellow collar and yellow sleeves, holding up one round coin (blue and yellow petals, red centre, white ring) at head height on the viewer's right.",
}

ACE_OPEN = "The single large emblem of the ace of {SUIT} of the Triestine Italian playing-card pattern, drawn on its own (no card, no frame): "
ACE_CLOSE = ("The emblem is perfectly frontal and upright, centred, and fills about 88% of the image height. "
             "No text, no letters, no numbers, no banner with writing.")

SAME_FRAMING = "Character portrait, chest up, facing the viewer, background a softly blurred stone konoba wall: "

GENS = {
    # ---- Triestine card faces (section 13.2): pips as cut-outs, composed in code ----
    "tri_cup": (1024, 1536, True, "tri",
        "One single cup pip of the coppe suit of a Triestine Italian playing card: a stylised hexagonal goblet seen from the front, perfectly upright and mirror-symmetric. From top to bottom: a flat black hexagonal lid seen slightly from above with a small red eight-petal flower on it; a golden-yellow hexagonal rim band with short vertical black ribs and a row of small yellow leaves under it; a cobalt-blue stem of curling acanthus leaves that curl outward at the top and at the bottom, with a red lens-shaped knot and small white leaves in the middle; and a hexagonal foot made of a golden-yellow ribbed band with red leaf tips above a black base. The goblet is about two thirds as wide as it is tall and fills 85% of the image height."),
    "tri_coin": (1024, 1024, True, "tri",
        "One single coin pip of the denari suit of a Triestine Italian playing card: a flat round medallion seen straight from the front: a black outer circle line, a plain white ring, a second black circle line, and inside it a rosette of twelve rounded petals around a small red centre disc with a black ring and a black dot. The petals on the left half are cobalt blue and the petals on the right half are golden yellow, each petal with a few fine black hatching lines; the dividing line between blue and yellow is vertical. Perfectly circular and frontal, filling 85% of the image."),
    "tri_baton": (1024, 1536, True, "tri",
        "One single club pip of the bastoni suit of a Triestine Italian playing card: one long straight ornamental baton standing perfectly vertical in the middle. From top to bottom: a small yellow ball finial; a cobalt-blue ribbed dome cap; a golden-yellow capital collar with two small scroll volutes; a long straight cylindrical vermilion-red shaft with fine black lengthwise hatching lines and three small black diamond marks spaced along its centre line; a short black and blue collar; and at the bottom a round golden-yellow ribbed bulb knob ending in a small blue ball. The baton is about one seventh as wide as it is tall and fills 92% of the image height."),
    "tri_hilt": (1024, 1024, True, "tri",
        "The hilt end of one curved sword from the spade suit of a Triestine Italian playing card, drawn on its own and pointing straight up: at the top a round golden-yellow ribbed bulb pommel shaped like a small melon, with a little red ball at its tip; below it two cobalt-blue curling acanthus leaves that spread out to the left and right like a bow, their tips curling downward; at the bottom a short straight stub of yellow blade, cut off square. Mirror-symmetric, filling 85% of the image height."),
    "tri_sword": (1024, 1536, True, "tri",
        "One single straight sword from the spade suit of a Triestine Italian playing card, standing perfectly vertical with the point DOWN: at the top a small red ribbed pommel ball, a golden-yellow grip with a black spiral line, a white guard whose two short arms curl downward into acanthus scrolls, then a long narrow straight white steel blade with a black outline and a black centre ridge line, tapering to a sharp point at the bottom. The sword is very slender, about one eighth as wide as it is tall at the guard, and fills 92% of the image height."),
    "tri_ace_kupe": (1024, 1536, False, "tri", ACE_OPEN.format(SUIT="cups (asso di coppe)") +
        "one big ornate hexagonal goblet in red, blue and golden yellow, a larger and richer version of the cup pips: a domed hexagonal lid with a red flower finial, a wide yellow ribbed rim band with red leaves, a bowl decorated with blue acanthus scrolls, a red lens-shaped knot, a tall stem of curling blue leaves and a wide hexagonal yellow and black foot; two red and blue scroll handles curl out on both sides of the bowl, and small rays of red, blue and yellow fan out behind the lid. Mirror-symmetric. " + ACE_CLOSE),
    "tri_ace_dinari": (1024, 1536, False, "tri", ACE_OPEN.format(SUIT="coins (asso di denari)") +
        "one big round medallion in the middle: a broad golden-yellow ring with black outlines and a row of small black dots, around a large rosette of cobalt-blue and golden-yellow petals with a red centre, like a big version of the coin pips. Above and below the medallion, symmetrical scrollwork of red, blue and yellow acanthus leaves curls outward toward the four corners. Mirror-symmetric. " + ACE_CLOSE),
    "tri_ace_bate": (1024, 1536, False, "tri", ACE_OPEN.format(SUIT="clubs (asso di bastoni)") +
        "one huge ornate baton standing vertically in the middle, gripped firmly by a large hand in a red and yellow striped cuff that comes in from the right side at the lower middle; the baton has a cobalt-blue dome cap with a yellow ball finial, a golden-yellow capital with scroll volutes, a long red shaft with black hatching and black diamond marks, and a yellow ribbed bulb knob at the bottom; on both sides of the baton hang two garlands of small red and blue tulip-like flowers on thin yellow cords, each ending in a small yellow tassel. " + ACE_CLOSE),
    "tri_ace_spade": (1024, 1536, False, "tri", ACE_OPEN.format(SUIT="swords (asso di spade)") +
        "one big straight sword standing perfectly vertical in the middle with the point UP: a long white steel blade with a black outline and a black centre ridge, a golden-yellow crown of simple rounded leaves ringed around the upper part of the blade, a yellow and red hilt at the bottom whose guard curls downward into scrolls, and a red and blue ribbon curling around the lower blade; two small red and yellow griffins stand on either side of the hilt facing the sword and holding it with one claw. Mirror-symmetric. No cross shapes. " + ACE_CLOSE),
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
    # Revision 2 items (GAME_DESIGN.md section 19.2.3), drawn procedurally until play-test round 3
    "fora_briskula": (1024, 1536, False, "card",
        "Vignette: a triumphant weathered hand slamming one playing card face-up onto a thick wooden tavern table, the slammed card landing on top of three other face-up playing cards and glowing with golden light as if it outranks them all, small rakija shot glasses jumping from the impact, motion lines, dramatic warm light."),
    "badge_prevrtljivo": (1024, 1024, True, "card",
        "One round wax-seal medallion icon, flat frontal view, in the same style as a set of coloured wax seals with embossed symbols: a mauve-pink seal (#C46FA0) with an embossed chameleon on a short twig, its tail curled into a spiral, centred, filling 80% of the frame."),
    "shop_falsa": (1024, 1536, False, "card",
        "Vignette: a sly forger's hand with a very fine brush secretly repainting a humble playing card on a cluttered wooden workbench: one half of the card already shows three ornate golden cups, the other half is still a plain card with a few small pips; small ink pots, a magnifying glass and a candle beside it, conspiratorial candlelit mood."),
}

for _gid, _spec in COURTS.items():
    GENS[_gid] = (1536, 1024, False, "tri", COURT_TEMPLATE.format(SPEC=_spec))


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


FORMAT_SQUARE = "Format: square image, 1:1 aspect ratio, the subject composed for a square frame."


def format_sentence(gen_id: str) -> str:
    w, h, cut, kind, body = GENS[gen_id]
    if gen_id.startswith("fora_") or gen_id.startswith("shop_"):
        return FORMAT_PORTRAIT + " " + FULL_BLEED
    if gen_id.startswith("env_"):
        return FORMAT_LANDSCAPE
    if kind == "tri":
        # every card-face generation states its format in words
        return FORMAT_PORTRAIT if h > w else (FORMAT_LANDSCAPE if w > h else FORMAT_SQUARE)
    return ""


def full_prompt(gen_id: str, extra: str = "", with_format: bool = True) -> str:
    w, h, cut, kind, body = GENS[gen_id]
    prefix = {"tri": STYLE_TRIESTINE, "card": STYLE_CARD}.get(kind, STYLE_SCENE)
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
    elif kind == "tri":
        p += " " + WHITE_BG
    return p


if __name__ == "__main__":
    import sys
    print(len(GENS), "generations")
    for gid in (sys.argv[1:] or GENS):
        print(f"--- {gid} {GENS[gid][:3]}\n{full_prompt(gid)}\n")

# Brief — Y2K character style (Time Bank Spirit brand)

Distilled from `references/mascot2-pdf.pdf`: the are.na board *90s CG mascots/avatars* (tranquility-2099,
266 plates, mostly via Y2K Aesthetic Institute). PS1/N64/Dreamcast box art, virtual idols, Japanese
municipal and corporate mascots, rave flyers, CD covers, 1994–2002. The page that applies it is
`brand/` (`/brand/`). Its tokens live in `brand/tokens.json`.

## What the board has in common
- **Pre-rendered, not drawn.** Ray-traced plastic and chrome with one key light, a hard specular dot,
  soft contact shadows, and no outlines. Lightscape renders, Render96, Super Mario 64 box art.
- **Primitives.** Characters are spheres, capsules, rounded boxes and cones. Detail comes from
  proportion, not texture (Bomberman 64, Hokkun, Pipo-kun, the Chao).
- **Eyes are the face.** They are huge, glossy and set wide, with a highlight in each. Mouths are
  small or missing (Toro, Chao, Tanukichi 2000, Wetrix+).
- **Candy materials.** Saturated primaries, translucent gel, iridescent foil, chrome bodies (Faiyaz
  Jafri's Neo-Archetypes, Kyoko Date, Yuki Terai, the Tokyo virtual idols).
- **Cold skies.** Pale blue gradients, white floors, grids and halftone posters behind the figure.

## How Time Bank Spirit takes it
1. **The eyes are the logo.** Two glossy eyes with one hard highlight must read at 32 px.
2. **Primitives, sculpted.** Use SDF blends (`engine/sdf.js`), never stacked balls or painted detail.
3. **One light, one highlight, one shadow.** It is a pre-rendered object, not an illustration.
4. **Five inks only.** Toner, blu, fluo, rosso and paper. Each look reinterprets them: halftone in
   print, painted plastic in 3D, and chrome / candy / gel in Y2K. No new colours.
5. **Silhouette first.** Claws, shell and apparatus have to read in solid black.
6. **No text on the image.** No captions, crop marks or logos inside the render. Names live outside it.
7. **The crab is the host.** The apparatus (wings, halos, towers, chains) is what makes each one a character.
8. **One model, every look.** Print, 3D and Y2K are the same object. It is never redrawn.

## The dials (modulation)
The whole cast is tuned by three macro dials. 0.5 is the cast as specified; the ends are the limits.
- **Kawaii** (Esoteric ↔ Toy): eye size, stalk length, body, carapace bumps, claws, float.
- **Gloss** (Vinyl ↔ Chrome): roughness, clearcoat, iridescence, sheen, gel glow.
- **Sky** (Paper ↔ Box art): the backdrop gradient of the Y2K look.

Fine tokens can be set one by one after the dials. Export the result as `brand/tokens.json`.

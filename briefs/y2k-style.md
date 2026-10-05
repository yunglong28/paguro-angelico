# Brief — Y2K character style (Time Bank Spirit brand)

Distilled from `references/mascot2-pdf.pdf`: the are.na board *90s CG mascots/avatars* (tranquility-2099,
266 plates, mostly via Y2K Aesthetic Institute). PS1/N64/Dreamcast box art, virtual idols, Japanese
municipal and corporate mascots, rave flyers, CD covers, 1994–2002. The studio (`/studio/`) applies it;
the shared palettes and stage live in `brand/brand.json`.

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
4. **Palettes, not paint.** Parts paint with six roles; each character's palette gives every role a colour,
   a finish and a print ink. Pick colours as a harmony (the studio generates them in OKLCH), not one by one.
   Print stays a five-ink halftone: every role says which press ink it is screened with.
5. **Silhouette first.** Claws, shell and apparatus have to read in solid black.
6. **No text on the image.** No captions, crop marks or logos inside the render. Names live outside it.
7. **The crab is the host.** The apparatus (wings, halos, towers, chains) is what makes each one a character.
8. **One model, every look.** Print, 3D and Y2K are the same object. It is never redrawn.

## Modulation
The studio is where the style is modulated: per character (palette, every gene, locks), across characters
(Breed, Blend), from words (Describe), and for the whole cast (Brand: palette library and the stage of each look).

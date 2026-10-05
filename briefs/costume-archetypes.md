# Brief — Masks and costumed bodies (series *Maschere*)

Sources, synced with `npm run refs` into `briefs/references/` (private; block numbers refer to each `index.json`):
- [are.na/laure-michelon/masks-zlx5wjjoszs](https://www.are.na/laure-michelon/masks-zlx5wjjoszs) — 167 images: Noh, African masks,
  fashion masks, helms, tech visors and headsets, faces hidden by fringe, mesh and hair.
- [are.na/kim-plowright/costumed-bodies](https://www.are.na/kim-plowright/costumed-bodies) — 229 images: Oskar Schlemmer's
  *Triadic Ballet*, Nick Cave's *Soundsuits*, Charles Fréger's *Wilder Mann*, Leigh Bowery, Zanele Muholi, hooded robes.

What the two boards share: **the face is replaced and the body is rebuilt**. The person disappears and a figure
takes its place. For a time bank that is the point: on the day of the carnival everyone wears someone else's
face and does someone else's hour.

## New modules (`engine/figure.js`)
- **Mask** — `noh` (white plate, slit eyes, high painted brows, a small red mouth), `longface` (a carved elongated
  face, slit eyes, nose ridge, forehead bands), `helmet` (great helm with an eye slit), `goggles` (a lit visor),
  `veil` (a fringe hanging from the brow that hides the face). Colour `auto` gives each mask its natural material.
- **Coat** — `fur` (hundreds of hanging strands, one mesh), `straw` (tiers of strands to the ground), `leaves`,
  `cloak` (a robe and a cowl, open at the front), `hoops` (Schlemmer's rings and disc).
- **Ears** — `antlers`, `peak` (a tall pointed hat).

## Archetypes (`engine/schema.js`)
| Archetype | From | References |
|---|---|---|
| Masked | a person behind a mask | masks #144 (Okina), #44 (TV helmet), #139 (headsets); costumed #104 (Kakitsubata) |
| Soundsuit | a body under fur, no face | costumed #121–#124 (Nick Cave) |
| Wild man | straw or fur, antlers, a carved face | costumed #83 #84 #87 (Fréger); masks #90–#92 (Chokwe, Punu, Lega) |
| Green man | leaves to the ground, a pointed hat | costumed #150 (Green Man of Bankside) |
| Triadic | cone body, hoops, painted head | costumed #24 #26 #27 #28 (Schlemmer) |
| Hooded | a robe, a hood, darkness inside | costumed #74–#77 (Muholi), hooded robes |

## The series
Volto prestato · Sonaglio · Selvatico · Siepe · Turno a tre · Veglia · Visore · Elmo · Confidente · Antenato.
Each file in `characters/maschere/` says what it gives the time bank and which blocks it comes from.

## What not to take
Real people's faces and identities, ritual objects as such, artists' signature pieces copied one to one.
What is taken is construction: a plate over the face, strands to the ground, rings around a cone.

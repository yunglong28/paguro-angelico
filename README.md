# paguro-angelico

**Live:** https://yunglong28.github.io/paguro-angelico/

Character pipeline for the **Spring Draw** mascot: a hermit crab as a medieval angel, rendered in
3D and printed in toner / blu / fluo halftone. Characters are **JSON specs** composed from a part
library, so new ones can be written, mutated, previewed and exported without touching the renderer.

```
brief ──► spec ──► mutate ──► view ──► export
briefs/   characters/  npm run new   viewer/    npm run export → out/<id>/{plate,sheet}.png
                                                npm run glb    → models/<id>.glb
```

Drag to rotate, scroll to zoom. Three looks of the same model: *3D* (lit), *Y2K* (90s pre-rendered CGI: chrome, candy plastic, sky gradient) and *Stampa* (the halftone print). *Scarica .glb* downloads the animated model.

Two series:
- **Angeli**: Serafino, Ofanino, Doppia chela, Mandorla, Mandragora, Re Pescatore, Angelo di mare, Reliquiario. Brief: [`briefs/paguro-angelico.md`](briefs/paguro-angelico.md).
- **Collettivo** (justice, solidarity, the commons, Soviet constructivism): Torre (Tatlin), Cuneo rosso (Lissitzky), Tribuna (Lenin Tribune), Catena di vacanza (real hermit-crab vacancy chains), Casa comune (Narkomfin), Bilancia, Internazionale. Brief: [`briefs/collettivo.md`](briefs/collettivo.md).

![Collettivo](docs/collettivo.png)

| Stampa (print) | 3D |
|---|---|
| ![print](docs/print.png) | ![3d](docs/3d.png) |

Every character downloads as a `.glb` **with its idle animation baked in**: press *Scarica .glb* on the live site, or run `npm run glb` to write all of them to `models/`. Open them in Blender, or drag them into https://gltf-viewer.donmccurdy.com.

## How the 3D is made
- **Sculpted, not stacked.** Bodies, claws, legs and eye stalks are signed-distance fields (ellipsoids, tapered capsules, rounded boxes) blended with smooth unions and polygonised with surface nets into single watertight meshes with gradient normals (`src/sdf.js`). The hermit crab has real anatomy: tubercled carapace, rostrum, an asymmetric big right claw with a hinged finger, and jointed walking legs.
- **Rigged.** Every moving part is its own node in a hierarchy (stalks, eyelids, claw fingers, legs, wings, rings), driven by `up(t)`. `src/bake.js` samples that motion into glTF keyframe tracks.
- **Two looks from one model.** *3D*: physical materials, an image-based room environment, soft shadow-mapped contact shadows. *Stampa*: the same scene rendered to a separation buffer and screened as toner 15° / blu 75° halftone with flat fluo and rosso spot inks.

## Run

```bash
npm run dev                         # http://127.0.0.1:5173/viewer/
npm run export                      # every character: plate.png + sheet.png  (headless Chrome)
npm run export -- serafino --loop   # + 4 s turntable loop.mp4 (ffmpeg)
npm run export -- --variants        # + 3×3 variant grid
npm run export -- --plate           # plates only, fast
npm run glb                         # models/<id>.glb with baked idle animation (no browser needed)
node pipeline/shot.mjs out/x.png "c=torre&look=color" "c=torre&look=print"   # any viewer state to PNG
node pipeline/turn.mjs drafts/x.json out/x-turn.png   # 4-angle strip of a draft spec
```

No npm install is needed. three.js is vendored and the scripts only use Node built-ins plus local Chrome and ffmpeg.

## Viewer modes
- **Tavola**: the plate. Drag to rotate.
- **Foglio**: model sheet. Turnaround (front, ¾, side, back), plus the six expressions.
- **Varianti**: 3×3 seeded mutations around the original (centre). Click one to get the
  `npm run new` command that promotes it.
- **Genealogia**: lineage graph, from the chat's first plate to every promoted variant.

## Making a character
1. **Brief**: add to or extend `briefs/` (concept, references, rules).
2. **Spec**: write `drafts/<id>.json`. Preview with `/viewer/?spec=drafts/<id>.json`.
3. **Mutate**: `npm run new -- --from <id> --seed <n> [--name "…"] [--id new-id]`.
   This writes `characters/<id>-s<n>.json` with `parent` set, so it shows up in Genealogia.
4. **Export**: `npm run export -- <id> --loop`.

### Spec shape
```jsonc
{
  "id": "serafino", "name": "Serafino", "parent": "paguro-angelico-v1",
  "concept": "…", "refs": ["Isaiah 6:2"], "seed": 3,
  "expression": "estasi",               // quiete | estasi | stupore | ira | pieta | sonno
  "pose": { "float": 0.12, "sway": 0.2, "scale": 0.92, "lift": 0 },
  "host": {                             // the hermit crab
    "scale": 0.72,
    "shell": { "turns": 4.5, "growth": 0.1, "knobs": 0, "ribs": 0.4, "tilt": -0.38, "detached": null },
    "body": { "ink": "blu" }, "eyes": { "stalk": 0.55, "count": 2 },
    "claws": { "hold": "seed" }, "legs": 3
  },
  "parts": [ { "type": "halo", "r": 0.62 }, { "type": "wings", "pairs": 3, "eyes": 3 } ]
}
```

**Parts**. In `src/parts.js` (Angeli): `halo` · `wings` · `rings` (ophanim) · `mandorla` · `eyecloud` ·
`double` (the Deleuze lobster) · `crown` · `mandrake` · `roots` · `parapodia` · `monstrance` ·
`plinth` · `seeds`. In `src/collettivo.js`: `tatlin` · `wedge` · `tribune` · `chain` · `commune` · `scales` · `ring` · `banner`.
Collective parts can spawn extra crabs with `ctx.buildHost(overrides)`, hide the main one (`hideHost`) or re-seat it (`hostAt`). To add a part, write `(params, ctx) => { obj, up(t) }`, register it in
`PARTS`, and give its numeric params ranges in `src/mutate.js` so variants can explore them.

## Files
| | |
|---|---|
| `src/press.js` | two looks: lit PBR 3D, or separation buffer (R toner, G spot fluo/rosso, B blu) → halftone press |
| `src/sdf.js` | SDF primitives, smooth blend, surface-nets mesher, geometry cache |
| `src/collettivo.js` | parts of the Collettivo series |
| `src/bake.js` | procedural motion → glTF animation clip |
| `src/parts.js` | host crab with rigged eyes, expressions, all parts |
| `src/build.js` | spec → rigged character (`up(t)`, `setExpression`, `face()`) |
| `src/mutate.js` | seeded RNG, param ranges, grafts, `mutate(spec, seed)`. Pure JS, shared with Node |
| `viewer/` | the app |
| `pipeline/` | `serve`, `manifest`, `new`, `export`, `turn` |
| `lineage.json` | the chat's earlier artifacts, which the characters descend from |

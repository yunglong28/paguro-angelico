# CLAUDE.md — time-bank-spirit

Spec-driven 3D mascot pipeline. Read `README.md` (it has the folder map) and `briefs/angeli.md` first. The brief's
rules come from the user: no crop marks, no captions on images, real characters, esoteric/medieval.

- New character = new JSON in `characters/drafts/`, then preview it with `node scripts/turn.mjs characters/drafts/<id>.json`
  and **look at the PNG** before moving it to `characters/<series>/` + `npm run manifest`.
- New visual vocabulary = new part in `engine/parts.js` (`(params, ctx) => {obj, up}`), add to `PARTS`,
  add ranges in `engine/mutate.js`. Parts positioned from `ctx.anchors` go in `ANCHORED` (build.js).
- Organic shapes: sculpt them with `engine/sdf.js` (`sculpt(key, () => blend([...]), cell)`), not stacked spheres.
- Materials only via `ink('toner'|'blu'|'fluo'|'rosso'|'paper', base, shade)`. Never use other colours, since the
  press pass reads channels.
- Verify visually with `node scripts/shot.mjs output/renders/x.png "c=<id>&look=color" "c=<id>&look=print"` and look at the PNG.
- Brand look = `brand/tokens.json` (edited through `/brand/`, applied by `engine/style.js`). Change the dials or tokens, not
  individual specs, when the request is about the brand's overall style. Rules: `briefs/y2k-style.md`.
- `output/` is gitignored (renders + .glb models are too heavy to push); the site builds .glb files in the browser.

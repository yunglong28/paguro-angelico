# CLAUDE.md — paguro-angelico

Spec-driven 3D mascot pipeline. Read `README.md` and `briefs/paguro-angelico.md` first. The brief's
rules come from the user: no crop marks, no captions on images, real characters, esoteric/medieval.

- New character = new JSON in `drafts/`, then preview it with `node pipeline/turn.mjs drafts/<id>.json`
  and **look at the PNG** before moving it to `characters/` + `npm run manifest`.
- New visual vocabulary = new part in `src/parts.js` (`(params, ctx) => {obj, up}`), add to `PARTS`,
  add ranges in `src/mutate.js`. Parts positioned from `ctx.anchors` go in `ANCHORED` (build.js).
- Organic shapes: sculpt them with `src/sdf.js` (`sculpt(key, () => blend([...]), cell)`), not stacked spheres.
- Materials only via `ink('toner'|'blu'|'fluo'|'rosso'|'paper', base, shade)`. Never use other colours, since the
  press pass reads channels.
- Verify visually with `node pipeline/shot.mjs out/x.png "c=<id>&look=color" "c=<id>&look=print"` and look at the PNG.
- `models/` is gitignored (too heavy to push); the site builds .glb files in the browser.

# CLAUDE.md — time-bank-spirit

Character editor + generator. Read `README.md` (system map) and `briefs/y2k-style.md` first. The brief's
rules come from the user: no crop marks, no captions on images, real characters, esoteric/medieval, Y2K CGI.

- **One genome, one schema.** A character is a JSON file in `characters/`; `engine/schema.js` describes every gene.
  The studio (`studio/`), randomize/mutate/breed/blend, validation and the Describe prompt all read the schema.
  Never add a tool that bypasses it, and never add a second app next to the studio: extend the studio.
- New part = function in `engine/parts.js` (`(params, ctx) => {obj, up}`) + register in `PARTS` + its genes in
  `engine/schema.js` `PARTS`. Parts positioned from `ctx.anchors` go in `ANCHORED` (build.js) and get `anchored: true`.
- Organic shapes: sculpt them with `engine/sdf.js` (`sculpt(key, () => blend([...]), cell)`), not stacked spheres.
- Parts paint with **roles** via `ink(name, base, shade)` (`blu` primary, `toner` shell/dark or line when base ≥ 0.8,
  `fluo` accent, `rosso` secondary, `paper` light). Colours live in the character's `palette`, never in parts.
- Preview a draft: `node scripts/turn.mjs characters/drafts/<id>.json` and **look at the PNG**; any studio state:
  `node scripts/shot.mjs output/renders/x.png "c=<id>&look=y2k" "c=<id>&mode=sheet"`.
- Headless WebGL is slow (SwiftShader): the studio's `window.tbs` exposes state for automated checks.
- `output/` and `node_modules/` are gitignored; the Anthropic SDK is an optional dependency used only by Describe.

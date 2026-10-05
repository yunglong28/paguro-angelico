// The genome: every editable parameter of a character, typed, with its range and default.
// One source of truth for the studio's inspector, randomize, mutation, breeding, blending,
// validation, and the text → character generator. A character file (characters/**.json) IS a genome.
// Pure JS (no three.js).
import { rng } from './rng.js';
import { ROLES, FINISHES, PRINT_INKS, CLASSIC, harmony, mixHex, labDist, SCHEMES, STYLES, toOklch, oklch, withPalette, rgbToOklab, hexToRgb } from './palette.js';

// role a part paints with, as an ink name (see engine/palette.js)
const INKS = ['blu', 'toner', 'fluo', 'rosso', 'paper'];
export const INK_ROLE = { blu: 'Primary', toner: 'Shell', fluo: 'Accent', rosso: 'Secondary', paper: 'Light' };
export const EXPRESSIONS = ['quiete', 'estasi', 'stupore', 'ira', 'pieta', 'sonno'];

const f = (key, label, min, max, def, extra = {}) => ({ key, label, type: 'float', min, max, def, ...extra });
const i = (key, label, min, max, def, extra = {}) => ({ key, label, type: 'int', min, max, def, ...extra });
const e = (key, label, options, def, extra = {}) => ({ key, label, type: 'enum', options, def, ...extra });
const b = (key, label, def) => ({ key, label, type: 'bool', def });

// ---------- anatomy: the hermit crab (paths into spec) ----------
export const ANATOMY = [
  { id: 'body', label: 'Body', genes: [
    f('host.scale', 'Scale', 0.45, 1.2, 1),
    f('host.body.size', 'Carapace', 0.7, 1.45, 1),
    i('host.body.bumps', 'Tubercles', 0, 16, 9),
    e('host.body.ink', 'Colour role', INKS, 'blu', { bias: 0.8 }),
  ] },
  { id: 'shell', label: 'Shell', genes: [
    b('host.shell.on', 'Has a shell', true),
    f('host.shell.turns', 'Turns', 3, 6.5, 4.5),
    f('host.shell.growth', 'Growth', 0.07, 0.15, 0.1),
    f('host.shell.size', 'Size', 0.9, 2.2, 1.5),
    f('host.shell.knobs', 'Spines', 0, 0.8, 0),
    f('host.shell.ribs', 'Ribs', 0, 1, 0),
    f('host.shell.tilt', 'Tilt', -0.9, 0.1, -0.38),
    f('host.shell.yaw', 'Turn', -1.2, 1.2, 0.5),
    e('host.shell.ink', 'Colour role', INKS, 'toner', { bias: 0.7 }),
  ] },
  { id: 'eyes', label: 'Eyes', genes: [
    i('host.eyes.count', 'Count', 1, 6, 2),
    f('host.eyes.size', 'Size', 0.5, 2, 1),
    f('host.eyes.stalk', 'Stalks', 0.15, 1, 0.55),
  ] },
  { id: 'claws', label: 'Claws', genes: [
    b('host.claws.on', 'Has claws', true),
    f('host.claws.size', 'Size', 0.5, 1.7, 1),
    f('host.claws.raise', 'Raise', -0.8, 0.9, 0),
    e('host.claws.hold', 'Holds', ['seed', 'rosso', 'none'], 'seed'),
  ] },
  { id: 'legs', label: 'Legs', genes: [i('host.legs', 'Pairs', 0, 5, 3)] },
  { id: 'pose', label: 'Pose & face', genes: [
    e('expression', 'Expression', EXPRESSIONS, 'quiete'),
    f('pose.scale', 'Figure scale', 0.5, 1.2, 1),
    f('pose.lift', 'Lift', -1, 1, 0),
    f('pose.float', 'Float', 0, 0.3, 0),
    f('pose.sway', 'Sway', 0, 0.7, 0.3),
  ] },
];

// ---------- anatomy: the modular figure (spirits, Y2K blobs, chibi, object-spirits) ----------
const POSE = ANATOMY.find(a => a.id === 'pose');
export const FIGURE = [
  { id: 'body', label: 'Body', genes: [
    e('figure.body.shape', 'Shape', ['egg', 'capsule', 'box', 'bell', 'drop', 'coin', 'hourglass', 'house', 'slug', 'cone', 'star'], 'egg'),
    f('figure.body.w', 'Width', 0.5, 1.8, 1), f('figure.body.h', 'Height', 0.4, 2.2, 1),
    f('figure.scale', 'Scale', 0.45, 1.3, 1),
    e('figure.body.ink', 'Colour role', INKS, 'blu', { bias: 0.8 }),
    e('figure.belly.kind', 'Pattern', ['none', 'clock', 'spiral', 'buttons', 'heart', 'spots'], 'none'),
  ] },
  { id: 'head', label: 'Head', genes: [
    e('figure.head.shape', 'Shape', ['none', 'sphere', 'egg', 'box', 'cat'], 'sphere'),
    f('figure.head.size', 'Size', 0.5, 2, 1),
    e('figure.head.ink', 'Colour role', INKS, 'blu', { bias: 0.8 }),
  ] },
  { id: 'face', label: 'Face', genes: [
    e('figure.eyes.style', 'Eyes', ['round', 'button', 'void', 'visor', 'lens'], 'round'),
    i('figure.eyes.count', 'Count', 1, 6, 2), f('figure.eyes.size', 'Eye size', 0.4, 2, 1),
    f('figure.eyes.gap', 'Spacing', 0.5, 1.8, 1), f('figure.eyes.y', 'Height', -0.6, 0.5, 0),
    e('figure.mouth.style', 'Mouth', ['normal', 'fangs', 'none'], 'normal'), f('figure.mouth.size', 'Mouth size', 0.4, 1.8, 1),
  ] },
  { id: 'ears', label: 'Ears & horns', genes: [
    e('figure.ears.kind', 'Kind', ['none', 'cat', 'bunny', 'floppy', 'horns', 'antenna', 'feelers', 'sprout', 'fins'], 'none'),
    f('figure.ears.size', 'Size', 0.5, 1.8, 1), e('figure.ears.ink', 'Colour role', INKS, 'blu', { bias: 0.6 }),
  ] },
  { id: 'arms', label: 'Arms', genes: [
    e('figure.arms.kind', 'Kind', ['none', 'stub', 'noodle', 'long'], 'stub'),
    f('figure.arms.len', 'Length', 0.5, 1.6, 1), e('figure.arms.ink', 'Colour role', INKS, 'blu', { bias: 0.8 }),
  ] },
  { id: 'legs', label: 'Legs', genes: [
    e('figure.legs.kind', 'Kind', ['none', 'stub', 'legs', 'long', 'tentacles', 'wisp'], 'stub'),
    f('figure.legs.len', 'Length', 0.5, 1.6, 1), f('figure.legs.foot', 'Feet', 0.6, 2.2, 1), i('figure.legs.count', 'Tentacles', 3, 9, 6),
    e('figure.legs.ink', 'Colour role', INKS, 'blu', { bias: 0.8 }),
  ] },
  { id: 'back', label: 'Back', genes: [
    e('figure.back.kind', 'Kind', ['none', 'frills', 'batwings', 'spines'], 'none'),
    i('figure.back.count', 'Count', 3, 32, 14), f('figure.back.size', 'Size', 0.4, 1.8, 1),
    e('figure.back.ink', 'Colour role', INKS, 'fluo', { bias: 0.6 }),
  ] },
  { id: 'tail', label: 'Tail', genes: [
    e('figure.tail.kind', 'Kind', ['none', 'devil', 'curl', 'puff'], 'none'),
    f('figure.tail.len', 'Length', 0.4, 1.8, 1), e('figure.tail.ink', 'Colour role', INKS, 'blu', { bias: 0.7 }),
  ] },
  { id: 'house', label: 'House', genes: [
    e('figure.house.kind', 'Kind', ['none', 'shell', 'clock', 'cottage', 'lantern'], 'none'),
    f('figure.house.size', 'Size', 0.5, 1.6, 1), e('figure.house.ink', 'Colour role', INKS, 'toner', { bias: 0.7 }),
  ] },
  POSE,
];
export const SPECIES = { id: 'species', label: 'Species', genes: [e('plan', 'Body plan', ['crab', 'figure'], 'crab', { fixed: true })] };
export const anatomyOf = (spec) => [SPECIES, ...(spec?.plan === 'figure' ? FIGURE : ANATOMY)];
const ALL_GENES = [SPECIES, ...ANATOMY, ...FIGURE].flatMap(a => a.genes);

// Starting points. Randomize picks one and varies it, so random characters stay coherent.
export const ARCHETYPES = {
  crab: { label: 'Hermit crab', note: 'The original host: a crab in a borrowed shell', spec: { plan: 'crab' } },
  blob: { label: 'Y2K blob', note: 'All head, tiny limbs, huge glossy eyes (Chao, Toro, Pipo-kun)', spec: { plan: 'figure', figure: { body: { shape: 'egg', w: 1.25, h: 0.85 }, head: { shape: 'none' }, eyes: { style: 'round', count: 2, size: 1.5, gap: 1.25, y: 0.15 }, mouth: { style: 'normal' }, ears: { kind: 'antenna' }, arms: { kind: 'stub' }, legs: { kind: 'stub', len: 0.8 } } } },
  chibi: { label: 'Chibi', note: 'Two and a half heads tall, a person of the time bank', spec: { plan: 'figure', figure: { body: { shape: 'capsule', w: 0.75, h: 0.85 }, head: { shape: 'sphere', size: 1.45 }, eyes: { style: 'round', count: 2, size: 1.05, gap: 1.1, y: -0.1 }, ears: { kind: 'none' }, arms: { kind: 'long', len: 0.85 }, legs: { kind: 'legs', len: 0.9 } } } },
  spirit: { label: 'Spirit', note: 'A floating ghost with a wisp for legs and dark eyes', spec: { plan: 'figure', figure: { body: { shape: 'drop', w: 0.9, h: 1.3 }, head: { shape: 'none' }, eyes: { style: 'void', count: 2, size: 1.1, y: 0.1 }, mouth: { style: 'none' }, arms: { kind: 'noodle', len: 1.2 }, legs: { kind: 'wisp', len: 1.1 } } } },
  object: { label: 'Object spirit', note: 'A thing that came alive: an hourglass, a coin, a little house', spec: { plan: 'figure', figure: { body: { shape: 'hourglass', w: 0.9, h: 1.2 }, head: { shape: 'none' }, eyes: { style: 'button', count: 2, size: 1.3, y: 0.35 }, arms: { kind: 'noodle', len: 0.8 }, legs: { kind: 'stub' } } } },
  nudibranch: { label: 'Sea slug', note: 'Long and low, frilled gills, feelers, vivid spots (nudibranchs)', spec: { plan: 'figure', figure: { body: { shape: 'slug', w: 0.95, h: 0.75 }, head: { shape: 'none' }, eyes: { style: 'button', count: 2, size: 0.9, gap: 0.9, y: 0.1 }, mouth: { style: 'none' }, ears: { kind: 'feelers', size: 1.1 }, arms: { kind: 'none' }, legs: { kind: 'none' }, back: { kind: 'frills', count: 18, size: 1 }, belly: { kind: 'spots' } } } },
  plush: { label: 'Plush', note: 'Huge soft head, tiny body, floppy ears, dot eyes, no mouth (Sanrio, Miffy)', spec: { plan: 'figure', figure: { body: { shape: 'egg', w: 0.8, h: 0.65 }, head: { shape: 'sphere', size: 1.7 }, eyes: { style: 'button', count: 2, size: 0.75, gap: 1.2, y: -0.12 }, mouth: { style: 'none' }, ears: { kind: 'floppy', size: 1.25 }, arms: { kind: 'stub', len: 0.8 }, legs: { kind: 'stub', len: 0.7 }, tail: { kind: 'puff', len: 0.8 } } } },
  costume: { label: 'Costume mascot', note: 'A big padded suit: huge feet, gloves, a tail (Gritty, Phanatic, Kumamon)', spec: { plan: 'figure', figure: { body: { shape: 'egg', w: 1.35, h: 1.15 }, head: { shape: 'sphere', size: 1.3 }, eyes: { style: 'round', count: 2, size: 1.2, gap: 1.1 }, mouth: { style: 'normal', size: 1.4 }, ears: { kind: 'cat', size: 0.9 }, arms: { kind: 'long', len: 1.05 }, legs: { kind: 'legs', len: 0.75, foot: 2 }, tail: { kind: 'puff', len: 1.2 } } } },
  sun: { label: 'Sun', note: 'A face in a radiant disc: suns, stars, flames', spec: { plan: 'figure', figure: { body: { shape: 'star', w: 0.85, h: 0.8 }, head: { shape: 'none' }, eyes: { style: 'round', count: 2, size: 1.1, gap: 1.2 }, mouth: { style: 'normal', size: 1.5 }, arms: { kind: 'stub', len: 0.9 }, legs: { kind: 'stub', len: 0.8 } } } },
  cyclops: { label: 'Olympic cyclops', note: 'An abstract geometric body and one camera eye (Wenlock, Izzy, Duke)', spec: { plan: 'figure', figure: { body: { shape: 'cone', w: 0.95, h: 1.5 }, head: { shape: 'none' }, eyes: { style: 'lens', count: 1, size: 2.1, y: 0.15 }, mouth: { style: 'none' }, ears: { kind: 'antenna', size: 0.9 }, arms: { kind: 'noodle', len: 1 }, legs: { kind: 'long', len: 0.8, foot: 1.3 } } } },
  sprout: { label: 'Sprout', note: 'A head that grows a leaf (Pikmin, mandrakes)', spec: { plan: 'figure', figure: { body: { shape: 'capsule', w: 0.55, h: 0.75 }, head: { shape: 'egg', size: 1.15 }, eyes: { style: 'button', count: 2, size: 1.2, gap: 1, y: 0.05 }, mouth: { style: 'none' }, ears: { kind: 'sprout', size: 1.3 }, arms: { kind: 'noodle', len: 0.9 }, legs: { kind: 'long', len: 0.9 } } } },
  imp: { label: 'Imp', note: 'Darkness complemented by cuteness: bat wings, horns, fangs, a devil tail', spec: { plan: 'figure', figure: { body: { shape: 'egg', w: 0.95, h: 0.85 }, head: { shape: 'sphere', size: 1.35 }, eyes: { style: 'round', count: 2, size: 1.15, gap: 1.05 }, mouth: { style: 'fangs', size: 1.1 }, ears: { kind: 'horns', size: 0.8 }, arms: { kind: 'stub' }, legs: { kind: 'stub', len: 0.8 }, back: { kind: 'batwings', size: 1.1, ink: 'toner' }, tail: { kind: 'devil', len: 1.1 } } } },
  uncanny: { label: 'Uncanny', note: 'Not cute: many eyes, horns, tentacles, a long silhouette', spec: { plan: 'figure', figure: { body: { shape: 'bell', w: 0.85, h: 1.45 }, head: { shape: 'egg', size: 0.85 }, eyes: { style: 'void', count: 4, size: 0.75, gap: 0.85 }, mouth: { style: 'fangs' }, ears: { kind: 'horns', size: 1.2 }, arms: { kind: 'long', len: 1.4 }, legs: { kind: 'tentacles', count: 7, len: 1.2 } } } },
};
// the archetype a genome is closest to (for labels and the species picker)
export function speciesOf(spec) {
  if (spec?.plan !== 'figure') return 'crab';
  const F = spec.figure || {}, legs = F.legs?.kind, body = F.body?.shape, head = F.head?.shape;
  if (body === 'slug') return 'nudibranch';
  if (body === 'star') return 'sun';
  if (body === 'cone' || F.eyes?.style === 'lens') return 'cyclops';
  if (F.ears?.kind === 'sprout') return 'sprout';
  if (F.back?.kind === 'batwings' || F.tail?.kind === 'devil') return 'imp';
  if (F.ears?.kind === 'floppy') return 'plush';
  if ((F.legs?.foot ?? 1) >= 1.6) return 'costume';
  if (F.eyes?.style === 'void' && (F.ears?.kind === 'horns' || legs === 'tentacles')) return 'uncanny';
  if (legs === 'wisp' || body === 'drop') return 'spirit';
  if (['hourglass', 'coin', 'house'].includes(body)) return 'object';
  if (head && head !== 'none' && (legs === 'legs' || legs === 'long')) return 'chibi';
  return 'blob';
}
export function applyArchetype(spec, key) {
  const out = clone(spec), A = ARCHETYPES[key].spec;
  out.plan = A.plan;
  if (A.figure) out.figure = clone(A.figure);
  if (A.plan === 'figure') out.parts = (out.parts || []).filter(p => !PARTS[p.type]?.wraps);
  return out;
}

const ITEMS = ['hourglass', 'clock', 'book', 'wrench', 'ladle', 'can', 'key', 'lantern', 'scissors', 'coin', 'broom'];

// ---------- apparatus: the part library (keys inside each part object) ----------
const MOVE = [f('move.0', 'Move x', -2, 2, 0, { common: true }), f('move.1', 'Move y', -2, 2, 0, { common: true }), f('move.2', 'Move z', -2, 2, 0, { common: true }), f('size', 'Size', 0.4, 1.8, 1, { common: true })];
export const PARTS = {
  halo: { label: 'Halo', series: 'angeli', note: 'Gold disc with punched tooling and rays', genes: [f('r', 'Radius', 0.4, 1.8, 0.75), f('y', 'Height', -0.5, 1.6, 0.6), f('z', 'Depth', -1.6, 0, -0.9), i('punch', 'Punches', 0, 64, 36), i('rays', 'Rays', 0, 64, 0), i('rings', 'Rings', 1, 3, 1)] },
  wings: { label: 'Wings', series: 'angeli', note: 'Seraph wings, pairs of feathered fans with eyes', genes: [i('pairs', 'Pairs', 1, 4, 3), i('feathers', 'Feathers', 3, 11, 7), f('len', 'Length', 0.6, 1.9, 1.3), i('eyes', 'Eyes', 0, 11, 1), f('spread', 'Spread', 0.7, 1.5, 1), f('flap', 'Flap', 0, 0.35, 0.12), e('ink', 'Colour role', INKS, 'toner', { bias: 0.7 })] },
  rings: { label: 'Ophanim rings', series: 'angeli', note: 'Wheels within wheels, full of eyes', genes: [i('count', 'Rings', 1, 4, 3), f('r0', 'Radius', 1, 1.9, 1.45), f('step', 'Step', 0.15, 0.5, 0.3), i('eyes', 'Eyes', 0, 12, 7), f('speed', 'Speed', 0, 2, 1), f('thick', 'Thickness', 0.03, 0.14, 0.07), e('ink', 'Colour role', INKS, 'toner', { bias: 0.7 })] },
  mandorla: { label: 'Mandorla', series: 'angeli', note: 'Almond glory with rays and stars', genes: [f('r', 'Radius', 0.9, 1.7, 1.25), f('aspect', 'Aspect', 1.2, 2, 1.65), i('rays', 'Rays', 0, 96, 64), i('eyes', 'Eyes', 0, 8, 4), i('stars', 'Stars', 0, 40, 22)] },
  eyecloud: { label: 'Eye cloud', series: 'angeli', note: 'A ring of floating eyes', genes: [i('count', 'Eyes', 3, 16, 9), f('r', 'Radius', 1.2, 2.8, 2), f('size', 'Eye size', 0.3, 1.1, 0.6)] },
  double: { label: 'Double articulation', series: 'angeli', note: 'A mirrored second crab and pincers (God is a lobster)', wraps: true, genes: [f('gap', 'Gap', 0.6, 1.5, 1), i('strata', 'Strata', 3, 11, 7), b('pincers', 'Pincers', true), f('scale', 'Twin scale', 0.35, 0.95, 0.62)] },
  crown: { label: 'Crown', series: 'angeli', anchored: true, note: 'A crown on the shell apex', genes: [f('r', 'Radius', 0.18, 0.55, 0.32), f('h', 'Height', 0.2, 0.7, 0.38), i('points', 'Points', 3, 10, 6), i('arches', 'Arches', 0, 4, 2), e('on', 'On', ['apex', 'head'], 'apex'), f('tilt', 'Tilt', -0.5, 0.5, 0.12)] },
  mandrake: { label: 'Mandrake', series: 'angeli', anchored: true, note: 'The shell germinates: leaves and buds', genes: [i('leaves', 'Leaves', 1, 9, 5), f('len', 'Length', 0.5, 1.7, 1.1), i('buds', 'Buds', 0, 2, 2), e('ink', 'Colour role', INKS, 'blu', { bias: 0.7 })] },
  roots: { label: 'Roots', series: 'angeli', anchored: true, note: 'Roots instead of feet', genes: [i('count', 'Roots', 2, 10, 6), f('len', 'Length', 0.5, 1.9, 1.2), f('curl', 'Curl', 0, 0.9, 0.35)] },
  parapodia: { label: 'Sea-angel lobes', series: 'angeli', anchored: true, note: 'Two swimming lobes (Clione)', genes: [f('size', 'Lobe size', 0.5, 1.6, 1), f('y', 'Height', -0.7, 0.3, -0.25), e('ink', 'Colour role', INKS, 'blu', { bias: 0.7 })] },
  monstrance: { label: 'Monstrance', series: 'angeli', note: 'Sunburst reliquary on a stem', genes: [f('r', 'Radius', 1.1, 2, 1.55), i('rays', 'Rays', 8, 64, 40), f('stem', 'Stem', 0.7, 1.9, 1.3)] },
  plinth: { label: 'Plinth', series: 'angeli', anchored: true, note: 'Toy-on-a-base pedestal', genes: [f('r', 'Radius', 0.5, 1.4, 0.9), f('h', 'Height', 0.08, 0.5, 0.18)] },
  seeds: { label: 'Falling seeds', series: 'angeli', note: 'Glowing seeds raining down', genes: [i('count', 'Seeds', 1, 16, 7), f('h', 'Height', 1.4, 3.4, 2.4), f('spread', 'Spread', 0.6, 2.6, 1.6)] },
  banner: { label: 'Banner', series: 'collettivo', anchored: true, note: 'A flag on a pole', genes: [f('w', 'Width', 0.5, 1.7, 1.1), f('h', 'Height', 0.3, 1, 0.6), f('pole', 'Pole', 0.8, 2.6, 1.6), e('inkName', 'Colour role', INKS, 'rosso', { bias: 0.7 }), e('at', 'On', ['apex', 'head', 'clawR'], 'apex')] },
  tatlin: { label: 'Tatlin tower', series: 'collettivo', note: 'The leaning double spiral', genes: [f('h', 'Height', 2.2, 4.6, 3.4), f('turns', 'Turns', 1.2, 3.6, 2.4), f('lean', 'Lean', 0.1, 0.65, 0.42), f('r0', 'Radius', 0.8, 1.7, 1.25)] },
  wedge: { label: 'Red wedge', series: 'collettivo', note: 'Beat the whites with the red wedge', genes: [f('len', 'Length', 1.6, 3.6, 2.6), f('disc', 'Disc', 0.6, 1.5, 1.05)] },
  tribune: { label: 'Tribune', series: 'collettivo', note: 'Lenin tribune: a leaning speaker\'s platform', genes: [f('len', 'Length', 2.2, 4.2, 3.2), f('ang', 'Angle', 0.5, 1.05, 0.85)] },
  chain: { label: 'Vacancy chain', series: 'collettivo', hides: true, note: 'Crabs queueing to swap shells by size', genes: [i('n', 'Crabs', 2, 9, 5), f('period', 'Period', 1.8, 5.5, 3.2), f('s0', 'Smallest', 0.2, 0.5, 0.32), f('s1', 'Largest', 0.5, 1, 0.78), f('gap', 'Gap', 0.8, 1.7, 1.25)] },
  commune: { label: 'House commune', series: 'collettivo', hides: true, note: 'Many crabs share one great shell', genes: [i('tenants', 'Tenants', 2, 10, 6), f('size', 'Size', 2.2, 4.2, 3.2)] },
  scales: { label: 'Scales', series: 'collettivo', anchored: true, note: 'A balance held in the claws', genes: [f('beam', 'Beam', 1.6, 3.4, 2.6), f('post', 'Post', 0.4, 1.3, 0.8)] },
  prop: { label: 'Held item', series: 'banca', anchored: true, note: 'What this spirit offers the time bank: a tool, a clock, a key', genes: [e('item', 'Item', ITEMS, 'hourglass'), e('at', 'Where', ['clawR', 'clawL', 'head'], 'clawR')] },
  orbit: { label: 'Orbiting hours', series: 'banca', note: 'Coins, hourglasses or keys circling the figure: time in circulation', genes: [e('item', 'Item', ITEMS, 'coin'), i('count', 'Count', 2, 12, 6), f('r', 'Radius', 1, 2.8, 1.6), f('speed', 'Speed', 0, 1.2, 0.4), f('tilt', 'Tilt', -0.8, 0.8, 0.25), f('itemSize', 'Item size', 0.4, 1.4, 0.8)] },
  ring: { label: 'Internationale', series: 'collettivo', hides: true, note: 'A ring of crabs around a globe', genes: [i('n', 'Crabs', 3, 9, 6), f('r', 'Radius', 1.3, 2.7, 1.95), f('globe', 'Globe', 0.3, 0.9, 0.55), f('speed', 'Speed', 0, 0.9, 0.35), f('scale', 'Crab scale', 0.3, 0.7, 0.48)] },
};
export const partGenes = (type) => [...(PARTS[type]?.genes || []), ...MOVE];

// ---------- paths ----------
export const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
export function set(o, p, v) {
  const ks = p.split('.'), last = ks.pop();
  const parent = ks.reduce((a, k, n) => { if (a[k] == null || typeof a[k] !== 'object') a[k] = /^\d+$/.test(ks[n + 1] ?? last) ? [] : {}; return a[k]; }, o);
  parent[last] = v;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

// spec stores "no shell" / "no claws" as host.shell === false; the editor shows a bool gene
function readGene(spec, g) {
  if (g.key === 'host.shell.on') return spec.host?.shell !== false;
  if (g.key === 'host.claws.on') return spec.host?.claws !== false;
  if (g.key.startsWith('host.shell.') && spec.host?.shell === false) return g.def;
  if (g.key.startsWith('host.claws.') && spec.host?.claws === false) return g.def;
  const v = get(spec, g.key);
  return v === undefined ? g.def : v;
}
function writeGene(spec, g, v) {
  if (g.key === 'host.shell.on' || g.key === 'host.claws.on') {
    const k = g.key.split('.')[1];
    spec.host ||= {};
    if (!v) spec.host[k] = false; else if (spec.host[k] === false) spec.host[k] = {};
    return;
  }
  const k = g.key.split('.')[1];
  if ((k === 'shell' || k === 'claws') && g.key.startsWith('host.') && spec.host?.[k] === false) return;
  set(spec, g.key, v);
}
export const readPart = (p, g) => { const v = get(p, g.key); return v === undefined ? g.def : v; };

// every gene of a spec, flattened: [{ id, gene, value, part? }]
export function genes(spec) {
  const out = [];
  for (const grp of anatomyOf(spec)) for (const g of grp.genes) out.push({ id: g.key, gene: g, value: readGene(spec, g), group: grp.id });
  (spec.parts || []).forEach((p, n) => partGenes(p.type).forEach(g => out.push({ id: `parts.${n}.${g.key}`, gene: g, value: readPart(p, g), group: `part:${n}`, part: n })));
  return out;
}
export function setGene(spec, id, v) {
  const m = id.match(/^parts\.(\d+)\.(.+)$/);
  if (m) { set(spec.parts[+m[1]], m[2], v); return spec; }
  const g = ALL_GENES.find(x => x.key === id);
  if (g) writeGene(spec, g, v); else set(spec, id, v);
  return spec;
}
const num = (v, def) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : def);
const clampGene = (g, v) => {
  if (g.type === 'int') return Math.round(Math.min(g.max, Math.max(g.min, v)));
  if (g.type === 'float') return +Math.min(g.max, Math.max(g.min, v)).toFixed(3);
  return v;
};

// ---------- new parts ----------
export function newPart(type) {
  const p = { type };
  for (const g of PARTS[type].genes) set(p, g.key, g.def);
  return p;
}

// ---------- generators ----------
const gauss = (R) => { const u = 1 - R.next(), v = R.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function rollGene(g, R, from, amt) {
  if (g.type === 'bool') return from === undefined || R.next() < amt * 0.25 ? R.next() < 0.75 : from;
  if (g.type === 'enum') {
    if (from !== undefined && R.next() >= amt * 0.3) return from;
    return g.bias && R.next() < g.bias ? (from ?? g.def) : R.pick(g.options);
  }
  if (from === undefined) return clampGene(g, g.min + R.next() * (g.max - g.min));
  return clampGene(g, from + gauss(R) * amt * 0.35 * (g.max - g.min));
}
const locked = (locks, id) => locks && (locks.has(id) || [...locks].some(l => l.endsWith('*') && id.startsWith(l.slice(0, -1))));

function mutatePalette(P, R, amt) {
  const out = clone(P);
  const dh = gauss(R) * amt * 60;
  for (const r of ROLES) {
    if (r === 'line' || r === 'light') continue;
    const [L, C, h] = toOklch(out[r].color);
    const nL = Math.min(0.95, Math.max(0.15, L + gauss(R) * amt * 0.08));
    out[r].color = oklch(nL, C, h + dh);
    if (R.next() < amt * 0.2) out[r].finish = R.pick(FINISHES);
  }
  return out;
}

export function randomPalette(R) {
  return harmony(R.range(0, 360), R.pick(Object.keys(SCHEMES)), R.pick(Object.keys(STYLES)));
}

// mutate(spec, seed, amount 0..1, locks) -> a child that remembers its parent
export function mutate(spec, seed, amount = 0.5, locks) {
  const R = rng(seed * 7919 + 13), out = clone(spec);
  for (const { id, gene, value } of genes(spec)) {
    if (locked(locks, id) || gene.common || gene.fixed) continue;
    if (R.next() > 0.35 + amount * 0.6) continue; // not every gene moves
    setGene(out, id, rollGene(gene, R, value, amount));
  }
  // apparatus: sometimes graft a part, sometimes drop one
  if (!locked(locks, 'parts.*')) {
    out.parts ||= [];
    if (R.next() < amount * 0.45) { const t = R.pick(Object.keys(PARTS).filter(t => !PARTS[t].hides && !PARTS[t].wraps)); if (!out.parts.some(p => p.type === t)) out.parts.push(newPart(t)); }
    if (out.parts.length > 1 && R.next() < amount * 0.25) out.parts.splice(R.int(0, out.parts.length - 1), 1);
  }
  if (!locked(locks, 'palette') && R.next() < 0.3 + amount * 0.5) out.palette = mutatePalette(withPalette(spec.palette), R, amount);
  out.seed = seed; out.parent = spec.id; out.seed_of = spec.id;
  out.id = `${spec.id}-s${seed}`; out.name = `${spec.name} · ${seed}`;
  return out;
}

// randomize(seed, locks, base) -> a whole new character (locked genes kept from base)
export function randomize(seed, locks, base = {}) {
  const R = rng(seed * 104729 + 7);
  // pick an archetype (unless the body plan is locked), then vary about half of its genes
  const key = locked(locks, 'plan') ? (base.plan === 'figure' ? R.pick(Object.keys(ARCHETYPES).filter(k => k !== 'crab')) : 'crab')
    : R.pick(Object.keys(ARCHETYPES));
  const out = applyArchetype(base, key);
  if (locked(locks, 'plan')) out.plan = base.plan || 'crab';
  for (const grp of anatomyOf(out)) for (const g of grp.genes) {
    if (g.fixed) continue;
    if (locked(locks, g.key)) { writeGene(out, g, readGene(base, g)); continue; }
    if (key === 'crab' || R.next() < 0.45) writeGene(out, g, rollGene(g, R));
  }
  if (!locked(locks, 'parts.*')) {
    const pool = Object.keys(PARTS).filter(t => !PARTS[t].wraps && (out.plan !== 'figure' || !PARTS[t].hides));
    out.parts = [];
    if (out.plan === 'figure' && R.next() < 0.65) { const p = newPart('prop'); p.item = R.pick(ITEMS); out.parts.push(p); }
    const n = R.int(out.plan === 'figure' ? 0 : 1, 2);
    for (let k = 0; k < n; k++) {
      const t = R.pick(pool); if (out.parts.some(p => p.type === t) || (PARTS[t].hides && out.parts.some(p => PARTS[p.type].hides))) continue;
      const p = { type: t }; PARTS[t].genes.forEach(g => set(p, g.key, rollGene(g, R))); out.parts.push(p);
    }
  }
  if (!locked(locks, 'palette')) out.palette = randomPalette(R);
  out.seed = seed;
  out.id = base.id && locked(locks, 'id') ? base.id : `nuovo-${seed}`;
  out.name = base.name && locked(locks, 'id') ? base.name : `Nuovo ${seed}`;
  return out;
}

// blend(specs, weights) -> numeric genes mixed by weight, discrete genes from the strongest parent,
// parts: the strongest parent's apparatus, each blended with same-type parts of the others
export function blend(specs, weights) {
  const W = weights.map(w => Math.max(0, w)), sum = W.reduce((a, c) => a + c, 0) || 1, w = W.map(x => x / sum);
  const top = w.indexOf(Math.max(...w)), out = clone(specs[top]);
  // body genes mix only between parents of the same body plan as the strongest one
  const plan = (s) => s.plan || 'crab', ws = specs.map((s, k) => (plan(s) === plan(specs[top]) ? w[k] : 0)), wsum = ws.reduce((a, c) => a + c, 0) || 1;
  for (const grp of anatomyOf(specs[top])) for (const g of grp.genes) {
    const vals = specs.map(s => readGene(s, g));
    writeGene(out, g, g.type === 'float' || g.type === 'int' ? clampGene(g, vals.reduce((a, v, k) => a + v * ws[k] / wsum, 0)) : vals[top]);
  }
  out.parts = (specs[top].parts || []).map(p => {
    const q = clone(p);
    for (const g of partGenes(p.type)) {
      if (g.type !== 'float' && g.type !== 'int') continue;
      let acc = 0, ws = 0;
      specs.forEach((s, k) => { const o = (s.parts || []).find(x => x.type === p.type); if (o) { acc += readPart(o, g) * w[k]; ws += w[k]; } });
      if (ws > 0) set(q, g.key, clampGene(g, acc / ws));
    }
    return q;
  });
  const P = specs.map(s => withPalette(s.palette));
  out.palette = clone(P[top]);
  for (const r of ROLES) {
    let c = P[0][r].color, acc = w[0];
    for (let k = 1; k < P.length; k++) { acc += w[k]; c = mixHex(c, P[k][r].color, acc > 0 ? w[k] / acc : 0); }
    out.palette[r].color = c;
  }
  out.id = `blend-${specs.map(s => s.id).join('-')}`.slice(0, 60);
  out.name = specs.map(s => s.name).join(' × ');
  out.parent = specs[top].id; delete out.seed_of;
  return out;
}

// A genome as a point in "design space": body genes normalised to 0..1, the set of part types, and the
// palette in OKLab. Computed once per genome, so comparing many candidates stays cheap.
function features(spec) {
  const body = [];
  for (const grp of anatomyOf(spec)) for (const g of grp.genes) {
    const v = readGene(spec, g);
    body.push(g.type === 'float' || g.type === 'int' ? (v - g.min) / (g.max - g.min) : `${v}`);
  }
  const P = withPalette(spec.palette);
  return { plan: spec.plan || 'crab', body, parts: new Set((spec.parts || []).map(p => p.type)), lab: ROLES.map(r => rgbToOklab(hexToRgb(P[r].color))) };
}
function featureDistance(a, b) {
  let d = 0, n = 0;
  if (a.plan !== b.plan) { d += 8; n += 8; }
  else a.body.forEach((x, i) => { const y = b.body[i]; d += typeof x === 'number' ? Math.abs(x - y) : x === y ? 0 : 1; n++; });
  const uni = new Set([...a.parts, ...b.parts]).size, inter = [...a.parts].filter(t => b.parts.has(t)).length;
  d += uni ? (1 - inter / uni) * 4 : 0; n += 4; // two genomes with no parts agree on parts
  d += a.lab.reduce((s, A, i) => s + Math.hypot(A[0] - b.lab[i][0], A[1] - b.lab[i][1], A[2] - b.lab[i][2]), 0) * 2; n += 2;
  return d / n;
}
// distance between two genomes, 0 (same) .. ~1
export const distance = (a, b) => featureDistance(features(a), features(b));

// breed(spec, seed, count, amount, locks): many mutants, then the `count` most spread out
// (greedy farthest-point sampling: a local design gallery around the current character)
export function breed(spec, seed, count = 8, amount = 0.5, locks) {
  const pool = Array.from({ length: count * 5 }, (_, k) => mutate(spec, seed * 100 + k, amount, locks));
  const F = pool.map(features), parent = features(spec);
  // each candidate's distance to the nearest already-picked genome (the parent counts as picked)
  const near = F.map(f => featureDistance(parent, f));
  const picked = [];
  while (picked.length < Math.min(count, pool.length)) {
    let best = -1;
    near.forEach((d, i) => { if (d >= 0 && (best < 0 || d > near[best])) best = i; });
    picked.push(pool[best]); near[best] = -1;
    near.forEach((d, i) => { if (d >= 0) near[i] = Math.min(d, featureDistance(F[best], F[i])); });
  }
  return picked;
}

// ---------- defaults and validation ----------
export function withDefaults(spec) {
  const out = clone(spec);
  out.palette = { ...clone(CLASSIC), ...(out.palette || {}) };
  for (const r of ROLES) out.palette[r] = { ...CLASSIC[r], ...(spec.palette?.[r] || {}) };
  return out;
}
// clamp every gene into range and drop unknown parts (used on anything that comes from outside, e.g. the LLM)
export function validate(spec) {
  const out = clone(spec || {});
  out.id = String(out.id || 'nuovo').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'nuovo';
  out.name = String(out.name || out.id);
  out.plan = out.plan === 'figure' ? 'figure' : 'crab';
  for (const grp of anatomyOf(out)) for (const g of grp.genes) {
    const v = readGene(out, g);
    writeGene(out, g, g.type === 'enum' ? (g.options.includes(v) ? v : g.def) : g.type === 'bool' ? !!v : clampGene(g, num(v, g.def)));
  }
  out.parts = (out.parts || []).filter(p => PARTS[p?.type]).map(p => {
    const q = { type: p.type };
    for (const g of partGenes(p.type)) {
      const v = readPart(p, g);
      if (g.common && v === g.def) continue;
      set(q, g.key, g.type === 'enum' ? (g.options.includes(v) ? v : g.def) : g.type === 'bool' ? !!v : clampGene(g, num(v, g.def)));
    }
    return q;
  });
  if (out.palette) for (const r of ROLES) {
    const R = out.palette[r]; if (!R) continue;
    if (!/^#[0-9a-f]{6}$/i.test(R.color || '')) R.color = CLASSIC[r].color;
    if (!FINISHES.includes(R.finish)) R.finish = CLASSIC[r].finish;
    if (!PRINT_INKS.includes(R.print)) R.print = CLASSIC[r].print;
  }
  return out;
}

// The schema as plain data, for the text → character generator's prompt.
export function describeSchema() {
  const g = (x) => x.type === 'enum' ? `${x.key}: one of ${x.options.join('|')} (default ${x.def})` : x.type === 'bool' ? `${x.key}: boolean (default ${x.def})` : `${x.key}: ${x.type} ${x.min}..${x.max} (default ${x.def})`;
  return [
    'BODY PLAN: "plan": "crab" (the hermit crab, genes under "host") or "figure" (modular body under "figure": spirits, Y2K blobs, chibi humanoids, object-spirits, uncanny beings).',
    'ARCHETYPES (good starting points): ' + Object.entries(ARCHETYPES).map(([k, a]) => `${k} = ${a.note}${a.spec.figure ? ' ' + JSON.stringify(a.spec.figure) : ''}`).join(' | '),
    'FIGURE genes (plan "figure"):',
    ...FIGURE.map(a => `  ${a.label}: ` + a.genes.map(g).join('; ')),
    'CRAB genes (plan "crab"; host.shell.on=false is written as "shell": false, same for claws):',
    ...ANATOMY.map(a => `  ${a.label}: ` + a.genes.map(g).join('; ')),
    'PARTS (each part is an object {"type": ..., params}; optional "move": [x,y,z] offset and "size" multiplier):',
    ...Object.entries(PARTS).map(([t, p]) => `  ${t} — ${p.note}${p.hides ? ' (replaces the single crab with several)' : ''}: ` + p.genes.map(g).join('; ')),
    `PALETTE: {"palette": {role: {"color": "#rrggbb", "finish": ${FINISHES.join('|')}, "print": ${PRINT_INKS.join('|')}}}} for roles ${ROLES.join(', ')}.`,
    'Colour role genes say which palette role a part paints with: blu=primary, toner=shell/dark (line for fine detail), fluo=accent, rosso=secondary, paper=light.',
  ].join('\n');
}

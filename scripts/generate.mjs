// Text → character: Claude writes a genome under engine/schema.js, then validate() clamps it.
//   npm run generate -- "a sleepy chrome hermit crab bishop with a tower for a shell"
// Writes characters/drafts/<id>.json. Also used by the studio (POST /api/generate on the dev server).
// Needs `npm install` (the Anthropic SDK is the project's only, optional, dependency) and credentials
// (ANTHROPIC_API_KEY, or an `ant auth login` profile).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSchema, validate, withDefaults } from '../engine/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'claude-opus-5-5';

const SYSTEM = `You design characters for Time Bank Spirit, a cast of hermit crabs (a host living in a borrowed shell)
rendered as 90s pre-rendered CGI mascots. A character is a JSON genome. Parts of the "apparatus" (halos, wings,
towers, chains, crowns...) are what make each one a character; the crab is the host.

Style rules (briefs/y2k-style.md): the eyes are the logo; primitives, sculpted; one strong silhouette; no text on the image;
a palette of six roles with finishes (candy plastic, chrome, gel, iridescent, pearl, matte...). Use any colours that
serve the idea, chosen as a harmony (complementary, triadic, analogous...), not at random.

Schema:
${describeSchema()}

Answer with ONE JSON object and nothing else: {"id": kebab-case, "name": short display name, "concept": one or two sentences,
"refs": [real references], "expression", "pose", "host", "parts": [...], "palette": {...}}. Use 1 to 4 parts.
Only use keys from the schema; stay inside every range.`;

let client = null;
async function anthropic() {
  if (client) return client;
  let Anthropic;
  try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); }
  catch { throw new Error('The Anthropic SDK is not installed: run `npm install` in the project folder.'); }
  client = new Anthropic();
  return client;
}

// generate(prompt, base?) -> validated spec. With `base`, Claude edits that character instead of starting over.
export async function generate(prompt, base) {
  const c = await anthropic();
  const user = base
    ? `Current character:\n${JSON.stringify(withDefaults(base))}\n\nChange it: ${prompt}\nKeep what the request does not touch.`
    : `Design a character: ${prompt}`;
  const res = await c.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') throw new Error(`Claude declined this request${res.stop_details?.explanation ? `: ${res.stop_details.explanation}` : '.'}`);
  if (res.stop_reason === 'max_tokens') throw new Error('The answer was cut off; try a shorter description.');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let spec;
  try { spec = JSON.parse(json); } catch { throw new Error('Claude did not return a JSON character. Try again.'); }
  const out = validate(spec);
  out.prompt = prompt;
  if (base) out.parent = base.id;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv.slice(2).join(' ').trim();
  if (!prompt) { console.error('usage: npm run generate -- "description of the character"'); process.exit(1); }
  try {
    const spec = await generate(prompt);
    const file = path.join(ROOT, 'characters', 'drafts', `${spec.id}.json`);
    fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
    console.log(`wrote ${path.relative(ROOT, file)}: ${spec.name}`);
  } catch (e) {
    if (e?.constructor?.name === 'AuthenticationError' || /authentication method|api key/i.test(e.message)) console.error('No valid Anthropic credentials: set ANTHROPIC_API_KEY or run `ant auth login`.');
    else console.error(e.message);
    process.exit(1);
  }
}

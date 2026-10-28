// Builds potions/catalog.json and the catalog table in README.md from the files in
// potions/. Run it after adding or changing a potion:
//
//   node scripts/build-catalog.mjs
//
// Each potion file is a normal Web Potions export holding one potion, so it can also
// be imported by hand from the settings page.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const ctx = { crypto, console };
ctx.self = ctx;
vm.createContext(ctx);
for (const lib of ['match', 'brew', 'share']) vm.runInContext(readFileSync(`${root}extension/lib/${lib}.js`, 'utf8'), ctx);
const { share } = ctx.WP;

const fail = (path, why) => {
  console.error(`${path}: ${why}`);
  process.exit(1);
};

// Keys in reading order; repeat, delay and world only when they differ from the default.
function tidy(p) {
  const out = { id: p.id, name: p.name, description: p.description, sites: p.sites, ingredients: p.ingredients, css: p.css, js: p.js };
  if (p.repeat) out.repeat = p.repeat;
  if (p.delay) out.delay = p.delay;
  if (p.world === 'MAIN') out.world = 'MAIN';
  return out;
}

const potions = readdirSync(`${root}potions`)
  .filter((f) => f.endsWith('.potion.json'))
  .map((file) => {
    const text = readFileSync(`${root}potions/${file}`, 'utf8');
    const raw = JSON.parse(text).potions;
    let parsed;
    try {
      parsed = share.parse(text);
    } catch (e) {
      fail(`potions/${file}`, e.message);
    }
    if (parsed.length !== 1) fail(`potions/${file}`, 'should hold exactly one potion');
    const p = parsed[0];
    if (!/^wp-[a-z0-9-]+$/.test(raw[0].id || '')) fail(`potions/${file}`, 'needs an id like "wp-short-name"');
    if (!p.description) fail(`potions/${file}`, 'needs a description');
    if (p.ingredients.length !== (raw[0].ingredients || []).length) fail(`potions/${file}`, 'has an ingredient Web Potions does not understand');
    const potion = tidy(p);
    writeFileSync(`${root}potions/${file}`, JSON.stringify({ webPotions: 1, potions: [potion] }, null, 2) + '\n');
    return { file, potion };
  })
  // Potions for particular sites first, then the ones you drink anywhere.
  .sort((a, b) => !a.potion.sites.length - !b.potion.sites.length || a.potion.name.localeCompare(b.potion.name));

const ids = new Set();
for (const { file, potion } of potions) {
  if (ids.has(potion.id)) fail(`potions/${file}`, `repeats the id ${potion.id}`);
  ids.add(potion.id);
}

writeFileSync(`${root}potions/catalog.json`, JSON.stringify({ webPotions: 1, potions: potions.map((x) => x.potion) }, null, 2) + '\n');

const where = (p) => (p.sites.length ? p.sites.map((s) => s.replace(/^\*\./, '').replace(/\/\*$/, '')).join(', ') : 'Any page, when you drink it');
const table = [
  '| Potion | Works on | What it does |',
  '| --- | --- | --- |',
  ...potions.map(({ file, potion: p }) => `| [${p.name}](potions/${file}) | ${where(p)} | ${p.description.replace(/\|/g, '\\|')} |`),
].join('\n');

const readme = readFileSync(`${root}README.md`, 'utf8');
const marked = /(<!-- catalog:start -->)[\s\S]*?(<!-- catalog:end -->)/;
if (!marked.test(readme)) fail('README.md', 'is missing the <!-- catalog:start --> and <!-- catalog:end --> markers');
writeFileSync(`${root}README.md`, readme.replace(marked, `$1\n${table}\n$2`));

console.log(`${potions.length} potions → potions/catalog.json and README.md`);

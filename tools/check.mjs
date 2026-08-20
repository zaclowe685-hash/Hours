/* HOURS — tools/check.mjs
   Static checks that catch the two things that break a no-build app silently:
   an import that points at a file that isn't there, and a service-worker
   cache list that has drifted away from the real files.

   Run:  node tools/check.mjs      (from ~/hours)
*/
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
let problems = 0;
const fail = m => { console.error('  ✗ ' + m); problems++; };
const ok = m => console.log('  ✓ ' + m);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/* 1. every import resolves */
console.log('imports');
const files = walk(join(ROOT, 'js'));
let importCount = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const re = /(?:^|\n)\s*import\s+[^'"]*from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2];
    if (!spec.startsWith('.')) continue;
    importCount++;
    const target = resolve(dirname(file), spec);
    if (!existsSync(target)) fail(`${relative(ROOT, file)} imports ${spec} — no such file`);
  }
}
if (!problems) ok(`${importCount} imports across ${files.length} modules all resolve`);

/* 2. the service worker caches files that exist */
console.log('service worker');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const shell = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [])[1] || '';
const listed = [...shell.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(p => !p.startsWith('http') && p !== './');
let missing = 0;
for (const p of listed) {
  if (!existsSync(join(ROOT, p))) { fail(`sw.js caches ${p} — no such file`); missing++; }
}
if (!missing) ok(`${listed.length} cached shell files all exist`);

/* every js module should be in the shell list, or it won't work offline */
for (const file of files) {
  const rel = relative(ROOT, file);
  if (!listed.includes(rel)) fail(`${rel} is not in the sw.js SHELL list — it will not work offline`);
}

/* 3. index.html references real files */
console.log('index.html');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const p = m[1];
  if (p.startsWith('http') || p.startsWith('#') || p.startsWith('data:')) continue;
  if (!existsSync(join(ROOT, p))) fail(`index.html points at ${p} — no such file`);
}
if (!problems) ok('every local file it links exists');

/* 4. the palette is the only source of colour in the CSS */
console.log('palette');
const theme = readFileSync(join(ROOT, 'css/theme.css'), 'utf8');
const allowed = new Set([...theme.matchAll(/#[0-9A-Fa-f]{6}/g)].map(m => m[0].toUpperCase()));
for (const cssFile of ['css/app.css', 'css/reset.css']) {
  const css = readFileSync(join(ROOT, cssFile), 'utf8');
  for (const m of css.matchAll(/#[0-9A-Fa-f]{6}/g)) {
    if (!allowed.has(m[0].toUpperCase())) fail(`${cssFile} uses ${m[0]}, which is not in the palette`);
  }
}
if (!problems) ok('no stray colours outside theme.css');

console.log(problems ? `\n${problems} problem(s)` : '\nall good');
process.exit(problems ? 1 : 0);

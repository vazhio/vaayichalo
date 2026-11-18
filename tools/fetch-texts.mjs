// Downloads the texts listed in content/manifest.json from Malayalam Wikisource,
// cleans them exactly the way they were checked in the browser, verifies each one
// against the recorded SHA-256 prefix, and writes content/texts/<id>.txt.
// Texts that already exist are left alone, so hand-edited files are never overwritten.
//
// Run:  cd tools && npm install jsdom && cd .. && node tools/fetch-texts.mjs
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('./package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const API = 'https://ml.wikisource.org/w/api.php?action=parse&format=json&prop=text&disableeditsection=1&page=';
const UA = 'aayiram-raavukal-reading-site/1.0 (GitHub Actions; public-domain text fetch)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getText(title) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(API + encodeURIComponent(title), { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!j.parse) return '';
      const d = new JSDOM(j.parse.text['*']).window.document;
      d.querySelectorAll('#headertemplate, .ws-noexport, .noprint, style, script, .mw-references-wrap, sup.reference, .pagenum, .ws-pagenum, figure, .mediaContainer, audio, [role=navigation], .navbox, #toc, .toc').forEach(e => e.remove());
      d.querySelectorAll('table').forEach(t => { if (!/[ഀ-ൿ]{20}/.test(t.textContent) || t.querySelector('#headertemplate')) t.remove(); });
      return (d.body.innerText ?? d.body.textContent).replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(1500 * attempt);
    }
  }
}

function clean(text, o = {}) {
  let L = text.split('\n');
  const i = L.findIndex(l => /^This box:/.test(l.trim()));
  if (i >= 0) L = L.slice(i + 1);
  L = L.filter(l => !/എന്ന (കവിതാ)?സമാഹാരത്തിൽ നിന്ന്\s*$/.test(l));
  while (L.length && (L[0].trim() === '' || /^ഇംഗ്ലീഷ് വിലാസം/.test(L[0].trim()) || /^https?:\/\//.test(L[0].trim()))) L.shift();
  const j = L.findIndex(l => { const t = l.trim(); return t === 'പുറം കണ്ണികൾ' || t === 'കുറിപ്പുകൾ' || /എന്ന സമാഹാരത്തിലെ മറ്റു കവിതകൾ/.test(t) || /^↑/.test(t); });
  if (j >= 0) L = L.slice(0, j);
  let s = L.join('\n').replace(/\[\s*\d+\s*\]\s?/g, '');
  if (o.start) { const k = s.indexOf(o.start); if (k < 0) throw new Error('start not found: ' + o.start); s = s.slice(k); }
  if (o.end) { const k = s.indexOf(o.end); if (k < 0) throw new Error('end not found: ' + o.end); s = s.slice(0, k + o.end.length); }
  if (o.prose) { const M = s.split('\n'); while (M.length && M[0].trim().length < 60) M.shift(); s = M.join('\n'); }
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function splitPart(s, k, n) {
  const L = s.split('\n'); const ends = []; let pos = 0;
  for (let i = 0; i < L.length; i++) { pos += L[i].length + 1; if (L[i].trim() !== '') ends.push([i, pos]); }
  const cuts = [];
  for (let q = 1; q < n; q++) {
    const tgt = s.length * q / n; let best = null;
    for (const [i, p] of ends) {
      if (cuts.length && i <= cuts[cuts.length - 1]) continue;
      if (best === null || Math.abs(p - tgt) < Math.abs(best[1] - tgt)) best = [i, p];
    }
    cuts.push(best[0]);
  }
  const b = [-1, ...cuts, L.length - 1];
  return L.slice(b[k - 1] + 1, b[k] + 1).join('\n').trim();
}

const exists = p => access(p).then(() => true, () => false);
const manifest = JSON.parse(await readFile('content/manifest.json', 'utf8'));
const pageCache = new Map();
const report = { checked: new Date().toISOString(), written: [], skipped: [], mismatched: [], failed: [] };

for (const m of manifest) {
  const file = `content/texts/${m.id}.txt`;
  if (await exists(file)) { report.skipped.push(m.id); continue; }
  try {
    const { part, ...o } = m.opts || {};
    const parts = [];
    for (const p of m.pages) {
      if (!pageCache.has(p)) { pageCache.set(p, await getText(p)); await sleep(300); }
      parts.push(clean(pageCache.get(p), o));
    }
    let body = parts.join('\n\n');
    if (part) body = splitPart(body, ...part);
    const hash = createHash('sha256').update(body, 'utf8').digest('hex');
    const ok = hash.startsWith(m.sha256);
    if (!ok) report.mismatched.push({ id: m.id, expected: m.sha256, got: hash.slice(0, 16), chars: body.length, expectedChars: m.chars });
    const src = m.pages[0].split('/')[0];
    const head = [
      `type: ${m.type}`, `title: ${m.title}`, `author: ${m.author}`, `year: ${m.year || ''}`, `author_died: ${m.author_died}`,
      `source: മലയാളം വിക്കിഗ്രന്ഥശാല (${m.source || src})`,
      `source_url: https://ml.wikisource.org/wiki/${m.pages[0].replace(/ /g, '_')}`,
      ...(m.note ? [`note: ${m.note}`] : []),
    ];
    await writeFile(file, head.join('\n') + '\n---\n' + body + '\n', 'utf8');
    report.written.push(m.id + (ok ? '' : ' (HASH MISMATCH)'));
  } catch (e) {
    report.failed.push({ id: m.id, error: String(e.message || e) });
  }
}

await writeFile('tools/fetch-report.json', JSON.stringify(report, null, 1) + '\n');
console.log(`written ${report.written.length}, skipped ${report.skipped.length}, mismatched ${report.mismatched.length}, failed ${report.failed.length}`);
if (report.mismatched.length) console.log('Mismatched:', JSON.stringify(report.mismatched));
if (report.failed.length) { console.log('Failed:', JSON.stringify(report.failed)); process.exitCode = 1; }

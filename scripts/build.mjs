// Build one folder + zip per platform: node scripts/build.mjs [youtube|crazygames|web ...]
// Each build swaps the importmap "platform" entry and inserts that platform's SDK <script> before any game
// code, then checks the YouTube Playables limits (initial ≤30 MiB, aim ≤15; each file ≤30 MiB; total ≤250 MiB)
// and that the code makes no network calls outside the platform SDK.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const MiB = 1024 * 1024;

const TARGETS = {
  youtube: {
    adapter: './src/platform/youtube.js',
    sdk: '<script src="https://www.youtube.com/game_api/v1"></script>',
    drop: ['src/platform/crazygames.js'],
    allowedHosts: ['www.youtube.com'],
  },
  crazygames: {
    adapter: './src/platform/crazygames.js',
    sdk: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
    drop: ['src/platform/youtube.js'],
    allowedHosts: ['sdk.crazygames.com'],
  },
  web: {
    adapter: './src/platform/local.js',
    sdk: '',
    drop: ['src/platform/youtube.js', 'src/platform/crazygames.js'],
    allowedHosts: [],
  },
};

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function stripComments(code, ext) {
  if (ext === '.html') return code.replace(/<!--[\s\S]*?-->/g, '');
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1'))
    .join('\n');
}

/** Absolute URLs in our own code (vendor three.js only has doc links in warning strings). */
function findHosts(dir) {
  const hosts = new Map();
  for (const rel of walk(dir)) {
    const ext = path.extname(rel);
    if (!['.html', '.js', '.css'].includes(ext) || rel.startsWith('vendor/')) continue;
    const code = stripComments(fs.readFileSync(path.join(dir, rel), 'utf8'), ext);
    for (const m of code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const host = m[1].toLowerCase();
      if (host === 'www.w3.org') continue; // XML namespaces, not requests
      if (!hosts.has(host)) hosts.set(host, new Set());
      hosts.get(host).add(rel);
    }
  }
  return hosts;
}

// ------------------------------------------------------------------ zip (deflate, no dependencies)

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipDir(dir, outFile) {
  const files = walk(dir).sort();
  const locals = [];
  const central = [];
  let offset = 0;
  for (const rel of files) {
    const data = fs.readFileSync(path.join(dir, rel));
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const name = Buffer.from(rel, 'utf8');
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(useDeflate ? 8 : 0, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(0x21, 12); // 1980-01-01
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(head, name, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(useDeflate ? 8 : 0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += head.length + name.length + body.length;
  }
  const cenSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenSize, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(outFile, Buffer.concat([...locals, ...central, end]));
  return fs.statSync(outFile).size;
}

// ------------------------------------------------------------------ build

function build(name) {
  const t = TARGETS[name];
  if (!t) throw new Error(`Unknown target "${name}". Use: ${Object.keys(TARGETS).join(', ')}`);
  const out = path.join(DIST, name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(SRC, out, { recursive: true });
  for (const rel of t.drop) fs.rmSync(path.join(out, rel), { force: true });

  const htmlPath = path.join(out, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const before = html;
  html = html.replace('"platform": "./src/platform/local.js"', `"platform": "${t.adapter}"`);
  html = html.replace(/<!-- PLATFORM_SDK[\s\S]*?-->/, t.sdk);
  if (html === before && name !== 'web') throw new Error('index.html markers not found (importmap platform entry / PLATFORM_SDK comment)');
  fs.writeFileSync(htmlPath, html);

  const problems = [];
  const warnings = [];
  const files = walk(out).map((rel) => ({ rel, size: fs.statSync(path.join(out, rel)).size }));
  const total = files.reduce((n, f) => n + f.size, 0);
  const biggest = [...files].sort((a, b) => b.size - a.size).slice(0, 3);
  for (const f of files) if (f.size > 30 * MiB) problems.push(`${f.rel} is ${(f.size / MiB).toFixed(1)} MiB (max 30 MiB per file)`);
  // Everything is fetched before gameReady, so the whole bundle counts as the initial bundle.
  if (total > 30 * MiB) problems.push(`initial bundle ${(total / MiB).toFixed(1)} MiB (max 30 MiB)`);
  else if (total > 15 * MiB) warnings.push(`initial bundle ${(total / MiB).toFixed(1)} MiB (YouTube recommends ≤15 MiB)`);
  if (total > 250 * MiB) problems.push('total bundle over 250 MiB');
  if (/(src|href)="\//.test(html)) problems.push('index.html uses absolute paths; Playables needs relative paths');

  const hosts = findHosts(out);
  for (const [host, where] of hosts) {
    if (!t.allowedHosts.includes(host)) problems.push(`external URL to ${host} in ${[...where].join(', ')}`);
  }

  const zipSize = zipDir(out, path.join(DIST, `bloom-stack-${name}.zip`));

  console.log(`\n■ ${name}  →  dist/${name}/  +  dist/bloom-stack-${name}.zip`);
  console.log(`  ${files.length} files, ${(total / MiB).toFixed(2)} MiB (zip ${(zipSize / MiB).toFixed(2)} MiB)`);
  console.log(`  largest: ${biggest.map((f) => `${f.rel} ${(f.size / 1024).toFixed(0)} KiB`).join(', ')}`);
  console.log(`  hosts referenced: ${hosts.size ? [...hosts.keys()].join(', ') : 'none'}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const p of problems) console.log(`  ✖ ${p}`);
  if (!problems.length) console.log('  ✔ checks passed');
  return problems.length === 0;
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TARGETS);
fs.mkdirSync(DIST, { recursive: true });
const ok = targets.map(build).every(Boolean);
process.exitCode = ok ? 0 : 1;

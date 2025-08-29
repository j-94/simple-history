#!/usr/bin/env node
// Promote normalized artifacts into lane folders based on frontmatter.
// Usage: node scripts/promote-normalized.mjs [--src artifacts/normalized] [--dest artifacts/lanes] [--max 50] [--move] [--dry-run]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const getFlag = (name, def = undefined) => {
  const i = argv.indexOf(name);
  if (i === -1) return def;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) return true; // boolean flag
  return v;
};

const srcDir = path.resolve(repoRoot, getFlag('--src', 'artifacts/normalized'));
const destBase = path.resolve(repoRoot, getFlag('--dest', 'artifacts/lanes'));
const maxCount = Number(getFlag('--max', '100'));
const doMove = Boolean(getFlag('--move', false));
const dryRun = Boolean(getFlag('--dry-run', false));

function parseFrontmatter(md) {
  if (!md.startsWith('---')) return { fm: {}, body: md };
  const end = md.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: md };
  const fmRaw = md.slice(3, end).trim();
  const body = md.slice(end + 4).trim();
  const fm = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    try { fm[key] = JSON.parse(val); } catch { fm[key] = val.replace(/^"|"$/g,''); }
  }
  return { fm, body };
}

function toSlug(str, max = 60) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, max) || 'artifact';
}

function laneDir(lane) {
  const map = { A: 'a-heuristics', B: 'b-visual', C: 'c-prompts', D: 'd-system-shards', E: 'e-reflections' };
  return map[lane] || map['A'];
}

if (!fs.existsSync(srcDir)) {
  console.error(`Source dir not found: ${srcDir}`);
  process.exit(1);
}

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.md')).slice(0, maxCount);
if (files.length === 0) {
  console.log('No normalized files found.');
  process.exit(0);
}

let promoted = 0;
for (const f of files) {
  const full = path.join(srcDir, f);
  const md = fs.readFileSync(full, 'utf8');
  const { fm } = parseFrontmatter(md);
  const lane = (fm.lane || 'A').replace(/"/g,'');
  const title = fm.title || 'Artifact';
  const slug = toSlug(title);
  const destDir = path.join(destBase, laneDir(lane));
  const destPath = path.join(destDir, `${slug}.md`);

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  if (dryRun) {
    console.log(`[dry-run] ${f} -> ${path.relative(repoRoot, destPath)}`);
    promoted++;
    continue;
  }

  if (doMove) {
    fs.renameSync(full, destPath);
  } else {
    fs.copyFileSync(full, destPath);
  }
  console.log(`${doMove ? 'moved' : 'copied'} ${f} -> ${path.relative(repoRoot, destPath)}`);
  promoted++;
}

console.log(`Done. Promoted ${promoted} file(s).`);


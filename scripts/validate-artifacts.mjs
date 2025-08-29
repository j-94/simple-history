#!/usr/bin/env node
// Validate artifact markdown files for schema and content quality.
// Usage: node scripts/validate-artifacts.mjs [--dir artifacts/normalized] [--strict] [--format json]

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

const targetDir = path.resolve(repoRoot, getFlag('--dir', 'artifacts/normalized'));
const strict = Boolean(getFlag('--strict', false));
const fmt = getFlag('--format', 'human');

const allowedLanes = new Set(['A','B','C','D','E']);
const allowedStatus = new Set(['draft','publish']);
const allowedTargets = new Set(['twitter','github','image','gist']);

function walk(dir) {
  const out = [];
  (function recur(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) recur(p);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
    }
  })(dir);
  return out;
}

function parseFrontmatter(md) {
  if (!md.startsWith('---')) return { fm: {}, body: md.trim() };
  const end = md.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: md.trim() };
  const fmRaw = md.slice(3, end).trim();
  const body = md.slice(end + 4).trim();
  const fm = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2];
    try {
      fm[key] = JSON.parse(val);
    } catch {
      fm[key] = val.replace(/^\"|\"$/g, '');
    }
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

function validateFile(p, text, strictMode) {
  const errs = [];
  const { fm, body } = parseFrontmatter(text);
  const reqKeys = ['title','lane','status','tags','summary','publish_targets'];
  for (const k of reqKeys) if (!(k in fm)) errs.push(`missing frontmatter key: ${k}`);

  const title = String(fm.title || '').trim();
  if (!title) errs.push('title is empty');
  if (title.length > 80) errs.push('title exceeds 80 chars');
  const wordCount = title.split(/\s+/).filter(Boolean).length;
  if (wordCount > 12) errs.push('title exceeds 12 words');
  if (/[`*_[\]<>]/.test(title)) errs.push('title contains markdown characters');

  const lane = String(fm.lane || '').replace(/"/g,'');
  if (!allowedLanes.has(lane)) errs.push(`invalid lane: ${lane}`);

  const status = String(fm.status || '').replace(/"/g,'');
  if (!allowedStatus.has(status)) errs.push(`invalid status: ${status}`);

  const tags = Array.isArray(fm.tags) ? fm.tags : [];
  if (tags.length === 0) errs.push('tags empty');
  if (tags.length > 10) errs.push('too many tags (>10)');
  const badTags = tags.filter(t => !/^[a-z0-9-]{1,30}$/.test(String(t)));
  if (badTags.length) errs.push(`bad tag slugs: ${badTags.join(',')}`);

  const pub = Array.isArray(fm.publish_targets) ? fm.publish_targets : [];
  if (pub.length === 0) errs.push('publish_targets empty');
  const badTargets = pub.filter(t => !allowedTargets.has(String(t)));
  if (badTargets.length) errs.push(`invalid publish_targets: ${badTargets.join(',')}`);

  const summary = String(fm.summary || '').trim();
  if (!summary) errs.push('summary empty');
  if (summary.length > 240) errs.push('summary exceeds 240 chars');

  const bodyLen = (body || '').trim().length;
  if (bodyLen < 20) errs.push('content body too short');
  if (strictMode && bodyLen > 6000) errs.push('content body too long (>6000 chars)');

  return { errors: errs, fm, body };
}

async function main() {
  if (!fs.existsSync(targetDir)) {
    console.error(`Directory not found: ${targetDir}`);
    process.exit(1);
  }
  const files = walk(targetDir);
  const results = [];
  const slugSeen = new Map();

  for (const f of files) {
    const md = fs.readFileSync(f, 'utf8');
    const r = validateFile(f, md, strict);
    const slug = toSlug(r.fm.title || path.basename(f, '.md'));
    if (!slugSeen.has(slug)) slugSeen.set(slug, []);
    slugSeen.get(slug).push(f);
    results.push({ file: f, ...r });
  }

  // Duplicate title slugs detection
  for (const [slug, arr] of slugSeen.entries()) {
    if (arr.length > 1) {
      for (const f of arr) {
        const rr = results.find(x => x.file === f);
        rr.errors.push(`duplicate title slug: ${slug}`);
      }
    }
  }

  const total = results.length;
  const bad = results.filter(r => r.errors.length > 0);
  if (fmt === 'json') {
    console.log(JSON.stringify({ total, invalid: bad.length, results: results.map(r => ({ file: path.relative(repoRoot, r.file), errors: r.errors })) }, null, 2));
  } else {
    for (const r of results) {
      if (r.errors.length) {
        console.log(`ERR ${path.relative(repoRoot, r.file)}\n  - ${r.errors.join('\n  - ')}`);
      } else {
        console.log(`OK  ${path.relative(repoRoot, r.file)}`);
      }
    }
    console.log(`\nChecked ${total} file(s). Invalid: ${bad.length}.`);
  }
  process.exit(bad.length ? 2 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });


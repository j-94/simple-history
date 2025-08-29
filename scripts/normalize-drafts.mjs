#!/usr/bin/env node
// Normalize draft artifacts using OpenAI (or a local heuristic fallback).
// Env: OPENAI_API_KEY, OPENAI_MODEL (default: gpt-4o-mini)
// Usage: node scripts/normalize-drafts.mjs [--input artifacts/drafts] [--out artifacts/normalized] [--max 10] [--dry-run]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// CLI args
const argv = process.argv.slice(2);
const getFlag = (name, def = undefined) => {
  const i = argv.indexOf(name);
  if (i === -1) return def;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) return true; // boolean flag
  return v;
};

const inputDir = path.resolve(repoRoot, getFlag('--input', 'artifacts/drafts'));
const outDir = path.resolve(repoRoot, getFlag('--out', 'artifacts/normalized'));
const maxCount = Number(getFlag('--max', '50'));
const dryRun = Boolean(getFlag('--dry-run', false));
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const apiKey = process.env.OPENAI_API_KEY || '';

if (!fs.existsSync(inputDir)) {
  console.error(`Input dir not found: ${inputDir}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const allowedLanes = ['A','B','C','D','E'];
const defaultFrontmatter = {
  title: '',
  lane: 'A',
  status: 'draft',
  tags: [],
  source_refs: [],
  summary: '',
  publish_targets: ['github']
};

function splitFrontmatter(md) {
  if (md.startsWith('---')) {
    const end = md.indexOf('\n---', 3);
    if (end !== -1) {
      const fm = md.slice(3, end).trim();
      const body = md.slice(end + 4).trim();
      return { fmRaw: fm, body };
    }
  }
  return { fmRaw: '', body: md.trim() };
}

function heuristicNormalize(text) {
  // Very light local classification and titling
  const firstLine = text.split(/\r?\n/)[0].trim();
  const title = (firstLine || text).split(' ').slice(0, 8).join(' ');
  const t = text.toLowerCase();
  let lane = 'A';
  if (/(diagram|graph|visual|schematic|svg)/.test(t)) lane = 'B';
  else if (/(prompt|rubric|template)/.test(t)) lane = 'C';
  else if (/(schema|json|code|task graph|api)/.test(t)) lane = 'D';
  else if (/(insight|note|reflection|aphorism)/.test(t)) lane = 'E';
  const tags = [];
  ['kernel','heuristic','prompt','diagram','agent','north star','donkey','alpha','beta','gamma']
    .forEach(k => { if (t.includes(k)) tags.push(k.replace(/\s+/g,'-')); });
  const summary = text.slice(0, 140).replace(/\s+/g, ' ').trim();
  return { ...defaultFrontmatter, title, lane, tags: Array.from(new Set(tags)), summary };
}

async function callOpenAINormalize({ content, fmRaw }) {
  const prompt = `You are an editor that normalizes small atomic artifacts into a strict JSON schema.\n\nAllowed lanes: [\"A\"(Heuristic), \"B\"(Visual), \"C\"(Meta-Prompt), \"D\"(System Shard), \"E\"(Reflection)].\nReturn ONLY a single JSON object with keys: title, lane, status, tags, summary, publish_targets, content.\n- title: concise title (<= 10 words)\n- lane: one of A,B,C,D,E\n- status: \"draft\"\n- tags: 3-7 slugs\n- summary: one sentence\n- publish_targets: subset of [\"twitter\",\"github\",\"image\",\"gist\"]\n- content: lightly edited, concise version of the source\n\nOptionally use frontmatter hints if present.\n`;
  const user = `FRONTMATTER:\n${fmRaw || '(none)'}\n\nCONTENT:\n${content}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: user }
      ]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const contentStr = data.choices?.[0]?.message?.content || '';
  const jsonStr = contentStr.trim().replace(/^```json\n?|```$/g, '');
  return JSON.parse(jsonStr);
}

function toFrontmatter(obj) {
  const yaml = [
    '---',
    `title: ${JSON.stringify(obj.title || '')}`,
    `lane: ${JSON.stringify(obj.lane || 'A')}`,
    `status: ${JSON.stringify(obj.status || 'draft')}`,
    `tags: ${JSON.stringify(obj.tags || [])}`,
    `source_refs: []`,
    `summary: ${JSON.stringify(obj.summary || '')}`,
    `publish_targets: ${JSON.stringify(obj.publish_targets || ['github'])}`,
    '---',
    ''
  ].join('\n');
  return yaml;
}

async function main() {
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.md')).slice(0, maxCount);
  if (files.length === 0) {
    console.log('No draft markdown files found.');
    return;
  }
  console.log(`Normalizing ${files.length} draft(s) from ${path.relative(repoRoot, inputDir)} -> ${path.relative(repoRoot, outDir)}`);

  for (const f of files) {
    const full = path.join(inputDir, f);
    const raw = fs.readFileSync(full, 'utf8');
    const { fmRaw, body } = splitFrontmatter(raw);

    let normalized;
    if (!dryRun && apiKey) {
      try {
        normalized = await callOpenAINormalize({ content: body, fmRaw });
      } catch (e) {
        console.error(`API failed for ${f}: ${e.message}. Falling back to heuristic.`);
        normalized = heuristicNormalize(body);
      }
    } else {
      normalized = heuristicNormalize(body);
    }

    // Guard values
    if (!allowedLanes.includes(normalized.lane)) normalized.lane = 'A';
    normalized.status = 'draft';
    if (!Array.isArray(normalized.publish_targets) || normalized.publish_targets.length === 0) {
      normalized.publish_targets = ['github'];
    }

    const outName = f.replace(/\.md$/, '') + '.norm.md';
    const outPath = path.join(outDir, outName);
    const fm = toFrontmatter(normalized);
    const bodyOut = (normalized.content || body).trim() + '\n';
    fs.writeFileSync(outPath, fm + bodyOut);
    console.log(`✓ ${f} -> ${path.relative(repoRoot, outPath)}`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


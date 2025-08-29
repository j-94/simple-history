#!/usr/bin/env node
// Normalize draft artifacts using OpenAI (or a local heuristic fallback).
// Env: OPENAI_API_KEY, OPENAI_MODEL (default: gpt-4o-mini), OPENAI_BASE_URL (optional)
// Usage: node scripts/normalize-drafts.mjs [--input artifacts/drafts] [--out artifacts/normalized] [--max 10] [--dry-run] [--lane A] [--temperature 0.2]

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
const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const forceLane = getFlag('--lane', '');
const temperature = Number(getFlag('--temperature', '0.2'));

if (!fs.existsSync(inputDir)) {
  console.error(`Input dir not found: ${inputDir}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const allowedLanes = ['A','B','C','D','E'];
const tagVocab = [
  'heuristic','checklist','prompt','rubric','diagram','visual','schema','json','code',
  'kernel','agent','loop','alpha','beta','gamma','north-star','donkey','task-graph',
  'policy','orchestrator','reflection','insight','note','strategy','design','pattern'
];
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

function titleCase(str) {
  return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

function toSlug(str, max = 60) {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, max);
}

function enrichTags(tags, textLower) {
  const set = new Set((tags || []).map(t => String(t).toLowerCase().trim().replace(/\s+/g,'-')));
  tagVocab.forEach(t => { if (textLower.includes(t.replace(/-/g,' '))) set.add(t); });
  // ensure between 3 and 7 tags
  const arr = Array.from(set).slice(0, 7);
  while (arr.length < 3) arr.push('artifact');
  return arr;
}

function extractJSONObject(text) {
  const fenced = text.trim().replace(/^```json\n?|```$/g, '');
  try { return JSON.parse(fenced); } catch {}
  // try naive brace extraction
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch {}
  }
  throw new Error('Failed to parse JSON response');
}

async function callOpenAINormalize({ content, fmRaw }) {
  const prompt = `You are an editor that normalizes small atomic artifacts into a strict JSON schema.\n\nAllowed lanes: [\"A\"(Heuristic), \"B\"(Visual), \"C\"(Meta-Prompt), \"D\"(System Shard), \"E\"(Reflection)].\nReturn ONLY a single JSON object with keys: title, lane, status, tags, summary, publish_targets, content.\n- title: concise title (<= 10 words)\n- lane: one of A,B,C,D,E\n- status: \"draft\"\n- tags: 3-7 slugs\n- summary: one sentence\n- publish_targets: subset of [\"twitter\",\"github\",\"image\",\"gist\"]\n- content: lightly edited, concise version of the source\n\nOptionally use frontmatter hints if present.\n`;
  const user = `FRONTMATTER:\n${fmRaw || '(none)'}\n\nCONTENT:\n${content}`;

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
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
  return extractJSONObject(contentStr);
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

  const seenHashes = new Set();

  for (const f of files) {
    const full = path.join(inputDir, f);
    const raw = fs.readFileSync(full, 'utf8');
    const { fmRaw, body } = splitFrontmatter(raw);

    let normalized;
    if (!dryRun && apiKey) {
      // retries with backoff
      let attempt = 0, lastErr;
      while (attempt < 3) {
        try {
          normalized = await callOpenAINormalize({ content: body, fmRaw });
          break;
        } catch (e) {
          lastErr = e;
          const delay = 500 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          attempt++;
        }
      }
      if (!normalized) {
        console.error(`API failed for ${f}: ${lastErr?.message}. Falling back to heuristic.`);
        normalized = heuristicNormalize(body);
      }
    } else {
      normalized = heuristicNormalize(body);
    }

    // Guard values
    if (forceLane && allowedLanes.includes(forceLane)) normalized.lane = forceLane;
    if (!allowedLanes.includes(normalized.lane)) normalized.lane = 'A';
    normalized.status = 'draft';
    if (!Array.isArray(normalized.publish_targets) || normalized.publish_targets.length === 0) {
      normalized.publish_targets = ['github'];
    }
    // Sanitize title: strip markdown, punctuation noise, case, and limit
    if (normalized.title) {
      let t = String(normalized.title).trim();
      t = t.replace(/[`*_\[\]<>]/g, ''); // strip md markers
      t = t.replace(/\s{2,}/g, ' ');
      // limit to ~12 words
      const words = t.split(/\s+/).slice(0, 12);
      t = words.join(' ');
      t = titleCase(t).slice(0, 80);
      normalized.title = t;
    }
    // Enrich tags
    normalized.tags = enrichTags(normalized.tags || [], body.toLowerCase());
    // Limit content length gently
    if (normalized.content) {
      const words = String(normalized.content).split(/\s+/);
      if (words.length > 220) normalized.content = words.slice(0, 220).join(' ') + '…';
    }

    // Deduplicate by simple hash of content
    const hash = (() => {
      const s = (normalized.content || body);
      let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i); return (h >>> 0).toString(16);
    })();
    if (seenHashes.has(hash)) {
      console.log(`- skip duplicate content: ${f}`);
      continue;
    }
    seenHashes.add(hash);

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

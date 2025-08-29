#!/usr/bin/env node
// Extract features from normalized artifacts using OpenAI, with a local fallback.
// Features: key_phrases, topics, tags, lane_probs, summary, bullets, recommended_lane, embedding
// Env: OPENAI_API_KEY, OPENAI_MODEL (chat, default gpt-4o-mini), OPENAI_EMBED_MODEL (default text-embedding-3-small), OPENAI_BASE_URL
// Usage: node scripts/extract-features.mjs [--input artifacts/normalized] [--out artifacts/features] [--max 20] [--dry-run]

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

const inputDir = path.resolve(repoRoot, getFlag('--input', 'artifacts/normalized'));
const outDir = path.resolve(repoRoot, getFlag('--out', 'artifacts/features'));
const maxCount = Number(getFlag('--max', '20'));
const dryRun = Boolean(getFlag('--dry-run', false));
const apiKey = process.env.OPENAI_API_KEY || '';
const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const chatModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const embedModel = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

if (!fs.existsSync(inputDir)) {
  console.error(`Input dir not found: ${inputDir}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

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
    try { fm[key] = JSON.parse(val); } catch { fm[key] = val.replace(/^\"|\"$/g,''); }
  }
  return { fm, body };
}

function simpleKeyPhrases(text, k = 8) {
  const stop = new Set('the a an and or of to for with from in on at by is are was were be been as it this that these those you your we our'.split(/\s+/));
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w && !stop.has(w) && w.length > 2);
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  return Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([w])=>w);
}

function fallbackFeatures({ title, summary, body }) {
  const text = [title, summary, body].join('\n');
  const phrases = simpleKeyPhrases(text, 8);
  const tags = Array.from(new Set(phrases.slice(0,5))).map(w => w.replace(/\s+/g,'-'));
  const lane_probs = { A: 0.5, B: 0.1, C: 0.2, D: 0.1, E: 0.1 };
  return {
    key_phrases: phrases,
    topics: phrases.slice(0,3),
    tags,
    lane_probs,
    recommended_lane: 'A',
    summary: summary || (body || '').slice(0,160),
    bullets: phrases.slice(0,3).map(p => `Focus on ${p}`),
    embedding: [],
    model_info: { chatModel: 'fallback', embedModel: 'none' }
  };
}

function extractJSONObject(text) {
  const fenced = text.trim().replace(/^```json\n?|```$/g, '');
  try { return JSON.parse(fenced); } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch {}
  }
  throw new Error('Failed to parse JSON');
}

async function openaiChat(content) {
  const sys = `You extract concise semantic features from short technical notes. Return ONLY a JSON object with keys: key_phrases(array<=12), topics(array<=6), tags(array 3-7 slug), lane_probs(object A-E), recommended_lane(A-E), summary(one sentence), bullets(array 3-5).`;
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: chatModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content }
      ]
    })
  });
  if (!res.ok) throw new Error(`chat ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return extractJSONObject(data.choices?.[0]?.message?.content || '{}');
}

async function openaiEmbed(input) {
  const res = await fetch(`${baseURL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: embedModel, input })
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data?.[0]?.embedding || [];
}

function clipText(s, maxChars = 4000) {
  return String(s || '').slice(0, maxChars);
}

async function processFile(inPath, outBase) {
  const md = fs.readFileSync(inPath, 'utf8');
  const { fm, body } = parseFrontmatter(md);
  const title = fm.title || '';
  const summary = fm.summary || '';
  const content = clipText(`${title}\n\n${summary}\n\n${body}`);

  let features;
  if (!dryRun && apiKey) {
    // retry chat + embed up to 3 times
    let lastErr;
    for (let i=0;i<3;i++) {
      try { features = await openaiChat(content); break; }
      catch (e) { lastErr = e; await new Promise(r=>setTimeout(r, 500*(i+1))); }
    }
    if (!features) {
      console.error(`chat failed for ${path.basename(inPath)}: ${lastErr?.message}`);
      features = fallbackFeatures({ title, summary, body });
    }
    try {
      const emb = await openaiEmbed(content);
      features.embedding = emb;
      features.model_info = { chatModel, embedModel };
    } catch (e) {
      console.error(`embed failed for ${path.basename(inPath)}: ${e.message}`);
      features.embedding = [];
      features.model_info = { chatModel, embedModel: 'failed' };
    }
  } else {
    features = fallbackFeatures({ title, summary, body });
  }

  fs.writeFileSync(outBase + '.features.json', JSON.stringify(features, null, 2));
}

async function main() {
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.md')).slice(0, maxCount);
  if (files.length === 0) { console.log('No input markdown found.'); return; }
  console.log(`Extracting features for ${files.length} file(s) from ${path.relative(repoRoot, inputDir)} -> ${path.relative(repoRoot, outDir)}${dryRun ? ' [dry-run]' : ''}`);
  for (const f of files) {
    const inPath = path.join(inputDir, f);
    const outBase = path.join(outDir, f.replace(/\.md$/, ''));
    await processFile(inPath, outBase);
    console.log(`✓ ${f}`);
    await new Promise(r=>setTimeout(r, 150));
  }
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });


#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const srcPath = process.argv[2] || process.env.CHATLOG;
if (!srcPath) {
  console.error('Usage: node scripts/extract-chat-snippets.mjs <chatlog.txt>');
  process.exit(1);
}

const text = fs.readFileSync(srcPath, 'utf8');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const outDir = path.join(repoRoot, 'artifacts', 'drafts');
fs.mkdirSync(outDir, { recursive: true });

// Split into paragraphs by blank lines
const blocks = text
  .split(/\r?\n\s*\r?\n/g)
  .map(b => b.trim())
  .filter(Boolean);

// Heuristic filter for candidate atomic snippets
const keywords = ['nudge', 'heuristic', 'kernel', 'prompt', 'rubric', 'diagram', 'agent', 'loop', 'alpha', 'beta', 'gamma', 'north star', 'donkey'];
const candidates = blocks.filter(b => {
  const len = b.length;
  if (len < 80 || len > 800) return false;
  const lower = b.toLowerCase();
  const hit = keywords.some(k => lower.includes(k));
  const sentences = (b.match(/[.!?]\s/g) || []).length;
  return hit || (sentences >= 1 && len <= 400); // short, crisp blocks
});

const now = new Date().toISOString().replace(/[:.]/g, '-');
let written = 0;
candidates.slice(0, 20).forEach((content, idx) => {
  const fname = `${now}-snippet-${String(idx + 1).padStart(2, '0')}.md`;
  const fp = path.join(outDir, fname);
  const frontmatter = `---\n` +
    `title: ""\n` +
    `lane: "A"\n` +
    `status: "draft"\n` +
    `tags: []\n` +
    `source_refs: ["${srcPath}"]\n` +
    `summary: ""\n` +
    `publish_targets: ["github"]\n` +
    `---\n\n`;
  fs.writeFileSync(fp, frontmatter + content + '\n');
  written++;
});

console.log(`Extracted ${written} draft(s) to ${path.relative(process.cwd(), outDir)}`);

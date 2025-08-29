#!/usr/bin/env node
// Smoke test: seed fixture drafts -> normalize (dry-run) -> validate.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const draftsDir = path.join(repoRoot, 'artifacts', 'drafts-smoke');
const normalizedDir = path.join(repoRoot, 'artifacts', 'normalized-smoke');

fs.rmSync(draftsDir, { recursive: true, force: true });
fs.rmSync(normalizedDir, { recursive: true, force: true });
fs.mkdirSync(draftsDir, { recursive: true });
fs.mkdirSync(normalizedDir, { recursive: true });

const fixtures = [
  {
    name: 'heuristic.md',
    body: `Keep artifacts atomic: one idea per post.\nSignal over noise: remove adjectives and keep verbs active.\nKernel loop: PLAN → PATCH → TEST → STOP.`,
  },
  {
    name: 'prompt.md',
    body: `Rubric Prompt Template:\n- role: {role}\n- constraints: {constraints}\n- deliverable: {artifact}\nOutput only JSON with keys: plan, risks, next.`,
  },
  {
    name: 'system-shard.md',
    body: `Task Graph Schema (JSON): nodes:[], edges:[], each node has id, type, params. Orchestrator enforces policy and streaming updates.`,
  }
];

for (const fx of fixtures) {
  const md = `---\nstatus: "draft"\n---\n\n${fx.body}\n`;
  fs.writeFileSync(path.join(draftsDir, fx.name), md);
}

function run(cmd, args, opts={}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
  if (res.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(res.status || 1);
  }
}

console.log('1) Normalize fixtures (dry-run heuristics)');
run('node', ['scripts/normalize-drafts.mjs', '--input', path.relative(repoRoot, draftsDir), '--out', path.relative(repoRoot, normalizedDir), '--max', '10', '--dry-run']);

console.log('\n2) Validate normalized output');
run('node', ['scripts/validate-artifacts.mjs', '--dir', path.relative(repoRoot, normalizedDir), '--strict']);

console.log('\nSmoke test passed.');


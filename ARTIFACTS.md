Multilane Field for Atomic Artifacts

- Lanes:
  - A — Heuristic Nuggets: micro-rules, checklists, decision heuristics.
  - B — Visual Grammars: single-panel diagrams or schematics.
  - C — Meta-Prompts & Rubrics: reusable prompt templates with parameters.
  - D — System Shards: code snippets, schemas, task graphs.
  - E — Reflection Logs: short insights, aphorisms, meta-notes.

- Frontmatter schema (YAML):
  - title: concise artifact title
  - lane: A|B|C|D|E
  - status: draft|publish
  - tags: [strings]
  - source_refs: [paths or URLs]
  - summary: 1–2 line description
  - publish_targets: [twitter|github|image|gist]

- Workflow:
  1) Mine chat logs to drafts.
  2) Triage drafts into lanes.
  3) Edit, tag, and set status to publish.
  4) Post or commit as needed.

- Normalization (optional, OpenAI-powered):
  - Env: set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` (default `gpt-4o-mini`).
  - Run: `npm run normalize:drafts` to classify into lanes, add titles, tags, and summaries, and rewrite content to `artifacts/normalized/`.
  - Flags: `--dry-run` (no API), `--max N`, `--input DIR`, `--out DIR`, `--lane A|B|C|D|E` (force lane), `--temperature 0.1`.
  - Without an API key, a heuristic fallback runs locally.

- Promotion:
  - Copy/move normalized artifacts into lane folders based on frontmatter: `npm run promote:normalized`.
  - Flags: `--src DIR`, `--dest DIR`, `--max N`, `--move`, `--dry-run`.

- Feature Extraction (OpenAI optional):
  - Extract key phrases, topics, tags, lane probabilities, bullets, and embeddings per artifact.
  - Env: `OPENAI_API_KEY` (required for API), `OPENAI_MODEL` (chat), `OPENAI_EMBED_MODEL` (embeddings), `OPENAI_BASE_URL`.
  - Run: `npm run features:extract` (uses `artifacts/normalized` to `artifacts/features`).
  - Add `--dry-run` to run a local fallback without API.

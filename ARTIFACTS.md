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


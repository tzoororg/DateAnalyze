---
name: design-audit
description: Run the taste-critic agent over the whole shipped app (or named views) to find design flaws against the Taste Charter. Use when the user asks to review/audit the app's design.
---

# design-audit

1. Ensure the dev server is running (`python -m http.server 8000`, background).
2. Capture screenshots: `node design/capture.mjs http://localhost:8000` (all views), or pass specific shot names if the user scoped the audit. Capture dark mode too if the tooling supports it.
3. Spawn the `taste-critic` agent (`.claude/agents/taste-critic.md`, `run_in_background: false`) with the screenshot paths and one sentence: "shipped-app design audit".
4. Report its findings to the user verbatim, grouped by view. Do not fix anything — fixes go through the normal design-first workflow.

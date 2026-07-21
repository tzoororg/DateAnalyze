---
name: design-duel
description: Design a new component/view via the design-first workflow with an adversarial design critic — designer builds HTML mocks, an independent critic (fresh context, fixed taste charter) requests changes, max 3 rounds, then the surviving design goes to the user for approval. Use for any NEW component, view, widget, or page design; for small tweaks to an existing view use the plain design-first workflow.
---

# design-duel — adversarial component design

Design a new component/view for the DateAnalyze app. Two roles: **you are the designer**; the **critic** is the `taste-critic` subagent (`.claude/agents/taste-critic.md`), fresh context, fixed charter. Hard cap: **3 critic rounds**, then present to the user. This skill never implements app code — it ends at user approval of a mock.

## Flow

1. **Designer pass.** Build a static HTML mock in `design/` per CLAUDE.md's design-first workflow (style like the app; see `design/roadmap/roadmap.html` / `design/current.html` for the pattern). If the request is open-ended, produce 2–3 significantly different options in one file. Render it and capture screenshots (headless Chrome via `test/cdp.mjs`, or `design/capture.mjs <base> <shot>` for app views) — **at most 2–3 cropped screenshots**, only of the component under design.
2. **Critic round** (repeat up to 3 times):
   - Launch an `Agent` (subagent_type `taste-critic`, `run_in_background: false`) — its definition in `.claude/agents/taste-critic.md` carries the Taste Charter (single source of truth for the app's design vision). Give it ONLY: the screenshot file paths (it Reads them) and one sentence of what the component is for. Do NOT share your design reasoning.
   - The critic returns a numbered list of **at most 5 concrete change requests**, each tied to a charter principle, plus a verdict: `REVISE` or `SHIP`.
   - On `SHIP`, stop the loop. On `REVISE`, apply the changes you agree with, note refusals with a one-line reason, re-capture the changed shots, and go to the next round.
   - Append each round's requests + your responses as an HTML comment at the bottom of the mock file (`<!-- duel round N: ... -->`) so the audit trail travels with the design.
3. **Present to the user:** the final screenshots, plus a short log — what the critic changed, what you refused and why. Wait for approval. Only after approval does implementation happen (per CLAUDE.md, hand it to a Sonnet subagent), followed by the `design/current.html` refresh.

## Skip conditions

Not for logic changes, bugfixes, or minor tweaks to an existing shipped view — those use the plain design-first workflow (or no mock at all, per CLAUDE.md).

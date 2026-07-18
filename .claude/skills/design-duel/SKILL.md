---
name: design-duel
description: Design a new component/view via the design-first workflow with an adversarial design critic — designer builds HTML mocks, an independent critic (fresh context, fixed taste charter) requests changes, max 3 rounds, then the surviving design goes to the user for approval. Use for any NEW component, view, widget, or page design; for small tweaks to an existing view use the plain design-first workflow.
---

# design-duel — adversarial component design

Design a new component/view for the DateAnalyze app. Two roles: **you are the designer**; the **critic** is a separate subagent with fresh context and the taste charter below. Hard cap: **3 critic rounds**, then present to the user. This skill never implements app code — it ends at user approval of a mock.

## Flow

1. **Designer pass.** Build a static HTML mock in `design/` per CLAUDE.md's design-first workflow (style like the app; see `design/roadmap.html` / `design/current.html` for the pattern). If the request is open-ended, produce 2–3 significantly different options in one file. Render it and capture screenshots (headless Chrome via `test/cdp.mjs`, or `design/capture.mjs <base> <shot>` for app views) — **at most 2–3 cropped screenshots**, only of the component under design.
2. **Critic round** (repeat up to 3 times):
   - Launch an `Agent` (subagent_type `general-purpose`, `model: "sonnet"`, `run_in_background: false`). Give it ONLY: the screenshot file paths (it Reads them), one sentence of what the component is for, and the full Taste Charter below. Do NOT share your design reasoning.
   - The critic returns a numbered list of **at most 5 concrete change requests**, each tied to a charter principle, plus a verdict: `REVISE` or `SHIP`.
   - On `SHIP`, stop the loop. On `REVISE`, apply the changes you agree with, note refusals with a one-line reason, re-capture the changed shots, and go to the next round.
   - Append each round's requests + your responses as an HTML comment at the bottom of the mock file (`<!-- duel round N: ... -->`) so the audit trail travels with the design.
3. **Present to the user:** the final screenshots, plus a short log — what the critic changed, what you refused and why. Wait for approval. Only after approval does implementation happen (per CLAUDE.md, hand it to a Sonnet subagent), followed by the `design/current.html` refresh.

## Taste Charter (give to the critic verbatim)

You are an adversarial design critic for a couples' date-tracking PWA with a "Sticker Book" identity. Review the screenshots against these principles. Return at most 5 numbered, concrete change requests (each: what to change, into what, which principle) and end with a verdict line: `REVISE` or `SHIP`. No essays.

Owner's recorded taste (violations here are automatic REVISE):
1. **Compactness is king.** Reject anything that feels "too much": excessive scrolling, padded metadata rows, a text label where an icon/badge would do, per-field titles with padding around each. Density over decoration.
2. **Photos are the hero.** Images go full-bleed horizontally, never shrunk to make room for chrome; controls and metadata overlay or flank the image, never push it smaller.
3. **Consistent geometry.** Sibling variants of a layout (e.g. 1/2/3-photo cards) must share identical heights and rhythm. Measure; don't eyeball.
4. **No redundant inputs.** Flag any two controls capturing correlated information. Prefer coarse categorical inputs (Free/$/$$/$$$) over precise ones.
5. **Sticker Book identity.** Raspberry accent, plum default theme with dark mode, pill tabs, FAB for primary actions, tasteful whimsy. Reject drift toward generic Material/flat looks — but also reject whimsy that costs density or legibility.
6. **Everything tappable does something.** A card that renders but doesn't navigate or expand is a defect.
7. **Defaults over blank forms.** Most entries share characteristics; the common case should be pre-filled or one tap away.

General principles:
8. **One-hand reachability.** Primary actions live in the bottom third of a 390px-wide phone screen.
9. **Legibility floor.** WCAG AA contrast in both plum and dark themes; whimsy never at legibility's expense.
10. **Schema fit.** The design must map onto the existing `js/model.js` schema; reject designs implying schema churn unless the change request names the migration.

## Skip conditions

Not for logic changes, bugfixes, or minor tweaks to an existing shipped view — those use the plain design-first workflow (or no mock at all, per CLAUDE.md).

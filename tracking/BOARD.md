# BOARD — single source of truth for open work

Everything open in one place: **epics** (big multi-commit efforts, each backed by a
`plans/` doc), **goals** (open standalone items), and where **issues** live. Shipped
work moves to [ARCHIVE.md](ARCHIVE.md) — this file holds only what's open.

**Maintenance rule (agents): any commit that starts, advances, or ships an epic,
goal, or issue updates this file in the same commit.** Status values:
`active` · `blocked` · `parked` · `human-only`. Priorities: `high` · `med` · `low`.

Rendered live by the Cowork tracking artifact (reads this file + open GitHub
issues from the `dev` branch).

## Epics

| ID | Epic | Status | Priority | Plan | Next step |
|---|---|---|---|---|---|
| E1 | Production hardening (security, abuse, privacy) | active | high | [PRODUCTION_PLAN.md](../plans/active/PRODUCTION_PLAN.md) | Remaining unchecked items (§1.6 App Check onward); 1.1 invite hardening shipped |
| E2 | Play Store launch | active | high | [LAUNCH_AUG1.md](../plans/active/LAUNCH_AUG1.md) | Closed test running (12 testers × 14 days); apply for production access ~Aug 15, then promote |
| E3 | Android packaging (TWA) | human-only | high | [ANDROID_PACKAGING.md](../plans/active/ANDROID_PACKAGING.md) | Keystore + real SHA-256 into assetlinks.json, Bubblewrap build on tzoor's machine |
| E4 | iOS home-screen PWA | human-only | med | [IOS_PACKAGING.md](../plans/active/IOS_PACKAGING.md) | Real-iPhone verification pass (roadmap #12) — the only open gate; Path 2 (App Store wrapper) optional |
| E5 | Store data-safety forms | blocked | med | [STORE_DATA_SAFETY.md](../plans/active/STORE_DATA_SAFETY.md) | Answers prepped; transcribe into Play/Apple consoles once the listing exists (blocked on E2) |
| E6 | Double-blind date match | parked | low | [ROADMAP.md](../ROADMAP.md) (item #5) | Gated on real sync adoption — do not build before |

Reference (not tracked as work): [COMPETITOR_SCAN_2026.md](../plans/active/COMPETITOR_SCAN_2026.md) — market research backing the roadmap positioning.

## Goals

| ID | Goal | Status | Priority | Source | Notes |
|---|---|---|---|---|---|
| G1 | Dark-theme contrast pass on chip text (all 3 themes) | active | med | v2.6.0 validation | Twilight vibe chips muted-on-muted, below AA |
| G2 | Welcome screen 3 auto-advance when partner joins | active | low | 2026-08-08 (9386b92) | `watchMembers(cb)` in sync.js, ~15 lines + sync-test assert; spec in ARCHIVE.md §Deferred |
| G3 | Adaptive/stronger lightbox caption scrim over light photos | active | low | v2.6.0 validation | Scrim tuned for dark photos only |
| G4 | Log category strip: residual sliced-chip look at meter column | parked | low | design-audit 2026-08-08 | Revisit only with a mock proposing a cleaner treatment |
| G5 | Decide on Heroku connection | active | med | ex-TODO | Discussion item |
| G6 | Plan-usage estimations discussion | active | low | ex-TODO | Discussion item |

## Issues

Bugs and user feedback live as **GitHub issues** on `tzoororg/DateAnalyze`
(created by the in-app feedback worker, label `feedback`). Conventions
(full detail in CLAUDE.md "Finishing a task"):

- Implementation lands on `dev` → issue gets the **`next-release`** label.
- The release process closes `next-release` issues on the production merge.
- Commits reference `(#N)` for issues, `(roadmap #N)` for roadmap features.

# ROADMAP — product strategy

Strategy only. **Open work is tracked in [`tracking/BOARD.md`](tracking/BOARD.md)**;
shipped features and closed triage items are in
[`tracking/ARCHIVE.md`](tracking/ARCHIVE.md). Derived from a competitive scan of
date-night / couples apps (full scan: `plans/active/COMPETITOR_SCAN_2026.md`).

## Positioning

The market splits into three crowded lanes and one nearly-empty one:

| Lane | Apps | Loop |
|---|---|---|
| Discovery / planning | Cupla, Cobble, SoulPlan, Fever | swipe/AI → find a *new* date → book it |
| Memory / counter | The Couple, Lovewick, Between, Locket | timeline, anniversary counters, widgets |
| Coaching | Paired, Lasting, Relish, Happy Couple | daily quiz/lesson, love languages (subscription) |
| **Quantified relationship** ← us | *(basically nobody)* | log dates you did → analytics → suggest from *your* history |

We own the fourth lane (Insights + UCB1 bandit in `suggest.js`). Features are
chosen to sharpen that moat and close the two things competitors do better:
**emotional payoff** and **a reason to reopen the app when not logging**. We are
deliberately *not* chasing booking marketplaces or coaching content — off-brand,
high-lift, wrong lane.

## Future feature candidates

New feature ideas go on the board as epics/goals (ranked by
differentiation × emotional ROI ÷ effort). Currently parked:

- **Double-blind date match** (board E6) — both partners privately mark
  suggestions yes/no over sync; only mutual yeses reveal. Genuinely novel, but
  security-sensitive Firestore rules work; **gated on real sync adoption**.

## Explicitly NOT doing

- **Booking / restaurant marketplace** (Cupla, Fever, OpenTable) — needs
  partnerships/APIs, wrong lane.
- **Coaching content / quizzes** (Paired, Lasting) — huge content lift, wrong lane.
- **Home-screen widgets** — big for counter apps, but impractical for a PWA and
  low ROI.

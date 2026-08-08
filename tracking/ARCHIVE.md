# ARCHIVE — shipped / closed tracking history

Closed items moved out of the old ROADMAP.md and TODO.md (consolidated
2026-08-08). Open work lives in [BOARD.md](BOARD.md). Full feature rationale
("what/why/where it plugs in") for shipped roadmap items remains in git history
of `ROADMAP.md` if ever needed.

## Shipped roadmap features

| # | Feature | Shipped | Notes |
|---|---|---|---|
| 1 | Milestone / streak strip | shipped, then **removed by choice** | Didn't earn its space on the Log tab; recoverable from git history |
| 2 | Shareable "Wrapped" recap card | 2026-07-18 | SVG → canvas → Web Share, download fallback |
| 3 | Wishlist (Suggest → Log loop, incl. URL field, issue #4) | 2026-07-18 | `status:"idea"` entries; analytics exclude non-done |
| 6 | History import (photo-EXIF) | shipped | Day-grouped triage flow, `js/exif.js`; `.ics` import built then removed by choice; Google Photos Picker API scoped but parked |
| 7 | Date Night mode | 2026-07-19 | `activeDate` setting, 12h auto-expire |
| 11 | Time-capsule notes | 2026-07-16 (7c49285) | `capsule` field + memory-card surfacing |
| 12 | iOS PWA code side (icon + sign-in redirect) | 2026-07-18 | On-device verification still open → board E4 |
| 13 | Auto-fill "When" from photo EXIF (issue #16) | shipped | Default-only guard + undo chip |

## Release triage backlogs (all closed)

### Wave-1 triage
- **low** — Wishlist "We did it! Log it →" CTA wrapped to two lines. ✅ 2026-08-05 (7e30713).
- **low** — Lightbox photo not full-bleed. ✅ 2026-08-05 (7e30713): edge-to-edge, scrim caption, swipe-down dismiss.
- **low** — Ideas cards repeated identical rationale sentences. ✅ 2026-08-05 (c20bcf6): compact one-line reasons + half-height cards.
- **medium** — Home backup tip bubble over hero memory photo. ✅ 2026-08-05 (7e30713): slim banner above Recent Memories.
- **low** — Redundant "ONE WORD FOR THE VIBE" caps-label. ✅ 2026-08-05 (c20bcf6).
- **low** — `deleteAccount` sole-member branch left Cloud Storage blobs. ✅ 2026-08-05 (7e30713); storage.rules deployed at release.
- **medium** — Ideas "Max effort" stock Material `<select>`. ✅ 2026-08-05 (7e30713): pill-dropdown.
- **low** — History row heights inconsistent (cost badge wrap). ✅ 2026-08-05 (c20bcf6).
- **low** — Log category icons 6+5 grid → scrollable strip. ✅ 2026-08-05 (c20bcf6).
- **low** — Date-night "It's a match" toast collided with card badge. ✅ 2026-08-05 (9fa63a8).
- **low** — Wrapped card truncated its own stat labels. ✅ 2026-08-05 (c20bcf6): fixed 25% columns, short display names.

### v2.5.0 release validation (2026-08-07)
- **medium** — Stats period toggle only scoped part of the tab. ✅ 2026-08-07 (ce9653b): everything below the toggle scoped.
- **medium** — Ideas filter block ate ~470px. ✅ 2026-08-07 (ce9653b): compact chip-row toolbar.
- **medium** — Date-night camera FAB overlapped hearts badge/caption. ✅ 2026-08-07 (ce9653b).
- **low** — Log form ~180px dead band by the again-o-meter. ✅ 2026-08-07 (ce9653b).
- **low** — Category-strip fade mask too weak. ✅ 2026-08-07 (ce9653b).
- **low** — Gallery repeated title label on every tile. ✅ 2026-08-07 (ce9653b): first tile only.

### Design-audit sweep (2026-08-08, taste-critic)
- **design** — Stats "Best value"/"Most repeat-worthy" as five padded rows. ✅ 2026-08-08: dense ranked rows, top-3 + `<details>` expander; mock `design/roadmap/stats-dense-rows.html`.
- **design** — Ideas card text badges stole title width. ✅ 2026-08-08: 18px sticker dot before the title.

### v2.6.0 release validation (2026-08-08)
- **medium** — Album photo-less entries rendered two ways. ✅ 2026-08-08: unified `.grad-tile`; mock `design/roadmap/album-tile-unify.html`.
- **low** — Capsule chip olive/gold accent question. ✅ Closed 2026-08-08 as no-change: standard `--butter` token, 6.70:1 contrast (AA pass); mock `design/roadmap/capsule-chip.html`.

Still open from these sweeps → board G1 (chip contrast), G3 (scrim), G4 (strip edge).

## Deferred specs (referenced by the board)

**Welcome screen 3 auto-advance (board G2, from 2026-08-08, 9386b92):**
`watchMembers(cb)` in `sync.js` — `onSnapshot` on `spaces/{id}/members` (rules
already allow member-list reads, see `signOut`), passthrough in `store.js`,
attach while screen 3 is mounted / detach on back-skip; on `snap.size >= 2`
dismiss welcome + toast "Your partner is here ♥". Extend the sync test's join
path to assert the dismissal. ~15 lines + test.

## Closed TODO.md items

- Date widget redesign discussion (size calibration, partner rating, comments, home→album link) — done.
- Demo mode for developing features — done.
- Testing procedure — done: three-layer suite in `test/` (CLAUDE.md Testing).
- iOS support — code shipped (see roadmap #12 above); on-device verify → board E4.
- Production hardening discussion — done → PRODUCTION_PLAN.md (board E1).
- "Advance roadmap items" / "advance hardening plan" — subsumed by the board itself.

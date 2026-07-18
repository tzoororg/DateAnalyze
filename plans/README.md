# Plans

Every design/execution plan for the app, filed by status. **The folder a plan
lives in _is_ its status** — move the file when the status changes.

- `done/` — shipped and live (may still have a manual/setup tail; noted below).
- `active/` — being worked now.
- `backlog/` — not started. The feature backlog lives in [`../ROADMAP.md`](../ROADMAP.md)
  (kept at repo root because the release skill appends triage items to it); this
  folder holds any standalone not-started plan docs.

## Index

| Plan | Status | Priority | What |
|---|---|---|---|
| [active/PRODUCTION_PLAN.md](active/PRODUCTION_PLAN.md) | 🟡 active | **high** | Harden from private couple-app to store-publishable (security, abuse, privacy). Item 1.1 (invite-code hardening) is HIGH. |
| [done/IOS_PLAN.md](done/IOS_PLAN.md) | 🟢 done¹ | — | Home-screen PWA on iPhone: apple-touch-icon PNG + Google sign-in redirect fallback. Code shipped; ¹real-device verification still pending. |
| [done/SYNC_PLAN.md](done/SYNC_PLAN.md) | 🟢 done | — | Two-phone Firebase sync incl. photo blobs (base64 Firestore docs, backfill in ⋯ menu). |
| [done/PUSH_PLAN.md](done/PUSH_PLAN.md) | 🟢 done² | — | Partner-new-date web push via FCM + Cloudflare worker. ²Needs VAPID/service-account keys filled into `js/push-config.js` to activate. |
| [done/FEEDBACK_PLAN.md](done/FEEDBACK_PLAN.md) | 🟢 done | — | In-app feedback → GitHub issue via Cloudflare worker. Live. |

**Feature backlog:** [`../ROADMAP.md`](../ROADMAP.md) — ranked list of unbuilt
features (ship #1, #2 first). **Trackers** (not plans, left at root):
[`../TODO.md`](../TODO.md), [`../RELEASE_NOTES.md`](../RELEASE_NOTES.md).

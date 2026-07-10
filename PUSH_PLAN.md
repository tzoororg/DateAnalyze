# Push notifications — setup

Notify a partner's device when you save a new date, even with their app closed.

## How it works

Firestore can't trigger a push on the free Spark plan (no Cloud Functions). So the
**sender's own device**, right after saving a date, POSTs the partner's FCM token to
a Cloudflare Worker (`worker/push-worker.js`), which forwards to FCM. The partner's
service worker (`sw.js`) renders the notification. All free tier.

- `js/push.js` — client: request permission, get/store FCM token, send on save.
- `js/push-config.js` — VAPID key + worker URL + shared key (fill these in).
- `worker/push-worker.js` — signs a service-account JWT, calls FCM HTTP v1.
- Each device's FCM token lives in `spaces/{spaceId}/members/{uid}.fcmToken`.

## One-time setup

1. **VAPID key** — Firebase console → Project settings → **Cloud Messaging** → Web
   Push certificates → generate → copy the public key into
   `js/push-config.js` → `VAPID_PUBLIC_KEY`.
2. **Service account** — Firebase console → Project settings → **Service accounts**
   → *Generate new private key* → download the JSON.
3. **Deploy the worker** (same flow as the feedback worker): dash.cloudflare.com →
   Workers & Pages → Create Worker → paste `worker/push-worker.js`. Set:
   - Secret `FCM_SERVICE_ACCOUNT` = the full service-account JSON.
   - Secret `PUSH_KEY` = any random string.
   - Variable `ALLOWED_ORIGIN` = your app URL (e.g. `https://tzoororg.github.io`).
4. Put the deployed worker URL into `PUSH_ENDPOINT` and the same `PUSH_KEY` into
   `js/push-config.js`.
5. Deploy the Firestore rules change (`firestore.rules` now lets a member update
   their own member doc to store the token).
6. Bump already done: `sw.js` cache is `v20`. Hard-reload to pick up the new SW.

Until steps 1–4 are filled in, push is a silent no-op — the app behaves exactly as
before.

## Using it

⋯ menu → **🔔 Notify me of new dates** (shown only while syncing) → allow
notifications. Do this once per device, on both phones.

## iOS caveat

Safari/iOS only delivers web push when the PWA is **added to the Home Screen**
(iOS 16.4+). Android Chrome and desktop work without installing.

## Verify

Two devices/profiles in the same space, both with notifications enabled:
1. Confirm each `spaces/{spaceId}/members/{uid}` has an `fcmToken` (Firestore console).
2. Save a date on A → B gets a system notification with the title, **app closed**.
3. Tap it → app opens on the History tab.

Worker self-check (JWT signing): `node worker/push-worker.test.js` (Node 20+).

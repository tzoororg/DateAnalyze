// Web-push configuration. Fill these in after the console/deploy setup (see
// plans/done/PUSH_PLAN.md). Until they're set, push is a silent no-op — the app works exactly
// as before.
//
// VAPID_PUBLIC_KEY  Firebase console → Project settings → Cloud Messaging →
//                   Web Push certificates → "Key pair" (the public key).
// PUSH_ENDPOINT     Deployed push-worker URL (worker/push-worker.js).
// Auth is now a Firebase ID token (see js/sync.js getIdToken) verified server-side —
// there is no shared PUSH_KEY anymore.

export const VAPID_PUBLIC_KEY = "BMhyeIfmYw7uLPZqvFsFc--3MAwIz4JnXOfxGykao2K-b17PnjdYnUJ-x_nnE3CkBGcXIgalQonOij6ruPtKKF8";
export const PUSH_ENDPOINT = "https://dateanalyze-push.tzoororg.workers.dev";

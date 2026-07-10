// Web-push configuration. Fill these in after the console/deploy setup (see
// PUSH_PLAN.md). Until they're set, push is a silent no-op — the app works exactly
// as before.
//
// VAPID_PUBLIC_KEY  Firebase console → Project settings → Cloud Messaging →
//                   Web Push certificates → "Key pair" (the public key).
// PUSH_ENDPOINT     Deployed push-worker URL (worker/push-worker.js).
// PUSH_KEY          Light anti-abuse shared value sent as the x-push-key header.
//                   Ships in the client, so NOT a real secret — same value is set
//                   as the worker's PUSH_KEY secret. Only deters drive-by requests.

export const VAPID_PUBLIC_KEY = "BMhyeIfmYw7uLPZqvFsFc--3MAwIz4JnXOfxGykao2K-b17PnjdYnUJ-x_nnE3CkBGcXIgalQonOij6ruPtKKF8";
export const PUSH_ENDPOINT = "https://dateanalyze-push.tzoororg.workers.dev";
export const PUSH_KEY = "acee7da79ef9f57197a6a48782cbd4ac";

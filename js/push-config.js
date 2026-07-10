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

export const VAPID_PUBLIC_KEY = "";
export const PUSH_ENDPOINT = "";
export const PUSH_KEY = "";

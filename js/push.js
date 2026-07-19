// Web push: register this device for FCM and notify the partner when a date is
// saved. All of this is opt-in and cloud-only — local-only users never touch it.
// The actual FCM token is fetched via sync.js (which owns the Firebase app); the
// send goes through a Cloudflare Worker (worker/push-worker.js) because the free
// Spark plan has no Cloud Functions to trigger a push server-side.

import * as store from "./store.js";
import { VAPID_PUBLIC_KEY, PUSH_ENDPOINT } from "./push-config.js";

const supported = () =>
  "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

function swReg() { return navigator.serviceWorker.ready; }

// Called from the menu button. Returns { ok, msg } for a toast.
export async function enablePush() {
  if (store.getMode() !== "cloud") return { ok: false, msg: "Turn on syncing with your partner first" };
  if (!supported()) return { ok: false, msg: "This device can't show notifications" };
  if (!VAPID_PUBLIC_KEY || !PUSH_ENDPOINT) return { ok: false, msg: "Notifications aren't set up yet" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, msg: "Notifications blocked — allow them in your browser settings" };
  const token = await store.getPushToken(VAPID_PUBLIC_KEY, await swReg());
  if (!token) return { ok: false, msg: "Couldn't register for notifications" };
  await store.setMyPushToken(token);
  return { ok: true, msg: "Notifications on ♥ your partner's new dates will ping you" };
}

// Fire-and-forget on boot: refresh a possibly-rotated token if we already have
// permission and we're syncing.
export async function refreshToken() {
  if (store.getMode() !== "cloud" || !supported()) return;
  if (Notification.permission !== "granted" || !VAPID_PUBLIC_KEY) return;
  try {
    const token = await store.getPushToken(VAPID_PUBLIC_KEY, await swReg());
    if (token) await store.setMyPushToken(token);
  } catch (e) { console.warn("push token refresh failed", e); }
}

// Sender side: ping the partner that a new date landed. Best-effort — never throws.
export async function sendNewDatePush(title) {
  try {
    if (store.getMode() !== "cloud" || !PUSH_ENDPOINT) return;
    const spaceId = store.getSpaceId?.();
    const idToken = await store.getIdToken?.();
    if (!spaceId || !idToken) return;
    await fetch(PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ spaceId }),
    });
  } catch (e) { console.warn("push send failed", e); }
}

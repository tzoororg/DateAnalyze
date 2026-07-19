// Self-installing crash reporter: catches window "error" and "unhandledrejection",
// POSTs a minimal report to the same feedback worker under kind:"crash". Client-side
// rate limiting keeps a JS bug loop from spamming GitHub: at most one report per
// fingerprint per UTC day, and at most SESSION_CAP reports per page load.
import { FEEDBACK_ENDPOINT, FEEDBACK_KEY } from "./feedback-config.js";

const APP_VERSION = "us-date-tracker-v2.1.1"; // keep in sync with sw.js CACHE
const SESSION_CAP = 5;
const STACK_MAX = 2000;

const session = { count: 0 };

// fingerprint: message + first .js stack frame, hashed to a short id.
export function fingerprint(msg, stack) {
  const frame = (stack || "").split("\n").find(l => /\.js/.test(l)) || "";
  let h = 0;
  const s = String(msg || "") + frame;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return "fp" + Math.abs(h).toString(36);
}

// Pure: whether a report for this fingerprint should be sent right now.
export function shouldReport(fp, now, storage, sessionState) {
  if (sessionState.count >= SESSION_CAP) return false;
  const today = new Date(now).toISOString().slice(0, 10);
  if (storage.getItem("crash:" + fp) === today) return false;
  return true;
}

export function report(msg, stack, extra) {
  try {
    if (localStorage.getItem("crashReports") === "off") return;
    const fp = fingerprint(msg, stack);
    const now = Date.now();
    if (!shouldReport(fp, now, localStorage, session)) return;
    localStorage.setItem("crash:" + fp, new Date(now).toISOString().slice(0, 10));
    session.count++;

    const text =
      String(msg || "").slice(0, 200) +
      "\n\n```\n" + String(stack || "").slice(0, STACK_MAX) + "\n```" +
      (extra ? `\n\n${extra}` : "");

    fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-feedback-key": FEEDBACK_KEY },
      keepalive: true,
      body: JSON.stringify({
        kind: "crash",
        fingerprint: fp,
        text,
        meta: { appVersion: APP_VERSION, ua: navigator.userAgent, at: new Date(now).toISOString() },
      }),
    }).catch(() => {});
  } catch (_) { /* never let the reporter itself crash the app */ }
}

export function installCrashReporter() {
  if (!FEEDBACK_ENDPOINT) return;
  window.addEventListener("error", e => {
    report(e.message, e.error?.stack, `${e.filename || location.href}:${e.lineno || 0}:${e.colno || 0}`);
  });
  window.addEventListener("unhandledrejection", e => {
    const reason = e.reason || {};
    report(reason.message || String(reason), reason.stack, "unhandledrejection");
  });
}

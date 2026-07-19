// "Send feedback" modal. Posts a short message (+ optional photo) to the Cloudflare
// Worker, which opens a labeled GitHub issue and returns its number (the serial the
// user later references in Claude Code as "implement feedback #N").
//
// Reuses downscale() + toast() from ui.js and the existing .sheet / .menu-row styles.

import { downscale, toast } from "./ui.js";
import { FEEDBACK_ENDPOINT, FEEDBACK_KEY } from "./feedback-config.js";
import * as store from "./store.js";

let photoDataUrl = null;   // base64 data URL of the (single) attached photo, or null
let sending = false;

export function openFeedback() {
  photoDataUrl = null;
  sending = false;

  // Reuse the .sheet overlay look; build a dedicated element so it stacks over the menu.
  const el = document.createElement("div");
  el.className = "sheet";
  el.id = "feedback-sheet";
  el.innerHTML = `
    <div class="sheet-backdrop" data-fb-close></div>
    <div class="sheet-body">
      <h2>Send feedback</h2>
      <p class="muted small" style="margin:0 0 10px">
        Ideas, bugs, or requests go straight to the developers as a tracked item.
      </p>
      <textarea id="fb-text" placeholder="What would you like to see, or what went wrong?"
        style="width:100%;min-height:120px"></textarea>

      <div class="photo-strip" id="fb-photos" style="margin-top:10px"></div>
      <input id="fb-photo-input" type="file" accept="image/*" hidden/>

      <div class="btn-row" style="margin-top:12px">
        <button class="btn ghost" id="fb-cancel" type="button">Cancel</button>
        <button class="btn" id="fb-send" type="button">Send ♥</button>
      </div>
      <p class="muted small" id="fb-hint" style="margin:10px 0 0"></p>
    </div>`;
  document.body.appendChild(el);

  const close = () => el.remove();
  el.querySelectorAll("[data-fb-close]").forEach(n => n.addEventListener("click", close));
  el.querySelector("#fb-cancel").addEventListener("click", close);

  const sendBtn = el.querySelector("#fb-send");
  const hint = el.querySelector("#fb-hint");

  if (!FEEDBACK_ENDPOINT) {
    sendBtn.disabled = true;
    hint.textContent = "Feedback isn't configured yet (no endpoint set).";
  }

  renderPhoto(el);
  el.querySelector("#fb-photo-input").addEventListener("change", e => onPhotoPick(e, el));

  sendBtn.addEventListener("click", () => submit(el, close));
}

function renderPhoto(el) {
  const strip = el.querySelector("#fb-photos");
  if (photoDataUrl) {
    strip.innerHTML = `
      <div class="photo-thumb"><img src="${photoDataUrl}" alt=""/><button data-fb-rm>✕</button></div>`;
    strip.querySelector("[data-fb-rm]").addEventListener("click", () => {
      photoDataUrl = null; renderPhoto(el);
    });
  } else {
    strip.innerHTML = `
      <div class="photo-add-wrap">
        <button class="add-photo" id="fb-add-photo" type="button">＋</button>
      </div>`;
    strip.querySelector("#fb-add-photo")
      .addEventListener("click", () => el.querySelector("#fb-photo-input").click());
  }
}

async function onPhotoPick(e, el) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const blob = await downscale(file, 1280, 0.82);
    photoDataUrl = await blobToDataUrl(blob);
    renderPhoto(el);
  } catch (err) {
    console.error(err);
    toast("Couldn't add photo");
  }
}

async function submit(el, close) {
  if (sending) return;
  const text = el.querySelector("#fb-text").value.trim();
  if (!text) { toast("Write a little something first"); return; }
  if (!FEEDBACK_ENDPOINT) { toast("Feedback isn't configured yet"); return; }

  sending = true;
  const sendBtn = el.querySelector("#fb-send");
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending…";

  try {
    const headers = { "Content-Type": "application/json" };
    if (FEEDBACK_KEY) headers["x-feedback-key"] = FEEDBACK_KEY;
    // Best-effort: signed-in (cloud-sync) users get an authenticated request that
    // bypasses FEEDBACK_KEY server-side. Never let auth trouble block feedback.
    try {
      const idToken = await store.getIdToken?.();
      if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
    } catch { /* feedback still works without it */ }
    const res = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text,
        photoBase64: photoDataUrl,        // data: URL or null
        meta: {
          appVersion: "v11",
          ua: navigator.userAgent,
          at: new Date().toISOString(),
        },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const num = data.number != null ? ` — request #${data.number}` : "";
    toast(`Sent${num} ♥`);
    close();
  } catch (err) {
    console.error(err);
    toast("Couldn't send — check your connection");
    sending = false;
    sendBtn.disabled = false;
    sendBtn.textContent = "Send ♥";
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

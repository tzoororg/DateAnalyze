// Leaf helpers shared by the UI modules (ui.js and the per-tab modules split out
// of it). Everything here is stateless apart from the photo object-URL cache, and
// nothing here reaches back into a tab's state — that's what keeps the split from
// turning into a circular import.

import * as db from "./store.js";
import { tierForCost, tierLabel } from "./model.js";

export const viewEl = () => document.getElementById("view");

// ids are unique app-wide (form ids live in the log sheet, tab ids in #view)
export function bind(id, ev, fn) { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }
export function setOn(nodes, active) { nodes.forEach(n => n.classList.toggle("on", n === active)); }

export function escHtml(s) { return String(s ?? "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }
export function escAttr(s) { return String(s ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
// ponytail: ids are app-generated UUIDs; escaping + CSP is belt-and-suspenders vs a hostile partner client.
export function safeUrl(u) {
  try { const p = new URL(u, location.origin); return (p.protocol === "http:" || p.protocol === "https:") ? p.href : "#"; }
  catch { return "#"; }
}

// One coarse Free/$/$$/$$$ badge everywhere costs show — kills the mixed
// "Free" / shekel-glyph renderings (Release triage backlog, v2.1.0).
export function costBadge(e) {
  const key = e.costTier || tierForCost(e.cost);
  return key ? tierLabel(key) : "";
}
// cost tier as the pill component (design/sprint1-cost-card.html frame 3)
export function tierPill(e) {
  const key = e.costTier || tierForCost(e.cost);
  return key ? `<span class="tier-pill${key === "free" ? " free" : ""}">${tierLabel(key)}</span>` : "";
}
// rating as hearts (♥ filled, ♡ unfilled) — never ★
export function heartsHtml(n) {
  return `<span class="hearts">${"♥".repeat(n)}<span class="off">${"♡".repeat(5 - n)}</span></span>`;
}

export function emptyState(big, title, sub) {
  return `<div class="empty"><div class="big">${big}</div><h3 style="margin:8px 0 4px">${title}</h3><p class="muted">${sub}</p></div>`;
}
// v2 empty state: sticker emoji, cursive title, quiet alt line(s) or a pill CTA to Suggest.
export function emptyState2(big, title, { alts, sub, cta } = {}) {
  const altHtml = (alts || []).map(a => `<span class="alt">${a}</span>`).join("");
  const subHtml = sub ? `<p>${sub}</p>` : "";
  const ctaHtml = cta ? `<button class="cta" data-empty2-cta="suggest">${cta}</button>` : "";
  return `<div class="empty2"><div class="big">${big}</div><h3>${title}</h3>${subHtml}${ctaHtml}${altHtml}</div>`;
}
// onGoSuggest is passed in rather than imported: tab navigation belongs to ui.js,
// and importing it here would make ui.js <-> ui-shared.js circular.
export function wireEmpty2Cta(root, onGoSuggest) {
  root.querySelector("[data-empty2-cta]")?.addEventListener("click", () => onGoSuggest());
}

let toastTimer = null;
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

// ---- photo object-URL cache ----
const urlCache = new Map();      // photoId -> objectURL

export async function photoURL(id) {
  if (!id) return "";
  if (urlCache.has(id)) return urlCache.get(id);
  // ponytail: a transient Cloud Storage/CORS read error must degrade to a missing
  // thumbnail, not reject the caller's Promise.all and blank the whole view.
  let blob;
  try { blob = await db.getPhoto(id); } catch { return ""; }
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function clearPhotoCache() { urlCache.clear(); }

// ---- gestures ----
// Swipe-left → onLeft(), swipe-right → onRight(). Ignores mostly-vertical drags
// and gestures that start inside a horizontally scrollable element.
export function attachSwipe(el, onLeft, onRight) {
  let sx = null, sy = null;
  el.addEventListener("touchstart", e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    // don't hijack elements that scroll sideways themselves
    for (let n = e.target; n && n !== el; n = n.parentElement)
      if (n.scrollWidth > n.clientWidth + 5) { sx = null; return; }
  }, { passive: true });
  el.addEventListener("touchend", e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
      (dx < 0 ? onLeft : onRight)();
    sx = null;
  }, { passive: true });
}

// Swipe-down → onDown(). Used by the lightbox to dismiss on a downward drag,
// dragging the photo along with the finger for feedback.
export function attachSwipeDown(el, onDown) {
  let sy = null;
  const img = el.querySelector(".lb-img");
  el.addEventListener("touchstart", e => { sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchmove", e => {
    if (sy == null) return;
    const dy = e.touches[0].clientY - sy;
    if (dy > 0 && img) img.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  el.addEventListener("touchend", e => {
    if (sy == null) return;
    const dy = e.changedTouches[0].clientY - sy;
    sy = null;
    if (dy > 90) onDown();
    else if (img) img.style.transform = "";
  }, { passive: true });
}

// createImageBitmap decodes off the main thread (an <img> + drawImage decodes on
// it, freezing the UI on a 12MP phone photo). imageOrientation keeps EXIF-rotated
// phone shots upright, which <img> did for us for free.
export async function downscale(file, maxDim, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("encode failed")), "image/jpeg", quality));
}

// Dev-only screenshot driver. Loaded from app.js only when the page URL has
// ?shot=<state>. Seeds demo data and drives the UI into a named state so
// headless Chrome can screenshot every view (see design/capture.mjs).
// "after-*" states inject static mock DOM for roadmap before/after pictures.

import * as db from "./db.js";
import { blankEntry } from "./model.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = sel => document.querySelector(sel);
const click = sel => { const n = $(sel); if (n) n.click(); };
const html = s => { const t = document.createElement("template"); t.innerHTML = s.trim(); return t.content.firstElementChild; };

function isoDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Seed sample dates + a year-ago entry (memory card) + placeholder photos.
// shotName drives the Date Night mode (Roadmap #7) activeDate setting: seeded active
// for "datenight-active", explicitly cleared for every other shot so a leftover
// session from an earlier capture run in the same Chrome profile can't leak in
// (ui.js reads this setting once, at init() — must be set before app.js calls init()).
export async function seed(shotName) {
  if (!(await db.getAllDates()).length) {
    const { SAMPLE_DATES, attachSamplePhotos } = await import("./sample.js");
    for (const e of SAMPLE_DATES) await db.putDate(e());
    await attachSamplePhotos(db);

    await db.putDate({
      ...blankEntry(), date: isoDaysAgo(365), createdAt: Date.now() - 365 * 86400000,
      title: "Rooftop dinner under the stars", category: "dining", enjoyment: 5,
      mood: ["romantic", "magical"], effort: 3, wouldRepeat: "yes", cost: 280,
      location: "Rooftop 21", notes: "Anniversary — the city lights were unreal.",
      capsule: "If you're reading this, book the rooftop again.",
    });
  }

  if (shotName === "datenight-active") {
    await db.setSetting("activeDate", {
      startedAt: Date.now() - 84 * 60000, // 1h 24m ago
      photoIds: ["seed-photo-1", "seed-photo-2", "seed-photo-3"],
    });
  } else {
    await db.setSetting("activeDate", null);
  }
}

// ---------- state drivers ----------
async function tab(name) { click(`.tab[data-tab="${name}"]`); await sleep(300); }

const STATES = {
  async empty() { /* seed skipped for this one in app.js */ },
  async home() { await tab("home"); },
  async log() { click("#fab"); await sleep(300); },
  async menu() { click("#menuBtn"); await sleep(300); },
  async "history-list"() { await tab("history"); },
  async "history-detail"() {
    await tab("history");
    click("#hist-list [data-toggle]"); await sleep(400);
  },
  async "history-gallery"() {
    await tab("history");
    click('.hist-view-toggle [data-view="gallery"]'); await sleep(500);
  },
  async lightbox() {
    await STATES["history-gallery"]();
    click(".gallery-tile"); await sleep(400);
  },
  async insights() { await tab("insights"); },
  async suggest() { await tab("suggest"); },

  // ---------- roadmap "after" mocks (static DOM injections) ----------
  async wrapped() { await tab("insights"); },

  // Real wishlist states: actually save an idea, then show the saved suggestion
  // card / the Wishlist history segment the live app renders.
  async ensureIdea() {
    if ((await db.getAllDates()).some(e => e.status === "idea")) return;
    await tab("suggest");
    $("#sug-results [data-save]")?.click();
    await sleep(500);
  },
  async "wishlist-suggest"() {
    await STATES.ensureIdea();
    await tab("suggest");
  },
  async "wishlist-history"() {
    await STATES.ensureIdea();
    await tab("history");
    $('.hist-view-toggle [data-view="wishlist"]')?.click();
    await sleep(400);
  },

  async "after-reminders"() {
    click("#menuBtn"); await sleep(300);
    $("#seedBtn").after(html(`<button class="menu-row">🔔 Gentle reminders — <span class="muted small">anniversaries & long gaps · off</span></button>`));
  },

  // Real Date Night mode states (Roadmap #7) — activeDate is seeded/cleared in
  // seed() above, before init() runs, so ui.js picks it up on load.
  async "datenight-home"() { await tab("home"); },
  async "datenight-active"() { await tab("home"); },

  async "after-forecast"() {
    await tab("insights");
    $("#view").prepend(html(`
      <div>
        <h3 class="section-title">Looking ahead 🔮</h3>
        <div class="card tight" style="margin-bottom:10px"><div class="entry">
          <div class="thumb">📈</div>
          <div class="meta"><h4>Date #25 lands mid-August</h4><div class="sub">at your current pace of one date every 6 days</div></div>
        </div></div>
        <div class="card tight" style="margin-bottom:10px"><div class="entry">
          <div class="thumb">🍽️</div>
          <div class="meta"><h4>Dining has trended down 3 months straight</h4><div class="sub">4.8★ → 4.0★ — maybe rotate it out for a bit?</div></div>
        </div></div>
      </div>`));
  },

  async "after-value"() {
    await tab("insights");
    $("#view").prepend(html(`
      <div>
        <h3 class="section-title">Cost of happiness 💸</h3>
        <div class="card">
          <p style="margin:0 0 8px"><b>Your enjoyment plateaus above ₪200.</b></p>
          <p class="muted small" style="margin:0 0 10px">Dates under ₪100 average 4.4★ — spending more hasn't made them better.</p>
          <div class="entry" style="padding:6px 0">
            <div class="thumb">🏠</div>
            <div class="meta"><h4>Best value: At home</h4><div class="sub">4.0★ at ₪22 average</div></div>
          </div>
        </div>
      </div>`));
  },

  async "after-interview"() {
    click("#fab"); await sleep(300);
    const bubble = (who, txt) => who === "app"
      ? `<div style="background:var(--card-2);border-radius:14px 14px 14px 4px;padding:10px 12px;max-width:80%;margin:6px 0">${txt}</div>`
      : `<div style="background:var(--accent);color:#fff;border-radius:14px 14px 4px 14px;padding:10px 12px;max-width:80%;margin:6px 0 6px auto">${txt}</div>`;
    $("#logSheetBody").prepend(html(`
      <section class="card">
        <h3 style="margin:0 0 4px">Or just tell it 💬</h3>
        <p class="muted small" style="margin:0 0 10px">Answer 3 quick questions — the form fills itself, you review before saving.</p>
        ${bubble("app", "How was it? ✨")}
        ${bubble("me", "We hiked to the cliffs and caught the sunset, best evening in weeks")}
        ${bubble("app", "Sounds like a 5★ — best moment?")}
        ${bubble("me", "Sharing the last sandwich at the top 😄")}
        <button class="btn secondary" style="margin-top:8px">Fill the form from this ↓</button>
      </section>`));
  },

  async "after-capsule-log"() {
    click("#fab"); await sleep(300);
    click("#f-capsule-toggle"); await sleep(200);
    const ta = $("#f-capsule");
    if (ta) { ta.value = "If you're reading this, book the rooftop again."; ta.dispatchEvent(new Event("input", { bubbles: true })); }
  },

  async "after-capsule-home"() {
    // The seeded year-ago entry already carries a capsule note (see seed()); the
    // memory card renders it for real, no injected DOM needed.
    await tab("home");
  },

  async "after-match"() {
    await tab("suggest");
    const card = document.querySelector("#sug-results .sug-card");
    if (!card) return;
    card.style.position = "relative";
    card.prepend(html(`<span class="sticker-tag mint match-toast">It's a match! 💞</span>`));
    card.querySelector(".sug-actions")?.append(html(`
      <div class="spacer"></div>
      <button class="vote-chip on">👍</button>
      <button class="vote-chip">👎</button>`));
  },
};

export async function applyShot(name) {
  const fn = STATES[name];
  if (!fn) { console.warn("unknown shot state:", name); return; }
  await sleep(200);          // let first render + photo thumbs settle
  await fn();
  await sleep(600);          // async thumbnails / images
  document.title = "SHOT-READY:" + name;
}

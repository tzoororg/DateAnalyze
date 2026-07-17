// Demo dataset so Insights & Suggest are explorable before you've logged real dates.
// Each item is a factory returning a fresh entry (new id) keyed off today's date.

import { blankEntry } from "./model.js";

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// [daysAgo, title, category, enjoyment, mood[], effort, wouldRepeat, cost, location, notes]
const ROWS = [
  [2,   "Sunset hike at the cliffs", "outdoors", 5, ["romantic","exciting"],      3, "yes",   0,   "Coastal trail",    "Perfect light, brought snacks."],
  [6,   "Ramen at the new place",    "dining",   4, ["playful","chill"],          1, "yes",   126, "Downtown",         "Spicy miso was great."],
  [9,   "Movie night in",            "athome",   3, ["chill"],                    1, "maybe", 36,  "Home",             "Fell asleep halfway."],
  [14,  "Mini golf",                 "active",   5, ["playful","hilarious"],      2, "yes",   84,  "Pier",             "Very competitive, very fun."],
  [18,  "Art museum",                "culture",  4, ["heartfelt","chill"],        2, "yes",   90,  "City museum",      "Made up stories for the paintings."],
  [23,  "Sushi dinner",              "dining",   5, ["romantic","heartfelt"],     2, "yes",   234, "Harbor",           "Splurge but worth it."],
  [27,  "Board game night",          "athome",   4, ["playful","hilarious"],      1, "yes",   0,   "Home",             "Best of five, I lost."],
  [33,  "Cocktail bar hop",          "nightlife",4, ["playful","exciting"],       2, "maybe", 210, "Old town",         "Two places were enough."],
  [39,  "Picnic in the park",        "outdoors", 5, ["romantic","magical"],       2, "yes",   66,  "Riverside",        "Cheese, bread, sunshine."],
  [45,  "Comedy show",               "movie",    3, ["playful"],                  2, "no",    150, "Comedy club",      "Comedian was just okay."],
  [52,  "Cooking class (pasta)",     "creative", 5, ["playful","hilarious"],      3, "yes",   270, "Culinary studio",  "Made fresh tagliatelle."],
  [60,  "Day trip to the coast",     "travel",   5, ["romantic","magical"],       4, "yes",   360, "Seaside town",     "Long drive, big payoff."],
  [68,  "Ramen at the new place",    "dining",   4, ["playful","chill"],          1, "yes",   120, "Downtown",         "Repeat — still good."],
  [76,  "Ice skating",               "active",   4, ["playful","hilarious"],      3, "maybe", 96,  "Rink",             "Lots of falling, lots of laughing."],
  [85,  "Bookstore & coffee",        "culture",  4, ["heartfelt","chill"],        1, "yes",   72,  "Old bookshop",     "Bought each other a book."],
  [95,  "Picnic in the park",        "outdoors", 4, ["romantic","chill"],         2, "yes",   54,  "Riverside",        "Windier this time."],
  [104, "Live music gig",            "nightlife",5, ["exciting","playful"],       2, "yes",   180, "Music hall",       "Band was incredible."],
  [118, "Movie night in",            "athome",   4, ["heartfelt","chill"],        1, "yes",   30,  "Home",             "Better pick this time."],
];

export const SAMPLE_DATES = ROWS.map(r => () => {
  const e = blankEntry();
  const [d, title, category, enjoyment, mood, effort, wouldRepeat, cost, location, notes] = r;
  return {
    ...e,
    date: daysAgoISO(d),
    createdAt: Date.now() - d * 86400000,
    title, category, enjoyment, mood, effort, wouldRepeat, cost, location, notes,
  };
});

function makePhotoBlob([c1, c2], emoji) {
  const cv = document.createElement("canvas");
  cv.width = 640; cv.height = 480;
  const ctx = cv.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 640, 480);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 480);
  ctx.font = "140px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(emoji, 320, 240);
  return new Promise(r => cv.toBlob(r, "image/jpeg", 0.8));
}

const PALETTES = [
  [["#f3a683", "#f7d794"], "🌅"], [["#78e08f", "#38ada9"], "🌲"],
  [["#e77f67", "#cf6a87"], "🍜"], [["#82ccdd", "#60a3bc"], "⛸️"],
  [["#f8c291", "#e55039"], "🎳"], [["#b8e994", "#78e08f"], "🧺"],
];

// Give the 3 most recent seeded entries 1, 2, and 3 placeholder photos, so
// photo flows (gallery, mosaics, detail) always have single/multi cases.
// `backend` is the db/store module (needs getAllDates, putPhoto, putDate).
export async function attachSamplePhotos(backend) {
  const all = (await backend.getAllDates()).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);
  let p = 0;
  for (let n = 0; n < all.length; n++) {
    const e = all[n];
    e.photos = [];
    for (let i = 0; i <= n; i++) {
      const [colors, emoji] = PALETTES[p++ % PALETTES.length];
      e.photos.push(await backend.putPhoto(await makePhotoBlob(colors, emoji)));
    }
    await backend.putDate(e);
  }
}

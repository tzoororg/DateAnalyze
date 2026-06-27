// Demo dataset so Insights & Suggest are explorable before you've logged real dates.
// Each item is a factory returning a fresh entry (new id) keyed off today's date.

import { blankEntry } from "./model.js";

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// [daysAgo, title, category, enjoyment, mood, effort, wouldRepeat, cost, location, notes]
const ROWS = [
  [2,   "Sunset hike at the cliffs", "outdoors", 5, 5, 3, "yes",   0,   "Coastal trail", "Perfect light, brought snacks."],
  [6,   "Ramen at the new place",    "dining",   4, 4, 1, "yes",   126, "Downtown",      "Spicy miso was great."],
  [9,   "Movie night in",            "athome",   3, 4, 1, "maybe", 36,  "Home",          "Fell asleep halfway."],
  [14,  "Mini golf",                 "active",   5, 5, 2, "yes",   84,  "Pier",          "Very competitive, very fun."],
  [18,  "Art museum",                "culture",  4, 3, 2, "yes",   90,  "City museum",   "Made up stories for the paintings."],
  [23,  "Sushi dinner",              "dining",   5, 5, 2, "yes",   234, "Harbor",        "Splurge but worth it."],
  [27,  "Board game night",          "athome",   4, 4, 1, "yes",   0,   "Home",          "Best of five, I lost."],
  [33,  "Cocktail bar hop",          "nightlife",4, 5, 2, "maybe", 210, "Old town",      "Two places were enough."],
  [39,  "Picnic in the park",        "outdoors", 5, 5, 2, "yes",   66,  "Riverside",     "Cheese, bread, sunshine."],
  [45,  "Comedy show",               "movie",    3, 3, 2, "no",    150, "Comedy club",   "Comedian was just okay."],
  [52,  "Cooking class (pasta)",     "creative", 5, 5, 3, "yes",   270, "Culinary studio","Made fresh tagliatelle."],
  [60,  "Day trip to the coast",     "travel",   5, 5, 4, "yes",   360, "Seaside town",  "Long drive, big payoff."],
  [68,  "Ramen at the new place",    "dining",   4, 4, 1, "yes",   120, "Downtown",      "Repeat — still good."],
  [76,  "Ice skating",               "active",   4, 5, 3, "maybe", 96,  "Rink",          "Lots of falling, lots of laughing."],
  [85,  "Bookstore & coffee",        "culture",  4, 4, 1, "yes",   72,  "Old bookshop",  "Bought each other a book."],
  [95,  "Picnic in the park",        "outdoors", 4, 4, 2, "yes",   54,  "Riverside",     "Windier this time."],
  [104, "Live music gig",            "nightlife",5, 5, 2, "yes",   180, "Music hall",    "Band was incredible."],
  [118, "Movie night in",            "athome",   4, 4, 1, "yes",   30,  "Home",          "Better pick this time."],
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

// Data model: categories, schema helpers, and small shared utilities.

export const CATEGORIES = [
  { key: "dining",   label: "Dining",           emoji: "🍽️" },
  { key: "outdoors", label: "Outdoors",         emoji: "🌳" },
  { key: "movie",    label: "Movie / Show",     emoji: "🎬" },
  { key: "travel",   label: "Travel",           emoji: "✈️" },
  { key: "creative", label: "Creative / Class", emoji: "🎨" },
  { key: "athome",   label: "At home",          emoji: "🏠" },
  { key: "nightlife",label: "Nightlife",        emoji: "🍸" },
  { key: "culture",  label: "Culture",          emoji: "🏛️" },
  { key: "active",   label: "Sport / Active",   emoji: "🏃" },
  { key: "wellness", label: "Wellness / Spa",   emoji: "🧘" },
  { key: "special",  label: "Special / Other",  emoji: "💝" },
];

export const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

export function catLabel(key) { return CAT_BY_KEY[key]?.label || "Other"; }
export function catEmoji(key) { return CAT_BY_KEY[key]?.emoji || "💝"; }

export const REPEAT_OPTIONS = [
  { key: "yes",   label: "Yes!",  weight: 1.0 },
  { key: "maybe", label: "Maybe", weight: 0.5 },
  { key: "no",    label: "No",    weight: 0.0 },
];

// v2 log form: categorical cost tiers. `ils` is a representative amount stored in
// the numeric `cost` field so spend analytics keep working on approximations.
export const COST_TIERS = [
  { key: "free", label: "Free", ils: 0 },
  { key: "low",  label: "$",    ils: 60 },
  { key: "mid",  label: "$$",   ils: 180 },
  { key: "high", label: "$$$",  ils: 450 },
];
export function tierLabel(key) { return COST_TIERS.find(t => t.key === key)?.label || ""; }
// Bucket a legacy numeric cost into the nearest tier (for pre-selecting on edit).
export function tierForCost(n) {
  if (n == null || isNaN(n)) return null;
  return n <= 0 ? "free" : n <= 100 ? "low" : n <= 300 ? "mid" : "high";
}

// v2 log form: the again-o-meter. One 1–5 drag answers enjoyment AND wouldRepeat.
export const METER = [
  { face: "😵", word: "never again" },
  { face: "😕", word: "probably not" },
  { face: "🙂", word: "it was fine" },
  { face: "😊", word: "so good — we'd do it again" },
  { face: "😍", word: "drop everything, we're going back" },
];
export function repeatForEnjoyment(n) { return n >= 4 ? "yes" : n === 3 ? "maybe" : "no"; }

// Legacy fixed mood list — replaced in the v2 form by the free-text `vibe` word,
// but still used to display/filter entries logged before the redesign.
export const MOOD_OPTIONS = [
  { key: "romantic",   label: "Romantic",   emoji: "💕" },
  { key: "spicy",      label: "Spicy",      emoji: "🔥" },
  { key: "playful",    label: "Playful",    emoji: "😄" },
  { key: "hilarious",  label: "Hilarious",  emoji: "🤣" },
  { key: "chill",      label: "Chill",      emoji: "😌" },
  { key: "heartfelt",  label: "Heartfelt",  emoji: "🥰" },
  { key: "magical",    label: "Magical",    emoji: "✨" },
  { key: "exciting",   label: "Exciting",   emoji: "🤩" },
];

// Create a blank entry with sensible defaults.
export function blankEntry() {
  return {
    id: crypto.randomUUID(),
    date: todayISO(),
    createdAt: Date.now(),
    status: "done",  // "idea" = a wishlist item (no ratings yet); legacy/missing = done
    title: "",
    url: "",         // optional link (booking page, Pinterest…); doubles as feedback #4
    category: "dining",
    enjoyment: 4,
    mood: [],
    vibe: "",
    effort: 3,
    wouldRepeat: "yes",
    cost: null,
    costTier: null,
    location: "",
    notes: "",
    capsule: "", // optional "note to next year"; opens 1yr after entry date on Home memory card
    photos: [], // array of photo blob ids
  };
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function normTitle(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function daysBetween(aMs, bMs) {
  return Math.abs(aMs - bMs) / 86400000;
}

export const CURRENCIES = [
  { key: "ILS", symbol: "₪", label: "₪ ILS", rate: 1 },
  { key: "USD", symbol: "$", label: "$ USD", rate: 3.0 },
  { key: "EUR", symbol: "€", label: "€ EUR", rate: 3.4 },
  { key: "GBP", symbol: "£", label: "£ GBP", rate: 3.9 },
];

const RATES_URL = "https://api.frankfurter.app/latest?from=ILS&to=USD,EUR,GBP";
const RATES_MAX_AGE = 6 * 3600000; // refresh every 6 hours

export async function refreshRates(getSetting, setSetting) {
  const cached = await getSetting("exchangeRates");
  if (cached && Date.now() - cached.fetchedAt < RATES_MAX_AGE) {
    applyRates(cached.rates);
    return;
  }
  try {
    const res = await fetch(RATES_URL);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    // Frankfurter returns how much 1 ILS buys in each currency.
    // We need the inverse: how many ILS per 1 foreign unit.
    const rates = {};
    for (const [key, val] of Object.entries(data.rates)) {
      rates[key] = Math.round((1 / val) * 1000) / 1000;
    }
    applyRates(rates);
    await setSetting("exchangeRates", { rates, fetchedAt: Date.now() });
  } catch {
    if (cached) applyRates(cached.rates);
  }
}

function applyRates(rates) {
  for (const cur of CURRENCIES) {
    if (cur.key !== "ILS" && rates[cur.key] != null) cur.rate = rates[cur.key];
  }
}

export function toILS(amount, currencyKey) {
  if (amount == null || isNaN(amount)) return null;
  const cur = CURRENCIES.find(c => c.key === currencyKey);
  return Math.round(Number(amount) * (cur?.rate ?? 1));
}

export function fmtMoney(n) {
  if (n == null || n === "" || isNaN(n)) return "—";
  return "₪" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function entryTimeMs(e) {
  // Prefer the user-chosen date; fall back to createdAt.
  return e.date ? new Date(e.date + "T00:00:00").getTime() : (e.createdAt || Date.now());
}

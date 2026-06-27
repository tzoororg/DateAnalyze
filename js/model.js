// Data model: categories, schema helpers, and small shared utilities.

export const CATEGORIES = [
  { key: "dining",   label: "Dining",        emoji: "🍽️" },
  { key: "outdoors", label: "Outdoors",      emoji: "🌳" },
  { key: "movie",    label: "Movie / Show",  emoji: "🎬" },
  { key: "travel",   label: "Travel",        emoji: "✈️" },
  { key: "creative", label: "Creative / Class", emoji: "🎨" },
  { key: "athome",   label: "At home",       emoji: "🏠" },
  { key: "nightlife",label: "Nightlife",     emoji: "🍸" },
  { key: "culture",  label: "Culture",       emoji: "🏛️" },
  { key: "active",   label: "Sport / Active",emoji: "🏃" },
  { key: "special",  label: "Special / Other", emoji: "💝" },
];

export const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

export function catLabel(key) { return CAT_BY_KEY[key]?.label || "Other"; }
export function catEmoji(key) { return CAT_BY_KEY[key]?.emoji || "💝"; }

export const REPEAT_OPTIONS = [
  { key: "yes",   label: "Yes!",  weight: 1.0 },
  { key: "maybe", label: "Maybe", weight: 0.5 },
  { key: "no",    label: "No",    weight: 0.0 },
];

// Create a blank entry with sensible defaults.
export function blankEntry() {
  return {
    id: crypto.randomUUID(),
    date: todayISO(),
    createdAt: Date.now(),
    title: "",
    category: "dining",
    enjoyment: 4,
    mood: 4,
    effort: 3,
    wouldRepeat: "yes",
    cost: null,
    location: "",
    notes: "",
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

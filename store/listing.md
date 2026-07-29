# Play Store listing — Us — Date Tracker

Copy-paste-ready. Character counts verified below each field (Play's hard limits:
name 30, short description 80, full description 4000).

## App name

```
Us — Date Tracker
```

17 / 30 characters.

## Short description

```
Log dates with your partner. Free, no ads, offline, end-to-end encrypted.
```

73 / 80 characters.

## Full description

```
Free, no ads, no subscription, works offline, end-to-end encrypted. Us is a private date-tracking app for couples — no account required, nothing leaves your phone unless you choose to turn on sync.

WHY US
Most relationship apps push daily quizzes, streaks, and subscriptions. Us does one thing: it helps you remember and plan your actual dates together. Log what you did, see the story build up over time, and get suggestions based on what you both really enjoyed — not a generic list.

FOUR SIMPLE TABS

Log
After a date, jot it down in seconds: title, category, cost tier, effort, one word for the vibe, a 1-5 "would we do it again" rating, notes, and photos from your camera, gallery, or Google Photos. Start "Date night" mode before you go out to snap photos as you go — they're waiting for you in the form when you end it. Leave yourself a note to find again next year ("time capsule"), and an "on this day" memory card resurfaces what you were doing on today's date in past years.

History
Browse everything you've logged as a list or a photo gallery, search by title or notes, and filter by category or vibe. Save an idea to a wishlist for later, and check it off once you've actually gone.

Insights
See your year (or all-time) in dates: how many you've logged, your average rating, your favorite category, your most-repeated date, and which month was busiest. No spending totals — just a simple cost-tier breakdown, because a running total of money spent isn't the point.

Suggest
Get date-night ideas tuned to your history: a slider lets you dial between "comfort" (repeat a favorite) and "adventure" (try something new), with filters for budget and effort. New couples with no history yet still get a full catalog of ~50 starter ideas to pick from. A "find nearby" button opens a Google Maps search for the idea near you — your location is never sent anywhere else.

TOGETHER, PRIVATELY
Invite your partner with a one-time code and your entries sync between your two phones. Sync is opt-in — the app is fully useful with just one phone and no account at all. When sync is on, your dates, ratings, notes, and photos are encrypted on your device before they're ever sent (AES-256-GCM); we only ever see ciphertext, never your content. Turn it off and your data stays local again.

PRIVACY, HONESTLY
No analytics, no ads, no trackers of any kind. No account required to use the app. If you turn on sync, we can see basic metadata (how many entries exist, when they were created, who's in your shared space) but never your titles, notes, ratings, or photos — those are end-to-end encrypted. You can erase everything on-device at any time, and permanently delete your account and shared data from the menu. Full details in the privacy policy.

Works fully offline as an installable app (PWA) — add it to your home screen and use it without a network connection.
```

2868 / 4000 characters.

## Content rating questionnaire

The app has no user-facing content beyond what a couple types about themselves,
and no monetization mechanics. Suggested answers, with reasoning:

- **Violence** — None. The app has no game or media content at all; it's a
  form-based logging/analytics tool.
- **Sexual content / nudity** — None. No such content is possible in the app
  (free-text notes are private between two people, not moderated or public,
  same reasoning as "user-generated content" below).
- **Profanity / crude humor** — None built in. Users can type anything into
  free-text fields (title, notes, vibe word), same as a notes app — this is
  standard "unrestricted user text in a private context" and does not itself
  constitute in-app profanity content.
- **Controlled substances (alcohol/drugs/tobacco)** — None referenced or sold.
- **Gambling** — None. No wagering, loot boxes, or chance-based mechanics.
- **User-generated content — shared with other users?** — Answer **limited /
  not public**. A date entry is visible only to the one partner the logging
  user explicitly invites into their private, two-person "space" via a
  one-time pairing code (`js/sync.js createSpace/joinSpace`). There is no
  public feed, discovery, comments-from-strangers, or any way for content to
  reach anyone outside that pair. This is closer to a shared private notes
  app than a social network.
- **Ads** — None. No ad SDK or ad content anywhere in the app (grep for ad
  networks returns nothing).
- **Digital purchases** — None. Free app, no IAP, no subscription.
- **Location sharing** — Not collected/transmitted to the developer; see
  `plans/active/STORE_DATA_SAFETY.md` §1 "Location nuance" for the precise
  reasoning (GPS is read only to open a Google Maps URL the user taps).
- **Shares personal info with other users?** — Only the partner the user
  explicitly invites, and only within that pair — see the user-generated
  content answer above.

Expected outcome: this profile should land at the lowest content rating tier
(e.g. PEGI 3 / Everyone) across all rating bodies Play submits to.

## Category / tags

- **Category:** Lifestyle (alternates to consider: Dating — but the app is a
  post-date logging/analytics tool for existing couples, not a matchmaking
  app, so Lifestyle fits better).
- **Tags / keywords:** couples, date night, relationship, date ideas, date
  journal, date tracker, memories.

## Contact & policy

- **Contact email:** tzoorp@gmail.com
- **Privacy policy URL:** https://tzoororg.github.io/DateAnalyze/privacy.html

## Data safety

Do not re-derive these answers here — the authoritative, code-audited answer
sheet already exists at
[`plans/active/STORE_DATA_SAFETY.md`](../plans/active/STORE_DATA_SAFETY.md)
§2 ("Google Play — Data safety form"). Transcribe §2.1's per-data-type table
and §2.2's security-practices answers directly into the Play Console Data
safety form; §4 has the judgment calls to double-check before submitting
(location, E2EE-still-counts-as-collected, "shared" = No, feedback not E2EE,
crash logs not linked, name collected-but-not-stored-in-app-data).

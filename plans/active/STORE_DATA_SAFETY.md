# Store data-safety answer sheet

Copy-paste-ready answers for the **Google Play Data safety** form and **Apple App
Privacy** nutrition labels. Every answer is grounded in the actual code — file
citations in parentheses so it's auditable. This is prep; transcribe into each
console when the app listing is live (PRODUCTION_PLAN.md §4).

Effective picture of the app (2026-07-22 code audit):

- **Local-only by default.** Entries, ratings, notes, photos live only in the
  device's IndexedDB; nothing leaves the device unless the user turns on sync
  (`js/db.js`, `js/store.js`, first-run explainer in PRODUCTION_PLAN §2).
- **Optional partner sync** (opt-in) signs in with Google (Firebase Auth) and
  stores date/photo data in Firebase, **end-to-end encrypted** client-side with
  AES-256-GCM before it's sent (`js/crypto.js`, `js/sync.js putDate/uploadPhoto`).
  The operator sees only ciphertext plus a little metadata (below).
- **No analytics, no ads, no third-party trackers.** Grep for
  gtag/measurement/mixpanel/amplitude/segment/sentry/hotjar returns nothing but a
  "No Sentry needed" note and the local aggregation module `js/analytics.js`
  (pure math over the dates array, no network).

---

## 1. What data actually moves, and where (the source of truth)

| Data | Leaves device? | Where it goes | Operator can read? | Code |
|---|---|---|---|---|
| Date entries (title, notes, category, ratings, mood, cost, location text) | Only if sync on | Firestore `spaces/{id}/dates`, **inside `enc` (E2EE)** | **No** — ciphertext | `sync.js putDate` (`{id, date, enc}`), `crypto.js encryptJSON` |
| Entry `id` + `date` (calendar day) | Only if sync on | Firestore, **plaintext** (not inside `enc`) | **Yes** — this is disclosed metadata | `sync.js putDate` |
| Photos (bytes) | Only if sync on | Cloud Storage `spaces/{id}/photos/{id}` (Blaze) or base64 Firestore doc, **encrypted** (`enc:<mime>`) | **No** — ciphertext | `sync.js uploadPhoto`, `crypto.js encryptBlob` |
| Google account email, display name, uid | Only if sync on | Firebase Auth (Google-managed). uid also in `members/{uid}` doc path | **Yes** (email/name/uid in Auth console; only uid in our Firestore) | `sync.js signIn`, `getCurrentUser`; members doc stores only `joinedAt/joinedVia/code` |
| Space membership + timestamps + doc counts | Only if sync on | Firestore `spaces/{id}/members`, `createdAt` etc. | **Yes** — disclosed metadata | `sync.js createSpace/joinSpace` |
| FCM push token | Only if sync + push on | Firestore `members/{uid}.fcmToken` | **Yes** (a device identifier) | `sync.js setMyPushToken`, `worker/push-worker.js` |
| Feedback text + optional photo | Only if user taps Send feedback | Cloudflare worker → **GitHub issue** (operator repo). **NOT E2EE** | **Yes** — plaintext, operator-readable | `js/feedback.js`, `worker/feedback-worker.js` |
| Crash report (message, stack, filename, UA, timestamp, app version) | Only if not opted out | Cloudflare worker → GitHub issue. **No user content** | **Yes**, but carries no entry content and no uid | `js/crash-report.js`, `worker/feedback-worker.js` |
| Google Photos Picker: picked photo bytes | Only if user picks | Downloaded through worker proxy to the device, then treated as a normal photo (local + E2EE sync) | **No** (same E2EE path) | `js/gphotos.js`, scope `photospicker.mediaitems.readonly` |
| Precise device location | **No** (see nuance) | `navigator.geolocation` → used only to build a `google.com/maps` URL the user opens | n/a — never sent to operator | `js/ui.js:1635` (Suggest "nearby") |

**Location nuance (judgment call — flagged in §4):** the app touches precise
location in exactly two places, neither of which transmits location to the
operator: (a) the Suggest tab's "nearby" button reads GPS only to open a Google
Maps search URL in a new tab (`ui.js:1635` — coords go to Google Maps via a URL
the user opens, never to us); (b) EXIF GPS from a picked photo may auto-fill the
free-text `location` field as "lat, lon" (`ui.js:1750`, `js/exif.js`) — but that
then lives inside the E2EE entry content like any other note, unreadable to us.
Recommended answer: **do not declare Location as collected** on either form.

---

## 2. Google Play — Data safety form

### 2.1 Per-data-type answers

For every "Collected" type below, the constant answers are:
**Shared with third parties?** → **No** (Firebase/Cloudflare/GitHub are our
processors/infrastructure, not third parties receiving data for their own use —
Play's "shared" definition excludes service providers; see §4 note).
**Encrypted in transit?** → **Yes** (all traffic is HTTPS/TLS).
**Can the user request deletion?** → **Yes** (⋯ menu → Delete account, and the
privacy-policy deletion section — `sync.js deleteAccount`, `privacy.html`).
**Processing:** not ephemeral (stored), except crash logs.

| Play data type | Collected? | Optional/Required | Purpose | Notes |
|---|---|---|---|---|
| **Personal info → Email address** | Yes (sync only) | Optional | Account management, App functionality | Firebase Auth; needed to identify the account (`sync.js signIn`) |
| **Personal info → Name** | Yes (sync only) | Optional | Account management | Google display name available; we don't persist it beyond Auth |
| **Personal info → User IDs** | Yes (sync only) | Optional | Account management, App functionality | Firebase uid (`getCurrentUser`, members doc path) |
| **Photos and videos → Photos** | Yes (sync only) | Optional | App functionality | **End-to-end encrypted**; operator cannot view (`uploadPhoto`). Feedback photos (optional, user-initiated) go to a GitHub issue for support — Developer communications |
| **App activity → Other user-generated content** | Yes (sync only) | Optional | App functionality | The date entries (titles/notes/ratings). **E2EE** — operator cannot read |
| **App info and performance → Crash logs** | Yes (unless opted out) | Optional | App functionality | `crash-report.js`; message/stack/filename only, no user content, no uid |
| **App info and performance → Diagnostics** | Yes (unless opted out) | Optional | App functionality | UA + timestamp + app version in the crash payload |
| **Device or other IDs → Device or other IDs** | Yes (sync + push only) | Optional | App functionality | FCM push token (`setMyPushToken`), used only to notify the partner |
| **Location (precise or approximate)** | **No** | — | — | See location nuance in §1 — not transmitted to operator |
| Financial info | No | — | — | Cost is a `$`/`$$`/`$$$` tier the user picks; no payment data (`model.js COST_TIERS`) |
| Contacts / Messages / Web history / Audio / Calendar / Health | No | — | — | Not accessed |

> The free-text "location" field a user types (or EXIF fills) rides inside the
> E2EE entry content — declared under **Other user-generated content**, not
> under Location, because it's user-authored text we can't read, not a device
> location signal we collect.

### 2.2 Security practices section

- **Is all user data encrypted in transit?** → **Yes.**
- **Do you provide a way for users to request that their data be deleted?**
  → **Yes.** Deletion URL: `https://tzoororg.github.io/DateAnalyze/privacy.html`
  (the "Data deletion" section; in-app ⋯ → Delete account — `sync.js deleteAccount`).
- **Has your app's data collection been independently reviewed against a
  security standard?** → No (optional; leave unclaimed).
- **Committed to Play Families Policy / targets children?** → No.

### 2.3 Extra credit to mention in the form's free-text / policy link

Point the data-safety "privacy policy" URL at
`https://tzoororg.github.io/DateAnalyze/privacy.html`. It already states the E2EE
posture ("we can only see entry counts, timestamps, and which devices belong to
your shared space") and the no-analytics stance (`privacy.html`).

---

## 3. Apple — App Privacy (nutrition labels)

**Used for tracking?** → **No**, for every type. The app does no cross-app/
cross-site tracking, shares nothing with data brokers, and runs no ad SDK
(confirmed: no analytics/ad code anywhere).

**Data linked to you?** — Apple treats data associated with an account as
"linked," even when it's E2EE (encryption doesn't change the linkage, only
readability). So synced content is **linked**; crash diagnostics carry no
identity and are **not linked**.

| Apple category → type | Collected? | Linked to user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| **Contact Info → Email Address** | Yes (sync only) | Linked | No | App Functionality |
| **Contact Info → Name** | Yes (sync only) | Linked | No | App Functionality |
| **User Content → Photos or Videos** | Yes (sync only) | Linked | No | App Functionality |
| **User Content → Other User Content** (date entries) | Yes (sync only) | Linked | No | App Functionality |
| **Identifiers → User ID** (Firebase uid) | Yes (sync only) | Linked | No | App Functionality |
| **Identifiers → Device ID** (FCM push token) | Yes (sync + push) | Linked | No | App Functionality |
| **Diagnostics → Crash Data** | Yes (unless opted out) | **Not Linked** | No | App Functionality |
| **Diagnostics → Other Diagnostic Data** | Yes (unless opted out) | **Not Linked** | No | App Functionality |
| Location | **Not collected** | — | — | See §1 nuance |
| Financial / Health / Browsing / Search / Purchases / Sensitive / Usage Data | Not collected | — | — | Not accessed |

> Apple lets you declare "Data Not Collected" only if the app collects nothing.
> This app collects the above **when sync is enabled**, so that shortcut is not
> available — declare the types above and lean on the privacy policy for the
> local-only-by-default and E2EE story.

---

## 4. Judgment calls to double-check before you submit

1. **Location: declared as NOT collected.** Precise location is read only to open
   a Google Maps URL, and EXIF coords live inside E2EE entry text. Defensible,
   but if a reviewer notices the geolocation permission you may need to explain
   the maps-handoff (or gate the "nearby" button behind an explicit tap, which it
   already is). Alternatively you could declare "Approximate location → App
   functionality, not linked, not for tracking" to be conservative. **My call:
   don't declare it; keep this paragraph handy for review.**

2. **E2EE content is still "collected."** Both forms count data as collected once
   it's transmitted off the device, encrypted or not. So you cannot claim "no
   data collected" despite E2EE. The honest, strong story is: collected +
   encrypted in transit + end-to-end encrypted at rest (say so in the policy),
   deletable. Don't try to under-declare on the strength of E2EE.

3. **Play "Shared" = No.** Firebase (Google), Cloudflare, and GitHub process data
   on our behalf; Play's "shared" means transfer to a *third party for their own
   use*, which excludes service providers. Answer **No** to shared for every
   type. (If you'd rather be maximally conservative you can mark shared, but it's
   not required and would misrepresent the relationship.)

4. **Feedback content is NOT E2EE.** Text and any attached photo the user submits
   via Send feedback land in a GitHub issue readable by the operator
   (`feedback-worker.js`). Covered above under Photos/User content with purpose
   Developer communications — just be aware it's the one path where user-authored
   content is operator-readable by design (it's a support channel). The privacy
   policy already discloses this (`privacy.html` "Feedback").

5. **Crash logs: Not Linked / no user content.** The payload is message + stack +
   filename + UA + timestamp + app version, no uid, no entry text
   (`crash-report.js`). Apple "Not Linked"; Play App info and performance.
   Opt-out exists (`localStorage.crashReports = "off"`).

6. **Name.** Google returns a display name at sign-in but we persist only uid to
   Firestore (email/name stay in Firebase Auth). Declared as collected on both
   forms because Auth is still our system; if you want to minimize, note we don't
   store it in app data — but keep it declared.

# Phone-to-Phone Sync Plan

> **Status:** Approved, not yet implemented.  
> **To execute:** Ask Claude Code "implement the sync plan from SYNC_PLAN.md".  
> **Prerequisite:** User must create a Firebase project first (see Firebase setup section below).

## Context

The app currently stores everything local-only in IndexedDB on one device.
The goal is to let two phones **view and edit the same shared database**, with
each couple having their own isolated database. Decisions already made:

- **Auth/pairing:** Google sign-in + a short pairing code to join a shared "space".
- **Local-only mode stays:** the app keeps working with no account; cloud sync is **opt-in**.
- **Photos sync too:** uploaded to Firebase Storage so both phones see them.

Chosen backend: **Firebase** (Firestore + Auth + Storage) — works from a static PWA
with no server to host, has a generous free tier (Spark plan), and Firestore's built-in
IndexedDB offline persistence maps directly onto the app's existing offline-first model.

## Key design principle: sync is a dynamically-loaded, opt-in layer

The app stays 100% dependency-free and offline in local mode. The Firebase SDK is
**dynamically imported only when the user turns on sync** (`import()` of the gstatic ESM
CDN bundles). Local-only users never download Firebase, the service-worker app shell is
unchanged, and the existing JSON export/import remains as a no-account fallback.

## Architecture

### 1. Data-layer seam (`js/store.js` — NEW façade)

Today `js/ui.js` does `import * as db from "./db.js"` and makes ~12 distinct `db.*` calls
(inventory: `getAllDates`, `putDate`, `getDate`, `deleteDate`, `putPhoto`, `getPhoto`,
`deletePhoto`, `getSetting`, `setSetting`, `exportAll`, `importAll`, `wipeAll`).

Introduce `js/store.js` exporting the **same 12-function interface** plus:
- `subscribe(cb)` — register a callback fired when remote data changes (cloud mode).
- `getMode()` / `enableSync(...)` / `disableSync()` — mode control.

`store.js` holds a `backend` reference that is either:
- **local backend** = the current `js/db.js` (unchanged), or
- **cloud backend** = new `js/sync.js` (Firestore + Storage), exposing the identical
  function names so the façade just delegates.

**Change in `ui.js` is nearly zero:** swap `import * as db from "./db.js"` →
`import * as db from "./store.js"`; every existing `db.*` call keeps working. Add one
`db.subscribe(onRemoteChange)` in `init()` so the current tab re-renders when the partner
edits something (calls the existing `reload()` then re-renders current tab via `show(currentTab)`).

### 2. Firestore data model

```
spaces/{spaceId}
  createdAt, createdBy
spaces/{spaceId}/members/{uid}    -> { joinedAt, joinedVia }
spaces/{spaceId}/dates/{dateId}   -> full date entry (same schema as blankEntry())
invites/{CODE}                    -> { spaceId, createdBy, createdAt, expiresAt }
Storage: spaces/{spaceId}/photos/{photoId}.jpg
```

- Each couple = one `space`; isolation enforced by security rules on membership.
- Date docs keyed by the entry's existing `id` UUID → **last-write-wins** via `setDoc`.
- Real-time: a single `onSnapshot` listener on `spaces/{spaceId}/dates` drives `subscribe()`.

### 3. Auth & pairing flow (free Spark plan, no Cloud Functions)

- **Sign in:** `signInWithPopup` (Google). Add `tzoororg.github.io` to Firebase Auth authorized domains.
- **Create space:** signed-in user with no space → create `spaces/{id}`, add self to `members/`, generate a 6-char code, write `invites/{CODE}`. Show the code to share.
- **Join space:** partner signs in, enters code → client reads `invites/{CODE}` → resolves `spaceId` → writes own `members/{uid}` doc.
- The active `spaceId` is persisted via existing `setSetting("spaceId", ...)`.

### 4. Photos in cloud mode (`sync.js`)

- `putPhoto(blob)`: generate UUID → `uploadBytes` to Storage → also cache locally in IndexedDB so the uploader sees it instantly and offline.
- `getPhoto(id)`: check local IndexedDB cache first → else download from Storage, cache locally, return Blob.
- `deleteDate` cascade also deletes Storage objects for the entry's `photos[]`.

### 5. One-time migration on first sync

When a user creates a space while local data exists, prompt "Upload your existing N dates to the shared space?" → upload local dates to Firestore and photos to Storage. Joiners do **not** auto-push (avoids duplicating the partner's data).

## Files to create

- `js/firebase-config.js` — public `firebaseConfig` object (user fills from Firebase console).
- `js/sync.js` — cloud backend: dynamic Firebase import, auth, space create/join, Firestore CRUD mirroring `db.js`'s interface, Storage photo upload/download, `onSnapshot` wiring.
- `js/store.js` — façade: same 12-function interface, routes to local or cloud backend.
- `firestore.rules` / `storage.rules` — committed copies of the security rules.

## Files to modify

- `js/ui.js` — change db import to `store.js`; add `subscribe()` in `init()`; add sync menu handlers.
- `index.html` — add sync rows to the `#sheet` menu (Sign in, Create space, Join with code, Sign out).
- `css/styles.css` — minor styles for sync menu rows / code display (reuse `.menu-row`).
- `app.js` — on startup, if a `spaceId` setting exists, auto-enable sync before first render.
- `sw.js` — bump `CACHE`; add `js/store.js`, `js/sync.js`, `js/firebase-config.js` to `SHELL`.
- `CLAUDE.md` — document the sync layer.

## Security rules

```
// Firestore
match /databases/{db}/documents {
  function isMember(spaceId) {
    return exists(/databases/$(db)/documents/spaces/$(spaceId)/members/$(request.auth.uid));
  }
  match /invites/{code} {
    allow read: if request.auth != null;
    allow create: if request.auth != null && request.resource.data.createdBy == request.auth.uid;
  }
  match /spaces/{spaceId} {
    allow create: if request.auth != null && request.resource.data.createdBy == request.auth.uid;
    allow read:   if isMember(spaceId);
    match /members/{uid} {
      allow read: if isMember(spaceId);
      allow create: if request.auth.uid == uid &&
        exists(/databases/$(db)/documents/invites/$(request.resource.data.code)) &&
        get(/databases/$(db)/documents/invites/$(request.resource.data.code)).data.spaceId == spaceId;
    }
    match /dates/{dateId} {
      allow read, write: if isMember(spaceId);
    }
  }
}
```

```
// Storage
match /b/{bucket}/o {
  match /spaces/{spaceId}/photos/{photoId} {
    allow read, write: if request.auth != null &&
      firestore.exists(/databases/(default)/documents/spaces/$(spaceId)/members/$(request.auth.uid));
  }
}
```

## Firebase project setup (user must do before implementation)

1. Go to https://console.firebase.google.com → **Create a project** (free Spark plan).
2. In the project, go to **Project settings → General → Your apps → Add app → Web** → copy the `firebaseConfig` object.
3. **Authentication → Sign-in method** → enable **Google** provider → add `tzoororg.github.io` and `localhost` to Authorized domains.
4. **Firestore Database → Create database** (production mode) → paste the Firestore rules above in the Rules tab.
5. **Storage → Get started** → paste the Storage rules above in the Rules tab.

## Verification

- **Local-only regression test:** after the `store.js` refactor, verify all local-mode features still work (log, history, edit, delete, photos, export/import).
- **Cloud sync test:** on phone A sign in → create space → confirm existing dates upload. On phone B sign in → join with the code → confirm the same dates + photos appear. Add a date on A → it appears on B within seconds.
- **Offline resilience:** airplane mode on A, add a date, re-enable → confirm it syncs.
- **Isolation:** a Google account that hasn't joined the space sees nothing.
- **Sign out / disable sync:** app returns to local data; no crash.

## Risks / tradeoffs

- **Data leaves the device** to Google servers in cloud mode (local-only remains default).
- **Free-tier limits:** Spark plan is generous for a couple (50K reads/day, 1GB Firestore, 5GB Storage).
- **Conflict model** is last-write-wins per date entry; fine for two-person low-frequency use.

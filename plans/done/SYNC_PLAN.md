# Photo Sync Plan

> **Status:** The core sync layer is **already implemented and live** — see the
> `store.js` / `sync.js` architecture section in `CLAUDE.md`. Signed-in couples
> share one Firestore space; all date/text data (title, ratings, moods, notes,
> cost, location, the `photos[]` id list) syncs in real time.
>
> **What's missing:** the actual photo *blobs*. Today they stay in each device's
> IndexedDB, so a partner sees that an entry *has* photos but renders nothing for
> the ones they didn't add. This doc plans closing that gap.
>
> **To execute:** Ask Claude Code "implement the photo sync plan from SYNC_PLAN.md".

## Why photos aren't synced yet

When the project was set up we chose the **free Spark plan** and declined the
Blaze upgrade (which needs a billing account). Firebase's Cloud Storage — the
"proper" home for image blobs — requires Blaze, so `sync.js`'s photo methods were
left delegating to local IndexedDB (`js/sync.js:184-186`).

## Two ways forward

### Option A (recommended): photos as Firestore documents — stays free

Store each downscaled photo as base64 in its own doc under the space:

```
spaces/{spaceId}/photos/{photoId}  ->  { data: "<base64 jpeg>", mime, createdAt }
```

- **No billing, no new SDK.** Stays entirely on Firestore + the free Spark plan,
  so the "no card required" property we chose earlier is preserved.
- `{photoId}` is the **same UUID already stored in `date.photos[]`**, so nothing
  about the date schema or the UI changes — only where `getPhoto`/`putPhoto` read
  and write.
- Photos are **not** streamed by the existing `onSnapshot` (which listens on
  `dates` only). They're fetched lazily on first view via `getDoc` and cached
  locally, mirroring today's lazy `photoURL()` pattern — so opening the app
  doesn't download every partner photo eagerly.

**The one real constraint:** a Firestore document is capped at **1 MiB**. A
1280px/0.82 JPEG is usually 200–600 KB, and base64 inflates that ~33% → it can
brush against the limit for a detailed photo. Mitigation: a `fitUnderLimit(blob)`
helper in `sync.js` that re-encodes (progressively lower quality, then smaller
max dimension) until the base64 payload is safely under ~900 KB, before writing.
Local-mode photo quality is left untouched (the guard lives in the cloud path).

### Option B (alternative): Firebase Storage — cleaner, but needs Blaze

The original design. Proper blob storage, no 1 MiB ceiling, `storage.rules` is
already written and committed, and the Storage-based `putPhoto/getPhoto/
deletePhoto/uploadPhoto` implementation still exists in git history (removed in
the "photos device-local" change). Restoring it means: re-add the
`firebase-storage.js` dynamic import, restore those methods, publish
`storage.rules`, and **upgrade the project to the Blaze plan (adds a card;
realistically ~$0/mo at a couple's usage, but billing must be enabled).**

Pick this only if you'd rather attach billing than accept Option A's size guard.

---

## Implementation (Option A)

### 1. Firestore data model + rules

Add a `photos` subcollection alongside `dates`. This requires a **rules change**
in `firestore.rules` (and a re-publish), mirroring the `dates` rule:

```
match /spaces/{spaceId} {
  ...
  match /dates/{dateId}  { allow read, write: if isMember(spaceId); }
  match /photos/{photoId} { allow read, write: if isMember(spaceId); }   // NEW
}
```

### 2. `js/sync.js` — swap the three photo methods off local-only

Replace the current pass-throughs (`js/sync.js:184-186`) with Firestore-backed
versions that also keep the local IndexedDB cache warm (instant + offline):

- `putPhoto(blob)`: `blob → fitUnderLimit → base64`; new UUID; `setDoc` the photo
  doc; `local.cachePhoto(id, blob)` so the uploader sees it immediately; return id.
- `getPhoto(id)`: check `local.getPhoto(id)` first; else `getDoc` the photo doc,
  decode base64 → Blob, `local.cachePhoto`, return. Return `null` if missing.
- `deletePhoto(id)`: `deleteDoc` the photo doc **and** `local.deletePhoto(id)`.

### 3. `js/sync.js` — cascade + bulk paths that currently skip the cloud

- `deleteDate` (`:172`): its cascade calls `local.deletePhoto`; point it at the
  new `deletePhoto` so cloud photo docs are removed too.
- `migrateLocalData` (create-space upload): currently only `putDate`s. Loop each
  entry's `photos[]`, read the local blob, and `putPhoto`-upload it.
- `importAll`: currently `local.cachePhoto` only; route through `putPhoto` so an
  imported backup's photos land in the shared space.
- `exportAll`: no change — it already calls `getPhoto`, which will now pull from
  the cloud when needed.

### 4. `fitUnderLimit(blob)` helper

Canvas re-encode loop: try quality 0.82 → 0.7 → 0.6, then drop max dimension
1280 → 1024 → 800, recompute base64 length each pass, stop at < ~900 KB. Reuse
the existing `downscale()` canvas approach from `ui.js`.

### 5. No UI, schema, service-worker, or config changes

`ui.js` keeps calling `db.putPhoto/getPhoto`; `store.js` keeps routing to the
backend; `date.photos[]` is unchanged; no new files → no `sw.js` SHELL/CACHE bump
needed for new modules (still bump `CACHE` so phones pick up the new `sync.js`).

## Migration of existing data

Photos added **before** this change live only on the device that created them.
On first run after deploying, offer a one-time "Upload N local photos to the
shared space?" action (same shape as the create-space migration) that walks every
`date.photos[]` id, and for any blob present locally but missing its Firestore
photo doc, uploads it. Photos whose only copy was on the *other* phone can only be
back-filled from that phone.

## Verification

- **Cross-device:** Phone A adds a date with a photo → within seconds Phone B
  opens History and sees the actual image (not a blank).
- **Size guard:** attach a large, high-detail photo → confirm it still uploads
  (re-encoded) and the Firestore write doesn't fail with a doc-size error.
- **Delete cascade:** delete a date on A → its photo doc disappears (check the
  console's Firestore data tab), and it's gone on B.
- **Offline:** airplane mode, add a photo, re-enable → photo doc syncs up.
- **Free-tier sanity:** confirm reads/writes stay within Spark quotas during a
  normal session (photos are one read each, cached thereafter).
- **Local-only regression:** with sync off, photo add/view/delete unchanged.

## Risks / tradeoffs

- **1 MiB doc limit** is the headline risk; the `fitUnderLimit` guard is what
  makes Option A safe. Without it, an oversized photo write throws.
- **Storage counts toward the 1 GB Firestore free cap** (~2k photos at ~500 KB);
  fine for a couple, but base64's 33% overhead makes Firestore a less efficient
  photo store than real Storage — the price of staying off Blaze.
- **First view of each partner photo is a document read**; negligible at this
  scale and cached locally afterward.

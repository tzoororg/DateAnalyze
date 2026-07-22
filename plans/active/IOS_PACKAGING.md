# iOS packaging — PRODUCTION_PLAN §4

Reconciles `plans/done/IOS_PLAN.md` with current app state and lays out the
remaining steps. **All open items are human-only** (a Mac / a real iPhone / an
Apple Developer account) — nothing here can be done from this repo.

## Two distribution paths — decide which

### Path 1 — Home-screen PWA (the shipped strategy, no App Store) ✅ nearly done
`IOS_PLAN.md` deliberately chose this: users install via Safari →
**Share → Add to Home Screen**. No Mac, no Xcode, no $99 account, no review.
The CSS/layout side was already iOS-ready (`viewport-fit=cover`,
`env(safe-area-inset-*)`, `100dvh`).

Status (verified in the repo, 2026-07-22):
- [x] **Home-screen icon** — `icons/icon-180.png` exists; `<link rel="apple-touch-icon"
      href="icons/icon-180.png">` present in `index.html`.
- [x] **Sign-in redirect fallback** — `signInWithPopup`→`signInWithRedirect`
      shipped (`js/sync.js` / `js/store.js` / `app.js`, PRODUCTION_PLAN §2).
- [ ] **Verify on a real iPhone (iOS 16.4+)** — the only open gate. Human-only;
      iOS PWA behavior can't be emulated from here. Checklist below.

### Path 2 — App Store native wrapper (only if you want a real App Store listing)
Apple does **not** accept a raw PWA; you need a thin WKWebView wrapper. The
cheapest, build-step-free option is **PWABuilder** (packages the same manifest
into an Xcode project). This is optional — Path 1 fully distributes the app to
iPhone users. Do this only if an App Store presence is a hard requirement.
Requirements (all human-only): a **Mac**, **Xcode**, and an **Apple Developer
account ($99/yr)**. Steps in the "Path 2 detail" section below.

**Recommendation:** ship Path 1 (just needs the iPhone check), keep Path 2 in
the back pocket. Android goes to Play (TWA); iOS via home-screen PWA. Revisit
Path 2 only if you specifically want the App Store icon/listing.

---

## Path 1 — real-iPhone verification checklist (human-only gate)

Run once on a physical iPhone (iOS 16.4+), from the **installed** home-screen
app (not a Safari tab):

- [ ] Install to home screen; icon (`icon-180.png`) and standalone chrome (no
      Safari UI) are correct.
- [ ] IndexedDB persists across days — installed PWAs are exempt from Safari's
      7-day eviction (a plain tab is not; installing IS the data-safety story).
- [ ] **Push:** ⋯ menu → Notify me of new dates. iOS supports Web Push only for
      installed PWAs (iOS 16.4+). Verify the permission prompt, FCM token
      registers, and a partner-date ping arrives.
- [ ] **Google sign-in** completes via the **redirect** fallback (popups are
      unreliable in an installed iOS PWA — the code already falls back). Confirm
      the redirect returns to `/DateAnalyze/…` and lands back signed in.
- [ ] **Camera / gallery:** logging a photo opens the iOS photo library / camera
      via the native file input.
- [ ] **Google Photos Picker** — expected to **degrade** on iOS (GIS token popup
      + `window.open` from standalone). **Deliberately not fixed** (IOS_PLAN):
      the native iOS file picker already surfaces the photo library. Only
      revisit if a real user asks.

## Explicitly skipped (from IOS_PLAN, still correct)
- `apple-mobile-web-app-*` meta tags — obsolete; iOS reads the web manifest.
- `apple-touch-startup-image` splash variants — cosmetic, dozens of sizes.
- iOS-specific code paths beyond the sign-in fallback.

---

## Path 2 detail — PWABuilder App Store wrapper (only if pursued)

All steps need a **Mac + Xcode + Apple Developer account ($99/yr)**.

1. Enroll at https://developer.apple.com/programs/ ($99/yr).
2. Go to https://www.pwabuilder.com, enter
   `https://tzoororg.github.io/DateAnalyze/`, let it score the manifest, and
   **Package for stores → iOS** → download the Xcode project.
3. On the Mac: open the project in Xcode, set the **Bundle ID** (e.g.
   `io.github.tzoororg.us`), signing team, app icon (use `icons/icon-512.png`),
   and display name **Us**.
4. Build + run on a real device; run the **same wrapper checklist** as Path 1
   above (sign-in redirect, push, camera, Photos picker) — a WKWebView differs
   from Safari, especially for `window.open` (Photos picker) and popup auth.
5. Archive → upload to **App Store Connect**. Fill the **App Privacy**
   questionnaire from `plans/active/STORE_DATA_SAFETY.md` (§4 of that doc:
   E2EE content still counts as collected; Location = not collected).
6. Submit for review. Note WKWebView wrappers get extra scrutiny under App Store
   guideline 4.2 ("minimum functionality") — the app's native-feeling PWA UI
   and offline IndexedDB storage are the argument that it's more than a website.

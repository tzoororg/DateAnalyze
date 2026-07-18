# iOS support plan

> **Status:** Items 1 & 2 shipped (2026-07-18) — `icons/icon-180.png` +
> `apple-touch-icon` link, and the `signInWithPopup`→`signInWithRedirect`
> fallback (`js/sync.js` / `js/store.js` / `app.js`). Item 3 (real-iPhone
> verification) is a manual gate that can't be run from here — still open.

Goal: the app installs and works as a home-screen PWA on iPhone (iOS 16.4+).
Findings from the 2026-07-15 audit — the CSS/layout side is already iOS-ready
(`viewport-fit=cover`, `env(safe-area-inset-*)`, `100dvh` all in place), so the
work is three items, in priority order.

## 1. Home-screen icon (must, tiny)

`index.html` points `apple-touch-icon` at `icons/icon.svg`. iOS ignores SVG
here and falls back to a page screenshot as the icon.

- Render `icons/icon.svg` to a 180×180 PNG → `icons/icon-180.png`
  (one-off canvas/script render; no build step added).
- `<link rel="apple-touch-icon" href="icons/icon-180.png" />` in `index.html`.
- Add the PNG to the `SHELL` array in `sw.js` (pre-commit hook bumps `CACHE`).

## 2. Sign-in redirect fallback (should, small)

`signIn()` in `js/sync.js` uses `signInWithPopup`. Popups from an installed
iOS PWA are unreliable — the popup can open detached and the result never
returns.

- Wrap: try `signInWithPopup`, on failure fall back to `signInWithRedirect` +
  `getRedirectResult` handling on the next load (both already in the
  firebase-auth module we import; no new dependency).
- `app.js`'s `autoEnableSync()` path must tolerate the redirect round-trip
  (page reloads mid-sign-in).
- Test: `node test/sync.mjs` against the emulator still passes (emulator path
  uses anonymous sign-in and is unaffected); popup path unchanged on
  Android/desktop.

## 3. Verify on a real iPhone (gate for the rest)

No code — a checklist to run once 1–2 ship, since iOS PWA behavior can't be
emulated from here:

- Install to home screen; icon and standalone chrome correct.
- IndexedDB persists (installed PWAs are exempt from Safari's 7-day eviction;
  a plain Safari tab is not — the install step is the data-safety story).
- Push: enable notifications from the ⋯ menu (`js/push.js` already uses
  standard Web Push with feature detection, which is exactly what iOS
  supports for installed PWAs). Verify the FCM token registers and a
  partner-date ping arrives.
- Google sign-in completes via the redirect fallback.
- Google Photos picker: expected to degrade on iOS (GIS token popup +
  `window.open` from standalone). **Deliberately not fixing** — the native
  iOS file picker already surfaces the photo library, covering the use case.
  Revisit only if a real user asks.

## Explicitly skipped

- `apple-mobile-web-app-*` meta tags — obsolete; iOS reads the web manifest.
- Splash screen images (`apple-touch-startup-image`) — dozens of size
  variants for cosmetic gain; add only if the white flash on launch annoys.
- Any iOS-specific code paths beyond the sign-in fallback.

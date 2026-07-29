# Android packaging (TWA) — PRODUCTION_PLAN §4

Wrap the PWA as a **Trusted Web Activity** with Bubblewrap and ship it to Play.
Scaffolding is done and committed; what's left needs your machine, a keystore,
and a Play developer account. Everything below is copy-paste.

## What's already in the repo (done, no action needed)

- `twa-manifest.json` — Bubblewrap config pre-filled with the app's real values
  (host `tzoororg.github.io`, launcher name **Us**, colors `#2a1b26`, portrait,
  notifications on, `startUrl` `/DateAnalyze/index.html`, scope
  `/DateAnalyze/`, icon `icons/icon-512.png`, version `2.1.1`).
- `icons/icon-512.png` — 512×512 launcher icon rendered from `icons/icon.svg`.
- `.well-known/assetlinks.json` — Digital Asset Links file with **placeholders**
  for the package name (filled) and the SHA-256 fingerprint (you fill after you
  make the keystore). See `.well-known/README.md`.

## ‼️ Blocker you MUST resolve first: assetlinks.json URL

TWA app-link verification checks **`https://tzoororg.github.io/.well-known/assetlinks.json`**
— the host root. This repo only controls the `/DateAnalyze/` subpath, so the
committed file deploys to the wrong URL and verification fails (the TWA still
launches, but with a browser address bar).

Fix (pick one — full detail in `.well-known/README.md`):
- **Option A (recommended):** create a `tzoororg.github.io` User Pages repo and
  put `.well-known/assetlinks.json` there. App stays at `/DateAnalyze/`.
- **Option B:** custom domain (`CNAME`) on this repo, then change `host` +
  `startUrl` + `fullScopeUrl` in `twa-manifest.json` to that domain root.

Do this before or alongside the build — the fingerprint from step 3 goes into
whichever repo serves the host root.

## Steps (on your machine)

> **This environment is already set up (2026-07-29).** Steps 1–2 are done; the
> generated project lives at `../DateAnalyze-android`. Skip to step 3 (keystore).
> The subsections below record what was needed on *this* Windows machine, because
> none of it is in Bubblewrap's docs and all of it fails confusingly.

### 1. Install Bubblewrap
```bash
npm install -g @bubblewrap/cli
```

Three Windows gotchas, all resolved here — re-read this if you ever set up a new machine:

- **JDK 17 exactly.** Bubblewrap greps the JDK's `release` file for
  `JAVA_VERSION="17.0` and rejects anything else — JDK 21 is *not* accepted.
  `winget install --id EclipseAdoptium.Temurin.17.JDK -e --silent --accept-package-agreements --accept-source-agreements`
  (it can take several minutes and report success late; check
  `ls "/c/Program Files/Eclipse Adoptium/"` rather than trusting the exit).
- **Android SDK layout.** `AndroidSdkTools.validatePath` requires a `tools` *or*
  `bin` folder at the SDK root. A modern SDK only has `cmdline-tools/latest/bin`,
  so validation fails with a misleading "androidSdkPath isn't correct". An empty
  `%LOCALAPPDATA%\Android\Sdk\tools` directory satisfies it. (A junction to
  `cmdline-tools/latest/bin` looks right but Node's `fs.existsSync` cannot
  traverse it — don't bother.) Bubblewrap wants **build-tools 34.0.0**
  specifically; if that's already installed it never invokes `sdkmanager`.
- Both paths go in `~/.bubblewrap/config.json` as `jdkPath` / `androidSdkPath`,
  **with forward slashes** — writing Windows backslashes there yields
  `Bad escaped character in JSON`. Verify with `bubblewrap doctor`.

### 2. Generate the Android project from the committed config
`bubblewrap init` is interactive (it prompts for every manifest value and offers
to make a keystore). Since `twa-manifest.json` in this repo is already fully
filled in, **`bubblewrap update` regenerates the same Gradle project with no
prompts and no keystore** — much better for scripting:
```bash
mkdir -p ../DateAnalyze-android
cp twa-manifest.json ../DateAnalyze-android/
cd ../DateAnalyze-android && bubblewrap update
```
Verify it produced the right app: `app/src/main/AndroidManifest.xml` should carry
`package="io.github.tzoororg.us"` and `POST_NOTIFICATIONS` (the Android 13+ push
permission — without it the notification prompt never appears).

> Keep `appVersionName` in `twa-manifest.json` in sync with the `CACHE` version in
> `sw.js` before building — they drifted once already (manifest said 2.1.1 while
> the app shipped 2.4.0). Re-copy the manifest and re-run `update` after a release bump.
> Package the **production** deployment (master, `/DateAnalyze/`), not beta.
> If you want to test-wrap beta first, temporarily point `startUrl`,
> `iconUrl`, `webManifestUrl`, `fullScopeUrl` at `/DateAnalyze/beta/…` — but
> ship the production one.

### 3. Create the signing keystore + get the fingerprint
```bash
# Bubblewrap offers to create a keystore during `init`/`build`. To do it by hand:
keytool -genkeypair -v -keystore android.keystore -alias android \
  -keyalg RSA -keysize 2048 -validity 10000
# BACK THIS FILE UP. Losing android.keystore = you can never update the app.
# Store the keystore + passwords somewhere safe (NOT in git — it's gitignored/kept local).

# Print the SHA-256 fingerprint (upload key):
keytool -list -v -keystore android.keystore -alias android
#   → copy the "SHA256:" line → paste into .well-known/assetlinks.json
# (or:)  bubblewrap fingerprint
```
Paste the fingerprint(s) into `assetlinks.json` on the host-root repo (see the
blocker section) and redeploy it. After the first Play upload, also add the
**Play App Signing** SHA-256 (Play re-signs your app) — see `.well-known/README.md`.

### 4. Build the app
```bash
bubblewrap build
#   → produces app-release-signed.apk (for device testing)
#     and app-release-bundle.aab (for Play upload)
```

**Two traps hit on 2026-07-29, both resolved — read before rebuilding on a new machine:**

- **The JDK path must contain no spaces.** Bubblewrap builds the `apksigner`
  invocation without quoting `jdkPath`, so a winget-default
  `C:\Program Files\Eclipse Adoptium\...` fails the *signing* step with
  `'C:\Program' is not recognized`. Confusingly the **unsigned** build succeeds,
  because it never calls `apksigner`. Fixed by copying the JDK to
  `C:\Users\tzoor\jdk17` and pointing `~/.bubblewrap/config.json` there.
- **⚠️ Bubblewrap prints your keystore password in cleartext when signing fails.**
  Its error message echoes the whole command line, including
  `--ks-pass pass:"…" --key-pass pass:"…"`. Never paste raw `bubblewrap build`
  output anywhere, and never capture it to a log you'll share. `finish-build.ps1`
  in the Android project scrubs `pass:"…"` from its transcript for this reason.
  If a password does leak, rotate it — this does **not** change the certificate,
  so the published `assetlinks.json` fingerprint stays valid:
  ```bash
  keytool -storepasswd -keystore android.keystore
  keytool -keypasswd  -keystore android.keystore -alias android
  ```

**Verify the built APK carries the fingerprint you published** (no password needed):
```bash
keytool -printcert -jarfile app-release-signed.apk | grep SHA256
#   → must equal the value in .well-known/assetlinks.json on the host-root repo
```

### 5. Test the built APK on a device

> **DONE 2026-07-29 on the Xiaomi (`5TYT6DDI4XLNJBFY`).** `pm get-app-links` reports
> **`tzoororg.github.io: verified`** with the signature matching the published
> fingerprint, and the app launches into Chrome's `TranslucentCustomTabActivity`
> in `mode=fullscreen` with no crashes. The DAL chain is proven end to end.
>
> **MIUI blocks `adb install`.** It fails with
> `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user` even with
> "Install via USB" enabled in Developer options — MIUI gates adb-initiated
> installs behind a separate check. Workaround that works without changing any
> device setting: push the APK and install it from the device shell instead.
> ```bash
> adb push app-release-signed.apk /data/local/tmp/us.apk
> adb shell pm install -r -t /data/local/tmp/us.apk   # → Success
> adb shell rm -f /data/local/tmp/us.apk
> ```
> Also note: **git-bash rewrites device paths** (`/sdcard/...` becomes
> `T:/apps/Git/sdcard/...`). Prefix adb commands with `MSYS_NO_PATHCONV=1`.

```bash
adb install -r app-release-signed.apk
# Launch "Us" from the launcher. Then verify app-links resolved:
adb shell pm get-app-links io.github.tzoororg.us
#   → the host line should read "verified". If not, assetlinks.json isn't at the
#     host root yet (the blocker) or the fingerprint doesn't match; fix and:
adb shell pm verify-app-links --re-verify io.github.tzoororg.us
```
A correctly verified TWA launches **full-screen with no address bar**. An
address bar means DAL verification failed — don't ship until it's gone.

### 6. Upload to Play Console
- Play Console → **Create app** → fill listing (name **Us**, category, etc.).
- **Test and release → Setup → App signing**: enroll in Play App Signing
  (default), upload `app-release-bundle.aab`. Copy the **App signing key
  SHA-256** it shows you → add to `assetlinks.json` → redeploy the host-root repo.
- Fill **Data safety** from `plans/active/STORE_DATA_SAFETY.md`.
- Roll out to internal testing first; install from the Play track and re-check
  the wrapper checklist below (Play-signed build has the *other* fingerprint).

---

## Wrapper verification checklist (webview ≠ Chrome)

Run every item on a real device from the installed TWA, not Chrome. A TWA uses
Chrome under the hood, so most things work, but the **Custom Tab boundary** and
**Android runtime permissions** are where behavior differs.

- [ ] **Google sign-in.** Sync → Sign in with Google. The `signInWithPopup`→
      `signInWithRedirect` fallback already shipped (`js/sync.js`,
      PRODUCTION_PLAN §2). In a TWA, `accounts.google.com` is **outside scope**,
      so it opens in a **Custom Tab**; after auth the redirect must return to
      `https://tzoororg.github.io/DateAnalyze/…` and land back **inside** the
      TWA (in-scope URL) with `getRedirectResult()` completing sign-in. Watch:
      the return URL must be in-scope or it stays in the Custom Tab. Confirm
      `tzoororg.github.io` is an Authorized domain in Firebase Auth and a
      JS-origin on the Photos OAuth client (already noted in §1.6).
- [ ] **FCM push.** ⋯ menu → Notify me of new dates. On **Android 13+ (API 33)**
      the app must request the **POST_NOTIFICATIONS** runtime permission — Web
      Push's `Notification.requestPermission()` triggers the native prompt
      inside a TWA. Verify the prompt appears, the FCM token registers, and a
      partner-date ping arrives in the tray and deep-links back into the app.
      (Bubblewrap sets `enableNotifications: true` → adds the permission to the
      Android manifest; without it the prompt never shows on 13+.)
- [ ] **Camera / gallery.** Log a date → add a photo. The `<input type="file"
      accept="image/*" capture="environment">` (index.html) must open the
      camera; a plain gallery `<input>` must open the picker. TWA forwards these
      to the system; confirm both, and that the downscaled JPEG saves.
- [ ] **Google Photos Picker.** Log → "📸 Google Photos" (`js/gphotos.js`). Uses
      a GIS token client + opens the picker via `window.open`. In a TWA
      `window.open` to an out-of-scope Google URL routes to a Custom Tab — verify
      the picker opens, a photo can be selected, and control returns to the app
      with the photo attached. This is the most webview-fragile path; if it
      fails, the device/gallery picker above already covers the use case.

### Pitfalls to watch
- **Address bar showing = DAL not verified.** Fix assetlinks.json host-root URL
  + fingerprint before anything else.
- **Custom Tab vs webview:** in-scope navigations stay in the TWA; out-of-scope
  (Google auth, Photos picker) open a Custom Tab. Sign-in redirect must return
  to an **in-scope** URL to re-enter the app.
- **Android 13+ notifications:** no permission prompt = `enableNotifications`
  wasn't applied; rebuild.
- **Play re-signs your app:** the Play App Signing fingerprint differs from your
  upload key — add BOTH to assetlinks.json or Play-track installs fail
  verification even when your local sideload passed.

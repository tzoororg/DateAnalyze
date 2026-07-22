# `.well-known/assetlinks.json` — Android Digital Asset Links

This file proves that the Android TWA (package `io.github.tzoororg.us`) is
allowed to open `https://tzoororg.github.io` URLs without the browser address
bar (verified app links).

## ⚠️ Subpath blocker — read this first

Digital Asset Links are verified at the **host root**, always:

    https://tzoororg.github.io/.well-known/assetlinks.json   ← the ONLY URL Android checks

But this repo is a **project** Pages site served under a subpath:

    https://tzoororg.github.io/DateAnalyze/         ← the app (master)
    https://tzoororg.github.io/DateAnalyze/beta/    ← beta (dev)

So this file, deployed from this repo, lands at
`https://tzoororg.github.io/DateAnalyze/.well-known/assetlinks.json` —
**the wrong URL. Android will not find it, and app-link verification will fail**
(the TWA still runs, but with a browser address bar showing). Pick ONE fix:

**Option A — user/organization Pages site (simplest, recommended).**
Create a repo named exactly `tzoororg.github.io` (GitHub User Pages, served at
the domain root). Put just this one file in it at
`.well-known/assetlinks.json`. Nothing else needs to move — the app stays at
`/DateAnalyze/`, and the TWA host stays `tzoororg.github.io`. Verified.

**Option B — custom domain on THIS repo.**
Add a `CNAME` file (e.g. `us.example.com`) to this repo and point DNS at GitHub
Pages. Then this repo owns the domain root, this file is served at
`https://us.example.com/.well-known/assetlinks.json` directly, and you change
`host` in `twa-manifest.json` + `start_url`/`scope` to the new domain root
(dropping the `/DateAnalyze/` subpath). More moving parts; only worth it if you
want a branded domain anyway.

Until one of these is done, do not submit the TWA expecting verified app links.

## How to fill in the two placeholders

1. **`package_name`** — already set to `io.github.tzoororg.us`. Change it only if
   you change `packageId` in `twa-manifest.json`; the two MUST match.

2. **`sha256_cert_fingerprints`** — replace the placeholder. You need the SHA-256
   of the signing certificate. There are up to two:

   - **Play App Signing key** (the one that matters in production — Google
     re-signs your app). After you upload the first AAB, get it from:
     Play Console → your app → **Test and release → Setup → App signing** →
     copy the **SHA-256 certificate fingerprint** under "App signing key
     certificate". Paste it here.
   - **Upload key** (your local keystore, used for local device testing before
     Play re-signs). Print it with:

         keytool -list -v -keystore android.keystore -alias android

     or let Bubblewrap print it:

         bubblewrap fingerprint

   Put **both** fingerprints in the array (they're different certs) so the app
   verifies whether it's your locally-signed build or the Play-signed build:

       "sha256_cert_fingerprints": [
         "AA:BB:CC:...   (upload key)",
         "DD:EE:FF:...   (Play App Signing key)"
       ]

   Format is uppercase hex, colon-separated — exactly as `keytool` prints it.

3. Commit the filled-in file to whichever repo serves the domain root
   (Option A or B above), and confirm it resolves:

       curl https://tzoororg.github.io/.well-known/assetlinks.json

   Then re-verify links on-device: `adb shell pm verify-app-links --re-verify io.github.tzoororg.us`
   and check `adb shell pm get-app-links io.github.tzoororg.us` shows `verified`.

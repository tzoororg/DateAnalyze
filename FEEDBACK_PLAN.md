# In-App Feedback → GitHub Feature Request

> **Status:** Client + Worker committed and live.

The ⋯ menu → **Send feedback** opens a text box (+ optional photo). On submit the app
POSTs to a Cloudflare Worker, which opens a `feedback`-labeled GitHub issue in
`tzoororg/DateAnalyze` and returns the issue number. **The issue number is the serial** —
later, in Claude Code, say "implement feedback #7".

The technical rewording + execution plan happen **in Claude Code** when you say
"implement feedback #N" — it reads the issue and plans with full repo context, under your
existing Claude Code plan (no separate API cost). (An earlier version generated a plan
comment via a GitHub Action + the Anthropic API; that was dropped as redundant.)

## Pieces

| Part | File | Runs where |
|------|------|-----------|
| Feedback modal | `js/feedback.js`, `js/feedback-config.js` | the PWA (browser) |
| Issue creator | `worker/feedback-worker.js` | Cloudflare Worker |

## One-time setup (web consoles, all free tiers)

1. **GitHub fine-grained token** — https://github.com/settings/tokens?type=beta →
   *Generate new token*. Repository access: only **DateAnalyze**. Permissions:
   **Issues: Read and write**, **Contents: Read and write**. Copy it.

2. **Cloudflare Worker** — https://dash.cloudflare.com (free) → *Workers & Pages* →
   *Create* → *Create Worker* → name `dateanalyze-feedback` → *Deploy* → *Edit code* →
   paste all of `worker/feedback-worker.js` → *Deploy*. Then *Settings → Variables and
   Secrets*:
   - Secret **`GITHUB_TOKEN`** = the token from step 1
   - Variable **`ALLOWED_ORIGIN`** = your app's public URL (e.g. `https://tzoororg.github.io`)
   - *(optional)* Secret **`FEEDBACK_KEY`** = any random string (anti-abuse)

   Copy the Worker URL, e.g. `https://dateanalyze-feedback.<sub>.workers.dev`.

3. **Wire the client** — put the Worker URL in `js/feedback-config.js`
   (`FEEDBACK_ENDPOINT`). If you set `FEEDBACK_KEY` on the Worker, set the same value in
   `FEEDBACK_KEY` there too. Commit + redeploy the site (bump `sw.js` `CACHE` if needed).

## Using the serial in Claude Code

Say **"implement feedback #N"**. Claude reads the public issue (title + body) and
produces the technical rewording, plan, and implementation with full repo context.

## Notes / tradeoffs

- The Worker is a public endpoint; `FEEDBACK_KEY` + Cloudflare rate limiting deter abuse.
  Add Cloudflare Turnstile later if needed.
- Photos are committed to `feedback-assets/` on the default branch so they can be embedded
  in issues. Low volume; move to a dedicated branch if you want to keep the Pages branch clean.
- No email/SMTP: GitHub emails you automatically when a new issue is opened.

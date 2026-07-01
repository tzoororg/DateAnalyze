#!/usr/bin/env python3
"""Turn a feedback issue into a technical rewording + execution plan (Claude API),
then post it as a comment. Runs in GitHub Actions; stdlib only (urllib)."""

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

# --- tuning ---------------------------------------------------------------
MODEL = "claude-sonnet-4-6"   # cheap + fast; swap to claude-opus-4-8 for deeper plans
MAX_TOKENS = 1200

REPO_CONTEXT = (
    "DateAnalyze is a dependency-free Progressive Web App for couples to track dates. "
    "Pure HTML/CSS/vanilla JS with ES modules, no build step, no framework. Data is "
    "local-only in IndexedDB. Four tabs: Log, History, Insights, Suggest (a UCB1 "
    "multi-armed-bandit date-idea recommender). Key files: js/ui.js (monolithic UI), "
    "js/model.js (schema), js/db.js (IndexedDB), js/suggest.js, js/analytics.js, "
    "js/charts.js (inline SVG), css/styles.css (CSS custom properties, dark/light)."
)

PROMPT_TEMPLATE = """You are triaging a user feedback item for the DateAnalyze project.

Repo context:
{context}

Raw user feedback (title then body):
---
{title}

{body}
---

Write a concise triage note with exactly these two sections in Markdown:

## Technical rewording
Restate the request in precise engineering terms: what component/behavior changes,
which files (from the repo context) are likely involved, and any edge cases.

## Execution plan
A short numbered list of concrete implementation steps a developer could follow.
Keep it high-level (this is a first pass; detailed work happens later with full repo
access). Note any open questions or decisions the maintainer should confirm.
"""


def call_claude(prompt: str) -> str:
    api_key = os.environ["ANTHROPIC_API_KEY"]
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        method="POST",
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        data=json.dumps({
            "model": MODEL,
            "max_tokens": MAX_TOKENS,
            "messages": [{"role": "user", "content": prompt}],
        }).encode(),
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.load(resp)
    return "".join(block.get("text", "") for block in data.get("content", []))


def main() -> int:
    title = os.environ.get("ISSUE_TITLE", "")
    body = os.environ.get("ISSUE_BODY", "") or "(no description)"
    issue_number = os.environ["ISSUE_NUMBER"]

    prompt = PROMPT_TEMPLATE.format(context=REPO_CONTEXT, title=title, body=body)

    try:
        plan = call_claude(prompt)
    except urllib.error.HTTPError as e:
        plan = f"_Automated plan generation failed ({e.code}). A maintainer will triage manually._"
    except Exception as e:  # noqa: BLE001
        plan = f"_Automated plan generation failed: {e}. A maintainer will triage manually._"

    comment = (
        "🤖 **Auto-generated triage** (refine in Claude Code with "
        f"\"implement feedback #{issue_number}\")\n\n{plan}"
    )

    # Post via gh (preinstalled + authed by GH_TOKEN on the runner).
    subprocess.run(
        ["gh", "issue", "comment", issue_number, "--body-file", "-"],
        input=comment.encode(),
        check=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

# Release notes — pending fixes branch fixes/2026-07-12

> **Friday release instructions (for the agent asked to ship this):**
> 1. Confirm the SW CACHE version bump is included (pre-commit hook should have done it; if not, bump and commit).
> 2. Push the branch, merge it into master (fast-forward or merge commit), push master.
> 3. For EACH issue listed below: `gh issue comment <N>` with a short note that the fix is live, then `gh issue close <N>`.
> 4. Delete the fixes branch.

## Fixed
- **#11 — Bug: if I edit a date, close the editing window, and then click on the + to add a new date, the window opens with the data of the date that was editted**: closing the log sheet via its X button never reset the in-progress draft, so the ＋ button (which reuses the same sheet) reopened with the previous entry's data still loaded. The reset now happens inside `closeLogSheet()` itself, so every way of closing the sheet clears the draft.

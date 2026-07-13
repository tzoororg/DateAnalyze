# Release notes — pending fixes branch fixes/2026-07-12

> **Friday release instructions (for the agent asked to ship this):**
> 1. Confirm the SW CACHE version bump is included (pre-commit hook should have done it; if not, bump and commit).
> 2. Push the branch, merge it into master (fast-forward or merge commit), push master.
> 3. For EACH issue listed below: `gh issue comment <N>` with a short note that the fix is live, then `gh issue close <N>`.
> 4. Delete the fixes branch.

## Fixed
- **#11 — Bug: if I edit a date, close the editing window, and then click on the + to add a new date, the window opens with the data of the date that was editted**: closing the log sheet via its X button never reset the in-progress draft, so the ＋ button (which reuses the same sheet) reopened with the previous entry's data still loaded. The reset now happens inside `closeLogSheet()` itself, so every way of closing the sheet clears the draft.
- **#12 & #15 — stars on the home card are inverted, and opening a date always shows 5 stars**: `starStr` gave the empty-star span the `stars` class, so styling rules meant to color filled stars recolored the empty ones — inverting the home card and making every detail rating read as full. Filled and empty stars now use distinct `star-on`/`star-off` classes.
- **#13 — photo size not calibrated between a single image and a collage**: two-photo home cards used 100px rows while one-photo (150px) and 3+-photo (~152px) cards were taller, so a two-photo date looked a lot shorter. Two-up home mosaics now use 150px rows to match.
- **#14 — slideshow activates while choosing photos**: the idle screensaver counted time spent in the native photo picker (Android keeps the tab "visible" behind it), auto-launching the slideshow under the picker. It now also requires the document to have focus and restarts the idle clock when the app regains focus.

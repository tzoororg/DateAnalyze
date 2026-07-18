# Swipe navigation plan

Horizontal swipe gestures: (1) swipe left/right anywhere in the main view to move
between tabs, (2) swipe on the wrapped card to toggle "This year" ↔ "All time".

No design mock needed: pure gesture behavior, zero visible UI change.

## Existing pattern to reuse

`openLightbox()` in `js/ui.js` (~line 1685) already does touch-swipe:
touchstart records `clientX`, touchend compares delta, threshold 45px.
Extract that into a shared helper instead of writing it twice more.

## Implementation

### 1. Shared helper in `js/ui.js`

```js
// Swipe-left → onLeft(), swipe-right → onRight(). Ignores mostly-vertical drags
// and gestures that start inside a horizontally scrollable element.
function attachSwipe(el, onLeft, onRight) {
  let sx = null, sy = null;
  el.addEventListener("touchstart", e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    // don't hijack elements that scroll sideways themselves
    for (let n = e.target; n && n !== el; n = n.parentElement)
      if (n.scrollWidth > n.clientWidth + 5) { sx = null; return; }
  }, { passive: true });
  el.addEventListener("touchend", e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
      (dx < 0 ? onLeft : onRight)();
    sx = null;
  }, { passive: true });
}
```

Also refactor the lightbox swipe to use it (drop-in: `attachSwipe(box, () => goUser(1), () => goUser(-1))` — its extra `multi` guard folds into the callbacks).

### 2. Tab swipe

In `init()`, attach once to the persistent view container (the element `viewEl()`
returns lives inside — attach to its stable parent, not the re-rendered innerHTML):

```js
const TABS = ["home", "history", "insights", "suggest"];
attachSwipe(viewContainer,
  () => show(TABS[Math.min(TABS.length - 1, TABS.indexOf(currentTab) + 1)]),
  () => show(TABS[Math.max(0, TABS.indexOf(currentTab) - 1)]));
```

No wrap-around at the ends (matches platform convention). The scrollable-child
guard in the helper keeps category chip rows / wide chart wraps / photo strips
working normally.

### 3. Wrapped card swipe

In `renderInsights()` after render, attach to the wrapped card's container
(the `.chart-wrap` holding `C.wrappedCard` + its segment buttons):

```js
attachSwipe(wrapEl,
  () => setWrapPeriod("all"),    // whatever the existing seg-button handler calls
  () => setWrapPeriod("year"));
```

Reuse the exact code path the "This year"/"All time" seg buttons already run.
**Note:** the wrapped card sits inside the Insights tab, so its swipe handler
fires first on its own element; since the gesture started inside it and it
re-renders the tab, the outer tab-swipe must skip gestures the inner handler
consumed. Simplest fix: in the tab-level handler, ignore touches whose target
is inside the wrapped card container (one `closest()` check), same shape as the
scrollable-child guard.

### 4. Out of scope (YAGNI)

Other candidates (History list/gallery toggle, theme switcher, lightbox — already
has it). Don't add now; `attachSwipe` makes each a one-liner later if asked.

No animated slide transition between tabs — tabs re-render via innerHTML, so a
real sliding pane would mean restructuring the whole view layer. Instant switch
only.

## Testing

- `node --test test/logic.test.mjs` + `node test/smoke.mjs` must pass (no logic
  change expected, regression only).
- Add one smoke check: dispatch synthetic TouchEvents (touchstart/touchend with
  clientX delta > 60) on the view container, assert `currentTab` advanced; same
  on the wrapped card, assert the seg button "on" class flipped.
- Manual check on a real phone (beta deploy): tab swipe, wrapped swipe, and that
  the category chip row still scrolls without changing tabs.

## Estimate

~40 lines net in `js/ui.js`, minus ~8 removed from the lightbox. One file.

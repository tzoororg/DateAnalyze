// node --test js/highlights.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightReel } from "./analytics.js";

const now = new Date("2026-07-05T12:00:00");

test("only entries with photos appear; better scores rank first", () => {
  const dates = [
    { id: "a", date: "2025-01-01", title: "low",  enjoyment: 2, wouldRepeat: "no",  photos: ["p1"] },
    { id: "b", date: "2025-02-01", title: "high", enjoyment: 5, wouldRepeat: "yes", photos: ["p2", "p3"] },
    { id: "c", date: "2025-03-01", title: "nophoto", enjoyment: 5, wouldRepeat: "yes", photos: [] },
    { id: "d", date: "2025-03-02", title: "undefphoto", enjoyment: 5, wouldRepeat: "yes" },
  ];
  const reel = highlightReel(dates, now);
  assert.equal(reel.length, 3);                          // a(1) + b(2); c/d excluded
  assert.equal(reel[0].entryId, "b");                    // 5 + 1.5 beats 2 + 0
  assert.deepEqual([...new Set(reel.map(r => r.entryId))], ["b", "a"]);
});

test("on-this-day anniversary gets the +2 boost", () => {
  const dates = [
    { id: "plain", date: "2025-05-05", title: "plain", enjoyment: 3, wouldRepeat: "no", photos: ["p1"] },
    { id: "anniv", date: "2024-07-05", title: "anniv", enjoyment: 2, wouldRepeat: "no", photos: ["p2"] },
  ];
  const reel = highlightReel(dates, now);
  assert.equal(reel[0].entryId, "anniv");                // 2 + 0 + 2 = 4 beats plain's 3 + 0
});

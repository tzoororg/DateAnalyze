// Two-phone sync test against the Firebase Emulator Suite. Simulates each
// phone as its own headless-Chrome profile (separate IndexedDB + auth state)
// and drives the app's real store/sync modules in-page.
// Requires:  python -m http.server 8000
//        and firebase emulators:start --only auth,firestore,storage
//            (storage needed only for the Cloud Storage photo step 4b; the rest
//             run with --only auth,firestore)
// Run: node test/sync.test.mjs [baseUrl]
import { launchChrome, openTab, sleep } from "./cdp.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8000";
const URL = `${BASE}/index.html?shot=empty&emu=1`; // no seed, no SW, emulator backends

for (const [what, probe, fix] of [
  ["app server", BASE, "python -m http.server 8000"],
  ["auth emulator", "http://127.0.0.1:9099", "firebase emulators:start --only auth,firestore"],
  ["firestore emulator", "http://127.0.0.1:8080", "firebase emulators:start --only auth,firestore"],
]) {
  try { await fetch(probe); }
  catch { console.error(`FAIL ${what} not reachable — start it with: ${fix}`); process.exit(1); }
}

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " — " + detail}`);
  if (!ok) failures++;
};
// Poll an in-page expression on a tab until truthy (sync propagation is async).
const until = async (tab, expr, timeout = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await tab.evaluate(expr)) return true;
    await sleep(300);
  }
  return false;
};

const phoneA = await launchChrome({ port: 9225, profileName: "cdp-sync-a" });
const phoneB = await launchChrome({ port: 9226, profileName: "cdp-sync-b" });

try {
  const a = await openTab(phoneA, URL);
  const b = await openTab(phoneB, URL);
  await a.waitFor(`document.title.startsWith("SHOT-READY:")`);
  await b.waitFor(`document.title.startsWith("SHOT-READY:")`);

  // 1. phone A creates a space
  const code = await a.evaluate(`import("./js/store.js")
    .then(async s => { await s.signIn(); return s.createSpace(false); })`);
  check("create space returns combined code (server.key)",
    /^[A-HJ-NP-Z2-9]{8}\.[A-Za-z0-9_-]{43}$/.test(code || ""), String(code));
  const spaceId = await a.evaluate(`import("./js/store.js").then(s => s.getSetting("spaceId"))`);

  // 2. phone B joins with the code
  const joined = await b.evaluate(`import("./js/store.js")
    .then(async s => { await s.signIn(); return s.joinSpace(${JSON.stringify(code)}); })`);
  check("join space with code", joined === spaceId, `joined=${joined} expected=${spaceId}`);
  const modes = [await a.evaluate(`import("./js/store.js").then(s => s.getMode())`),
                 await b.evaluate(`import("./js/store.js").then(s => s.getMode())`)];
  check("both phones in cloud mode", modes[0] === "cloud" && modes[1] === "cloud", modes.join(","));

  // 2b. regenerate: fresh server code, same E2EE key, old invite doc retired
  const oldServerCode = code.split(".")[0];
  const oldKeySuffix = code.split(".")[1];
  const newCode = await a.evaluate(`import("./js/store.js").then(s => s.regenerateInviteCode())`);
  const newServerCode = (newCode || "").split(".")[0];
  const newKeySuffix = (newCode || "").split(".")[1];
  check("regenerate returns a different server code",
    newServerCode && newServerCode !== oldServerCode, `old=${oldServerCode} new=${newServerCode}`);
  check("regenerate preserves the E2EE key", newKeySuffix === oldKeySuffix,
    `old=${oldKeySuffix} new=${newKeySuffix}`);
  const storedCode = await a.evaluate(`import("./js/store.js").then(s => s.getInviteCode())`);
  check("regenerated code persisted to spaceInviteCode setting", storedCode === newCode, `stored=${storedCode} new=${newCode}`);
  const newInviteDoc = await fetch(
    `http://127.0.0.1:8080/v1/projects/us-date-tracker-c988b/databases/(default)/documents/invites/${newServerCode}`,
    { headers: { Authorization: "Bearer owner" } }
  );
  check("new invite doc exists in Firestore", newInviteDoc.status === 200, String(newInviteDoc.status));

  // 3. date logged on A appears on B with fields intact
  const entryId = await a.evaluate(`Promise.all([import("./js/store.js"), import("./js/model.js")])
    .then(async ([s, m]) => {
      const e = { ...m.blankEntry(), title: "Sync Test Date", category: "outdoors",
        enjoyment: 5, mood: ["romantic", "magical"], cost: 42 };
      await s.putDate(e);
      return e.id;
    })`);
  check("date A→B syncs", await until(b, `import("./js/store.js")
    .then(s => s.getAllDates()).then(ds => ds.some(d => d.id === ${JSON.stringify(entryId)}))`));
  const fields = await b.evaluate(`import("./js/store.js").then(s => s.getDate(${JSON.stringify(entryId)}))
    .then(d => [d.title, d.category, d.enjoyment, Array.isArray(d.mood) && d.mood.length, d.cost])`);
  check("synced fields intact", JSON.stringify(fields) === JSON.stringify(["Sync Test Date", "outdoors", 5, 2, 42]),
    JSON.stringify(fields));

  // 3b. E2EE: the raw Firestore doc is ciphertext (emulator REST API bypasses the app)
  const rawDoc = await fetch(
    `http://127.0.0.1:8080/v1/projects/us-date-tracker-c988b/databases/(default)/documents/spaces/${spaceId}/dates/${entryId}`,
    { headers: { Authorization: "Bearer owner" } } // emulator accepts the owner bypass token
  ).then(r => r.text());
  check("raw doc has enc field", rawDoc.includes('"enc"'), rawDoc.slice(0, 300));
  check("raw doc does not leak plaintext title", !rawDoc.includes("Sync Test Date"), rawDoc.slice(0, 300));

  // 4. photo syncs as a base64 Firestore doc
  const photoId = await a.evaluate(`import("./js/store.js").then(async s => {
    const blob = new Blob([new Uint8Array(2048).fill(7)], { type: "image/jpeg" });
    const pid = await s.putPhoto(blob);
    const d = await s.getDate(${JSON.stringify(entryId)});
    d.photos = [pid]; await s.putDate(d);
    return pid;
  })`);
  check("photo B fetch", await until(b, `import("./js/store.js")
    .then(s => s.getPhoto(${JSON.stringify(photoId)})).then(bl => !!bl && bl.size > 0)`));

  // 4b. Cloud Storage photo path (Blaze). Flip firebaseConfig.useStorage on both
  // phones at runtime, then: (i) a new photo written on A rides Cloud Storage and
  // B fetches+decrypts it; (ii) the step-4 base64 photo still loads via the
  // Storage-miss → base64-doc read fallback. Needs the storage emulator (port
  // 9199); skipped if it isn't up.
  const storageUp = await fetch("http://127.0.0.1:9199").then(() => true).catch(() => false);
  if (storageUp) {
    for (const phone of [a, b]) {
      await phone.evaluate(`import("./js/firebase-config.js").then(c => { c.firebaseConfig.useStorage = true; })`);
    }
    const storPhotoId = await a.evaluate(`import("./js/store.js").then(async s => {
      const blob = new Blob([new Uint8Array(4096).fill(9)], { type: "image/jpeg" });
      return s.putPhoto(blob);
    })`);
    check("Storage photo A→B fetch+decrypt", await until(b, `import("./js/store.js")
      .then(s => s.getPhoto(${JSON.stringify(storPhotoId)})).then(bl => !!bl && bl.size === 4096)`));
    // Read fallback: drop B's local cache of the base64-era photo, then getPhoto
    // with useStorage on must miss Storage and fall back to the Firestore doc.
    await b.evaluate(`import("./js/db.js").then(db => db.deletePhoto(${JSON.stringify(photoId)}))`);
    check("Storage-miss falls back to base64 doc", await until(b, `import("./js/store.js")
      .then(s => s.getPhoto(${JSON.stringify(photoId)})).then(bl => !!bl && bl.size > 0)`));
    for (const phone of [a, b]) {
      await phone.evaluate(`import("./js/firebase-config.js").then(c => { c.firebaseConfig.useStorage = false; })`);
    }
  } else {
    check("Storage photo path (SKIPPED — storage emulator not on port 9199)", true);
  }

  // 5. edit and delete propagate
  await a.evaluate(`import("./js/store.js").then(async s => {
    const d = await s.getDate(${JSON.stringify(entryId)});
    d.title = "Sync Test Date (edited)"; await s.putDate(d);
  })`);
  check("edit A→B propagates", await until(b, `import("./js/store.js")
    .then(s => s.getDate(${JSON.stringify(entryId)})).then(d => d?.title === "Sync Test Date (edited)")`));
  await a.evaluate(`import("./js/store.js").then(s => s.deleteDate(${JSON.stringify(entryId)}))`);
  check("delete A→B propagates", await until(b, `import("./js/store.js")
    .then(s => s.getAllDates()).then(ds => !ds.some(d => d.id === ${JSON.stringify(entryId)}))`));

  // 6. rules: a signed-in non-member cannot read the space
  const phoneC = await launchChrome({ port: 9227, profileName: "cdp-sync-c" });
  try {
    const c = await openTab(phoneC, URL);
    await c.waitFor(`document.title.startsWith("SHOT-READY:")`);
    const denied = await c.evaluate(`import("./js/sync.js").then(async sync => {
      await sync.signIn();
      try { await sync.restoreSession(${JSON.stringify(spaceId)}); await sync.getAllDates(); return "allowed"; }
      catch (e) { return String(e.message || e); }
    })`);
    // Emulator wording differs from prod ("false for 'list'" vs "permission-denied");
    // what matters is that the read rejected instead of returning data.
    check("non-member read denied by rules", denied !== "allowed", denied);

    // 7. invalid invite code rejects cleanly
    const badJoin = await c.evaluate(`import("./js/sync.js").then(s => s.joinSpace("XXXXXX"))
      .then(() => "joined").catch(e => String(e.message || e))`);
    check("invalid invite rejected", /isn't valid/.test(badJoin), badJoin);
  } finally {
    phoneC.close();
  }

  // 8. account deletion: non-last member just loses membership; last member
  // deleting takes the whole space (dates already emptied by step 5) with it.
  const spaceDocUrl = `http://127.0.0.1:8080/v1/projects/us-date-tracker-c988b/databases/(default)/documents/spaces/${spaceId}`;
  const membersBefore = await fetch(`${spaceDocUrl}/members`, { headers: { Authorization: "Bearer owner" } }).then(r => r.json());
  check("space has 2 members before any deletion", (membersBefore.documents || []).length === 2, JSON.stringify(membersBefore));

  await b.evaluate(`import("./js/store.js").then(s => s.deleteAccount())`);
  check("B back to local mode after delete",
    await b.evaluate(`import("./js/store.js").then(s => s.getMode())`) === "local");
  const membersAfterB = await fetch(`${spaceDocUrl}/members`, { headers: { Authorization: "Bearer owner" } }).then(r => r.json());
  check("B's member doc removed, space still exists (not last member)",
    (membersAfterB.documents || []).length === 1, JSON.stringify(membersAfterB));

  await a.evaluate(`import("./js/store.js").then(s => s.deleteAccount())`);
  check("A back to local mode after delete",
    await a.evaluate(`import("./js/store.js").then(s => s.getMode())`) === "local");
  const spaceAfterA = await fetch(spaceDocUrl, { headers: { Authorization: "Bearer owner" } });
  check("space doc deleted after last member deletes account", spaceAfterA.status === 404, String(spaceAfterA.status));
  const membersAfterA = await fetch(`${spaceDocUrl}/members`, { headers: { Authorization: "Bearer owner" } }).then(r => r.json());
  check("no member docs left after last member deletes account",
    !(membersAfterA.documents || []).length, JSON.stringify(membersAfterA));
} catch (err) {
  check("sync run completed", false, err.message);
} finally {
  phoneA.close();
  phoneB.close();
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL SYNC TESTS PASSED");
process.exit(failures ? 1 : 0);

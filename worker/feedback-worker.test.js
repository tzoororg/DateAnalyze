// Self-check for feedback-worker.js: crash-report path (label, dedup) and that the
// plain feedback path is unaffected. Run: node worker/feedback-worker.test.js
import assert from "node:assert";
import worker from "./feedback-worker.js";

const env = { GITHUB_TOKEN: "gh-tok", ALLOWED_ORIGIN: "https://example.com" };

function req(body) {
  return new Request("https://worker.example/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 1) crash, no existing issue -> creates one with label "crash" and crashfp marker
{
  const realFetch = globalThis.fetch;
  const created = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("/search/issues")) {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    if (u.includes("/issues") && init?.method === "POST") {
      created.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ number: 42, html_url: "https://x/42" }), { status: 201 });
    }
    return realFetch(url, init);
  };
  try {
    const res = await worker.fetch(
      req({ kind: "crash", fingerprint: "abc123", text: "TypeError: boom", meta: { appVersion: "v1", ua: "ua", at: "t" } }),
      env
    );
    const data = await res.json();
    assert.equal(res.status, 201, "issue created");
    assert.equal(created.length, 1, "one issue create call");
    assert.deepEqual(created[0].labels, ["crash"], "labeled crash");
    assert.ok(created[0].body.includes("crashfp:abc123"), "body has fingerprint marker");
    assert.ok(created[0].body.includes("From in-app crash report"), "body has crash header");
    assert.equal(data.number, 42);
  } finally { globalThis.fetch = realFetch; }
}

// 2) crash, existing open issue with same fingerprint -> comment posted, no issue create, deduped:true
{
  const realFetch = globalThis.fetch;
  let commentPosted = null;
  let issueCreated = false;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("/search/issues")) {
      return new Response(JSON.stringify({ items: [{ number: 7, html_url: "https://x/7" }] }), { status: 200 });
    }
    if (u.includes("/comments") && init?.method === "POST") {
      commentPosted = JSON.parse(init.body);
      return new Response(JSON.stringify({}), { status: 201 });
    }
    if (u.includes("/repos/") && u.includes("/issues") && init?.method === "POST") {
      issueCreated = true;
      return new Response(JSON.stringify({ number: 99 }), { status: 201 });
    }
    return realFetch(url, init);
  };
  try {
    const res = await worker.fetch(
      req({ kind: "crash", fingerprint: "abc123", text: "TypeError: boom again", meta: { appVersion: "v1", ua: "ua", at: "t2" } }),
      env
    );
    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.deduped, true, "reports as deduped");
    assert.equal(data.number, 7, "returns existing issue number");
    assert.equal(issueCreated, false, "no new issue created");
    assert.ok(commentPosted, "comment posted");
    assert.ok(commentPosted.body.includes("Another occurrence"), "comment says another occurrence");
  } finally { globalThis.fetch = realFetch; }
}

// 3) plain feedback (no kind) -> still labeled "feedback"
{
  const realFetch = globalThis.fetch;
  const created = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("/issues") && init?.method === "POST") {
      created.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ number: 1, html_url: "https://x/1" }), { status: 201 });
    }
    return realFetch(url, init);
  };
  try {
    const res = await worker.fetch(
      req({ text: "Please add dark mode", meta: { appVersion: "v1", ua: "ua", at: "t" } }),
      env
    );
    assert.equal(res.status, 201);
    assert.deepEqual(created[0].labels, ["feedback"], "labeled feedback");
    assert.ok(created[0].body.includes("From in-app feedback"), "body has feedback header");
  } finally { globalThis.fetch = realFetch; }
}

console.log("feedback-worker: ok");

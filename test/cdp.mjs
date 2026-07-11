// Minimal Chrome DevTools Protocol client, shared by test/smoke.mjs,
// test/sync.test.mjs, and design/capture.mjs. Spawns headless Chrome and
// exposes per-tab helpers (evaluate / waitFor / console-error capture).
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launchChrome({ port = 9224, profileName = "cdp-test-profile" } = {}) {
  const profile = path.join(process.env.TEMP || "/tmp", profileName);
  rmSync(profile, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });

  let ws = null, msgId = 0;
  const pending = new Map();
  const listeners = []; // { method, sessionId, cb }
  for (let i = 0; i < 50 && !ws; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      ws = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    } catch { ws = null; await sleep(300); }
  }
  if (!ws) { chrome.kill(); throw new Error("could not reach Chrome DevTools"); }

  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method) {
      for (const l of listeners) {
        if (l.method === m.method && (!l.sessionId || l.sessionId === m.sessionId)) l.cb(m.params);
      }
    }
  };

  const send = (method, params = {}, sessionId) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => pending.set(id, { res, rej }));
  };
  const on = (method, cb, sessionId) => listeners.push({ method, sessionId, cb });
  const close = () => { try { ws.close(); } catch {} chrome.kill(); };
  return { send, on, close };
}

// Open a tab emulating a phone viewport. Collects console errors + uncaught
// exceptions in tab.errors for later assertion.
export async function openTab(cdp, url, { width = 390, height = 844 } = {}) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);
  await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
  await s("Page.enable");
  await s("Runtime.enable");

  const errors = [];
  cdp.on("Runtime.exceptionThrown", p =>
    errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || "uncaught exception"), sessionId);
  cdp.on("Runtime.consoleAPICalled", p => {
    if (p.type === "error") errors.push(p.args.map(a => a.value ?? a.description ?? "").join(" "));
  }, sessionId);

  await s("Page.navigate", { url });

  const evaluate = async expression => {
    const { result, exceptionDetails } = await s("Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const waitFor = async (expression, { timeout = 15000, every = 200 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evaluate(expression)) return true;
      await sleep(every);
    }
    throw new Error(`timed out waiting for: ${expression}`);
  };
  const close = () => cdp.send("Target.closeTarget", { targetId });
  return { s, evaluate, waitFor, errors, close };
}

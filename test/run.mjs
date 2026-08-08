// One-shot test runner: starts the dev server if needed, runs logic + smoke,
// tears the server down. Exit code 0 = all green.
// Run: node test/run.mjs
import { spawn } from "node:child_process";

const BASE = "http://127.0.0.1:8000";

const serverUp = async () => {
  try { await fetch(BASE, { method: "HEAD" }); return true; } catch { return false; }
};

let server = null;
if (!(await serverUp())) {
  server = spawn("python", ["-m", "http.server", "8000"], { stdio: "ignore" });
  for (let i = 0; i < 20 && !(await serverUp()); i++) await new Promise(r => setTimeout(r, 250));
  if (!(await serverUp())) { server.kill(); console.error("FAIL could not start dev server on :8000"); process.exit(1); }
}

const run = (args) => new Promise(res => {
  const p = spawn(process.execPath, args, { stdio: "inherit" });
  p.on("exit", code => res(code ?? 1));
});

let failed = 0;
failed += await run(["--test", "test/logic.test.mjs"]);
failed += await run(["test/smoke.mjs"]);

if (server) server.kill();
process.exit(failed ? 1 : 0);

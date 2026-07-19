// Kill-switch helper: compare a running SW cache name against the minimum
// required cache name (from version.json). Fails open — any parse failure
// or running >= min means "not outdated".

function parseVer(name) {
  const m = /v(\d+)\.(\d+)\.(\d+)/.exec(name || "");
  return m ? [+m[1], +m[2], +m[3]] : null;
}

export function cacheOutdated(running, min) {
  const r = parseVer(running);
  const m = parseVer(min);
  if (!r || !m) return false;
  for (let i = 0; i < 3; i++) {
    if (r[i] < m[i]) return true;
    if (r[i] > m[i]) return false;
  }
  return false;
}

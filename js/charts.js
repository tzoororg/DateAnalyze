// Hand-rolled inline-SVG charts. No dependencies -> clean offline behaviour.
// Each function returns an SVG string. Colors use CSS variables so theming is automatic.

const esc = s => String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

// Horizontal bar chart for category enjoyment (value scale 0..5).
export function barChart(rows, { max = 5, unit = "★" } = {}) {
  if (!rows.length) return emptySvg("No data yet");
  const W = 320, rowH = 34, padL = 96, padR = 40, top = 8;
  const H = top * 2 + rows.length * rowH;
  const barW = W - padL - padR;
  let bars = "";
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const w = Math.max(2, (r.value / max) * barW);
    bars += `
      <text x="${padL - 8}" y="${y + 21}" text-anchor="end" font-size="13" fill="var(--muted)">${esc(r.label)}</text>
      <rect x="${padL}" y="${y + 8}" width="${barW}" height="16" rx="8" fill="var(--bg-soft)"/>
      <rect x="${padL}" y="${y + 8}" width="${w}" height="16" rx="8" fill="url(#g1)"/>
      <text x="${padL + w + 6}" y="${y + 21}" font-size="12" font-weight="700" fill="var(--text)">${r.value.toFixed(1)}${unit}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${defsGrad()}${bars}</svg>`;
}

// Line chart of monthly avg enjoyment with a frequency bar underlay.
export function trendChart(points) {
  if (points.length < 1) return emptySvg("No data yet");
  const W = 320, H = 170, padL = 28, padR = 12, padT = 12, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = points.length;
  const xAt = i => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = v => padT + innerH - (v / 5) * innerH;
  const maxCount = Math.max(1, ...points.map(p => p.count));

  let bars = "";
  points.forEach((p, i) => {
    const h = (p.count / maxCount) * innerH;
    const bw = Math.max(6, innerW / n * 0.5);
    bars += `<rect x="${xAt(i) - bw / 2}" y="${padT + innerH - h}" width="${bw}" height="${h}" rx="3" fill="var(--card-2)"/>`;
  });

  const line = points.map((p, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(p.avgEnjoyment).toFixed(1)}`).join(" ");
  let dots = "", labels = "";
  points.forEach((p, i) => {
    dots += `<circle cx="${xAt(i)}" cy="${yAt(p.avgEnjoyment)}" r="3.5" fill="var(--accent)"/>`;
    if (n <= 8 || i % Math.ceil(n / 6) === 0)
      labels += `<text x="${xAt(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(p.label)}</text>`;
  });
  // gridlines at 1..5
  let grid = "";
  for (let v = 1; v <= 5; v++) {
    const y = yAt(v);
    grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--line)" stroke-width="1" opacity=".5"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${grid}${bars}
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${labels}</svg>`;
}

// Scatter of enjoyment (y, 0..5) vs cost (x, log-ish).
export function scatterChart(pts) {
  if (!pts.length) return emptySvg("Add cost to dates to see this");
  const W = 320, H = 180, padL = 32, padR = 14, padT = 12, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxCost = Math.max(10, ...pts.map(p => p.x));
  const xAt = c => padL + (Math.log10(c + 1) / Math.log10(maxCost + 1)) * innerW;
  const yAt = v => padT + innerH - (v / 5) * innerH;
  let grid = "";
  for (let v = 1; v <= 5; v++) {
    const y = yAt(v);
    grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--line)" opacity=".5"/>
      <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--muted)">${v}</text>`;
  }
  [0, maxCost / 2, maxCost].forEach(c => {
    grid += `<text x="${xAt(c)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="var(--muted)">$${Math.round(c)}</text>`;
  });
  const dots = pts.map(p =>
    `<circle cx="${xAt(p.x).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="5" fill="url(#g1)" opacity=".85"><title>${esc(p.label)}</title></circle>`
  ).join("");
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">
    ${defsGrad()}${grid}${dots}</svg>`;
}

// A small two-segment donut for the explore/exploit balance.
export function balanceDonut(newCount, repeatCount) {
  const total = Math.max(1, newCount + repeatCount);
  const frac = newCount / total;
  const R = 52, C = 2 * Math.PI * R, cx = 70, cy = 70;
  const dash = frac * C;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" role="img">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--good)" stroke-width="16"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--accent-2)" stroke-width="16"
      stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text)">${Math.round(frac * 100)}%</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">new</text>
  </svg>`;
}

// Shareable "Wrapped" recap card. Fixed brand palette (not CSS vars) — this
// gets rasterized to a PNG and shared outside the app, so it must look the
// same regardless of the viewer's or owner's active in-app theme.
export const WRAPPED_W = 1080, WRAPPED_H = 1350;
export function wrappedCard(stats) {
  const W = WRAPPED_W, H = WRAPPED_H;
  const kicker = `US ♥ WRAPPED · ${stats.periodLabel}`;
  const bg = `
    <defs>
      <linearGradient id="wbg" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stop-color="#4a2138"/><stop offset="55%" stop-color="#2a1b26"/><stop offset="100%" stop-color="#1e1420"/>
      </linearGradient>
      <radialGradient id="wglowPink" cx="85%" cy="-5%" r="70%">
        <stop offset="0%" stop-color="#ff9fba" stop-opacity="0.35"/><stop offset="60%" stop-color="#ff9fba" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="wglowGreen" cx="5%" cy="105%" r="65%">
        <stop offset="0%" stop-color="#7ed3ab" stop-opacity="0.18"/><stop offset="60%" stop-color="#7ed3ab" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="wclip"><rect width="${W}" height="${H}" rx="56"/></clipPath>
    </defs>
    <g clip-path="url(#wclip)">
      <rect width="${W}" height="${H}" fill="url(#wbg)"/>
      <rect width="${W}" height="${H}" fill="url(#wglowPink)"/>
      <rect width="${W}" height="${H}" fill="url(#wglowGreen)"/>
    </g>`;
  const svgOpen = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" font-family="system-ui,-apple-system,'Segoe UI',sans-serif">`;

  if (!stats.count) {
    return `${svgOpen}${bg}
      <text x="${W / 2}" y="${H / 2 - 10}" text-anchor="middle" font-size="30" font-weight="700" letter-spacing="5" fill="#ff9fba">${esc(kicker)}</text>
      <text x="${W / 2}" y="${H / 2 + 50}" text-anchor="middle" font-size="32" fill="#c99bb0">No dates logged yet</text>
    </svg>`;
  }

  const cols = [];
  if (stats.favCategory) cols.push({ emoji: stats.favCategory.emoji, label: "FAVORITE", value: stats.favCategory.label, sub: `${stats.favCategory.count} date${stats.favCategory.count === 1 ? "" : "s"}` });
  if (stats.mostRepeated) cols.push({ emoji: stats.mostRepeated.emoji, label: "MOST REPEATED", value: stats.mostRepeated.title, sub: `★ ${stats.mostRepeated.avgEnjoyment.toFixed(1)}` });
  if (stats.bestMonth) cols.push({ emoji: "📅", label: "BEST MONTH", value: stats.bestMonth.label, sub: `${stats.bestMonth.count} date${stats.bestMonth.count === 1 ? "" : "s"}` });
  const colW = 900 / Math.max(1, cols.length);
  const colsSvg = cols.map((c, i) => {
    const cx = 90 + colW * i + colW / 2;
    return `
      <text x="${cx}" y="630" text-anchor="middle" font-size="84">${esc(c.emoji)}</text>
      <text x="${cx}" y="686" text-anchor="middle" font-size="24" font-weight="800" letter-spacing="1.5" fill="#e79fc0">${esc(c.label)}</text>
      <text x="${cx}" y="732" text-anchor="middle" font-size="34" font-weight="800" fill="#fff">${esc(truncate(c.value, 16))}</text>
      <text x="${cx}" y="770" text-anchor="middle" font-size="24" fill="#e9d5e0">${esc(c.sub)}</text>`;
  }).join("");

  const vibeLine = stats.vibes?.length ? `our vibe: ${stats.vibes.join(" · ")}` : "";

  return `${svgOpen}${bg}
    <text x="${W / 2}" y="170" text-anchor="middle" font-size="30" font-weight="700" letter-spacing="5" fill="#ff9fba">${esc(kicker)}</text>
    <text x="${W / 2}" y="340" text-anchor="middle" font-size="220" font-weight="800" fill="#fff">${stats.count}</text>
    <text x="${W / 2}" y="398" text-anchor="middle" font-size="42" font-weight="600" fill="#f5e6ee" opacity="0.85">dates together</text>
    <text x="${W / 2}" y="466" text-anchor="middle" font-size="38" fill="#f5e6ee" opacity="0.9"><tspan font-weight="800" fill="#e8c97a">★ ${stats.avgEnjoyment.toFixed(1)}</tspan> average · ${esc(stats.totalCostFmt)} shared</text>
    ${colsSvg}
    ${vibeLine ? `<line x1="90" y1="900" x2="990" y2="900" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
    <text x="${W / 2}" y="950" text-anchor="middle" font-size="30" fill="#e9d5e0">${esc(vibeLine)}</text>` : ""}
    <line x1="90" y1="1230" x2="990" y2="1230" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
    <text x="${W / 2}" y="1280" text-anchor="middle" font-size="26" font-weight="800" letter-spacing="3" fill="#ff7fa2">MADE WITH US · OUR DATE JOURNAL</text>
  </svg>`;
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function defsGrad() {
  return `<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/>
  </linearGradient></defs>`;
}
function emptySvg(msg) {
  return `<svg viewBox="0 0 320 80" xmlns="http://www.w3.org/2000/svg">
    <text x="160" y="44" text-anchor="middle" font-size="13" fill="var(--muted)">${esc(msg)}</text></svg>`;
}

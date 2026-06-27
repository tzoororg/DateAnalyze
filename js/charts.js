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

function defsGrad() {
  return `<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/>
  </linearGradient></defs>`;
}
function emptySvg(msg) {
  return `<svg viewBox="0 0 320 80" xmlns="http://www.w3.org/2000/svg">
    <text x="160" y="44" text-anchor="middle" font-size="13" fill="var(--muted)">${esc(msg)}</text></svg>`;
}

// Shared bits for every specimen template. System fonts only, so rendering is
// offline and the same on every run.

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// A ground-truth field. render.ts measures every [data-field] element: the box is
// its on-page rectangle, the value is its text exactly as printed, and
// data-norm carries the normalized value (e.g. an ISO date).
export const field = (name: string, printed: string, normalized = printed) =>
  `<span class="fv" data-field="${name}" data-norm="${esc(normalized)}">${esc(printed)}</span>`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
export const dateShort = (iso: string) => { const [y, m, d] = parts(iso); return `${String(d).padStart(2, "0")} ${MONTHS[m - 1].slice(0, 3).toUpperCase()} ${y}`; };
export const dateLong = (iso: string) => { const [y, m, d] = parts(iso); return `${d} ${MONTHS[m - 1]} ${y}`; };
export const money = (n: number) => `V$ ${n.toFixed(2)}`;

export const page = (width: number, height: number, css: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; background: #fff; overflow: hidden; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1d2430; }
  .doc { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }
  .wm { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-24deg);
        font-weight: 800; letter-spacing: 0.12em; color: rgba(196, 30, 40, 0.13); white-space: nowrap;
        z-index: 1; pointer-events: none; }
  .stamp { position: absolute; z-index: 3; border: 5px solid #c41e28; color: #c41e28; font-weight: 800;
           letter-spacing: 0.14em; padding: 6px 18px; transform: rotate(-6deg); background: rgba(255,255,255,0.85); }
  .layer { position: relative; z-index: 2; }
  ${css}
</style></head><body>${body}</body></html>`;

// Decorative wavy line pattern; a generic sine texture, not modelled on any real document.
export function waves(width: number, height: number, color: string, lines = 26) {
  const paths: string[] = [];
  for (let k = 0; k < lines; k++) {
    const base = (height / lines) * (k + 0.5);
    let d = `M0 ${base.toFixed(1)}`;
    for (let x = 0; x <= width; x += 16) d += ` L${x} ${(base + 14 * Math.sin(x / 70 + k * 0.45) + 6 * Math.sin(x / 23 + k)).toFixed(1)}`;
    paths.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4"/>`);
  }
  return `<svg width="${width}" height="${height}" style="position:absolute;inset:0" xmlns="http://www.w3.org/2000/svg">${paths.join("")}</svg>`;
}

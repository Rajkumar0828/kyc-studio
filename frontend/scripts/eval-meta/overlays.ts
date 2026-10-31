import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { imageSize } from "../../src/lib/pipeline/quality";
import type { Box, FieldScore } from "./score";

// One static HTML page per document: the specimen image with model boxes (red)
// and truth boxes (green), labelled per field. Built from run results only, no API.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// A src that works when the HTML is opened by double-click (file://): a relative,
// URL-encoded path when possible, else a file:/// URL (e.g. a different drive).
export function imageHref(htmlFile: string, imageFile: string): string {
  const rel = path.relative(path.dirname(htmlFile), imageFile);
  if (!rel || path.isAbsolute(rel)) return pathToFileURL(imageFile).href;
  return rel.split(path.sep).map(encodeURIComponent).join("/");
}

// Inverse of imageHref, for tests: the file the browser would load.
export function resolveHref(htmlFile: string, href: string): string {
  if (href.startsWith("file:")) return fileURLToPath(href);
  return path.resolve(path.dirname(htmlFile), ...href.split("/").map(decodeURIComponent));
}

const rect = (b: Box, cls: string, label: string) => {
  const [x0, y0, x1, y1] = b.map((v) => v / 10);
  return `<div class="box ${cls}" style="left:${x0}%;top:${y0}%;width:${Math.max(x1 - x0, 0.2)}%;height:${Math.max(y1 - y0, 0.2)}%"><span>${esc(label)}</span></div>`;
};

const yn = (v: boolean | null) => (v === null ? "–" : v ? "✓" : "✗");

export interface OverlayInput {
  htmlFile: string;
  imageFile: string;
  title: string;
  subtitle: string[];
  fields: FieldScore[];
}

export function writeOverlay(o: OverlayInput) {
  const bytes = fs.readFileSync(o.imageFile);
  const size = imageSize(bytes);
  const dims = size ? `${size.w} × ${size.h} px` : "unknown size";
  const boxes = o.fields.flatMap((f) => [
    ...(f.truthBox ? [rect(f.truthBox, "truth", f.field)] : []),
    ...(f.modelBox ? [rect(f.modelBox, "model", f.field)] : []),
  ]);
  const rows = o.fields.map((f) => {
    const d = f.diagnostics;
    return `<tr><th scope="row">${esc(f.field)}</th><td>${esc(f.truthFound ? f.truth : "(absent)")}</td><td>${esc(f.modelFound ? f.model : "(absent)")}</td>` +
      `<td>${yn(f.valuePass)}</td><td>${f.iou === null ? "–" : f.iou.toFixed(2)}</td><td>${yn(f.centreInside)}</td><td>${yn(f.boxPass)}</td>` +
      `<td>${d ? `${d.dxPct.toFixed(1)}% / ${d.dyPct.toFixed(1)}%` : "–"}</td>` +
      `<td>${d ? `${d.widthRatio?.toFixed(2) ?? "–"} / ${d.heightRatio?.toFixed(2) ?? "–"}` : "–"}</td></tr>`;
  }).join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)} · overlay</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0 auto; max-width: 1200px; padding: 24px; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; } p.meta { margin: 0 0 12px; color: #666; font-size: .9rem; }
  .legend { display: flex; gap: 16px; font-size: .9rem; margin-bottom: 12px; }
  .swatch { display: inline-block; width: 12px; height: 12px; border: 2px solid; vertical-align: -2px; margin-right: 4px; }
  figure { position: relative; margin: 0; border: 1px solid #8884; }
  figure img { display: block; width: 100%; height: auto; }
  .box { position: absolute; box-sizing: border-box; border: 2px solid; }
  .box span { position: absolute; left: -2px; font: 600 11px/1.3 system-ui, sans-serif; padding: 0 3px; color: #fff; white-space: nowrap; }
  .truth { border-color: #16a34a; } .truth span { background: #16a34a; top: 100%; }
  .model { border-color: #dc2626; } .model span { background: #dc2626; bottom: 100%; }
  table { border-collapse: collapse; margin-top: 16px; font-size: .9rem; width: 100%; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #8884; }
</style></head>
<body>
<h1>${esc(o.title)}</h1>
<p class="meta">${[dims, ...o.subtitle].map(esc).join(" · ")}</p>
<div class="legend"><span><span class="swatch" style="border-color:#dc2626"></span>Model box</span><span><span class="swatch" style="border-color:#16a34a"></span>Truth box</span></div>
<figure>
  <img src="${esc(imageHref(o.htmlFile, o.imageFile))}" alt="Synthetic specimen ${esc(o.title)} with model boxes in red and truth boxes in green">
  ${boxes.join("\n  ")}
</figure>
<table>
  <caption style="text-align:left;font-weight:600;padding:8px 0">Fields (offset and size ratio are shown for failed boxes only)</caption>
  <thead><tr><th scope="col">Field</th><th scope="col">Truth</th><th scope="col">Model</th><th scope="col">Value</th><th scope="col">IoU</th><th scope="col">Centre in</th><th scope="col">Box</th><th scope="col">Offset dx / dy</th><th scope="col">Size w / h</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</body></html>
`;
  fs.mkdirSync(path.dirname(o.htmlFile), { recursive: true });
  fs.writeFileSync(o.htmlFile, html);
}

export const overlayName = (doc: string, suffix = "") => `${doc.replace(/\.png$/i, "").replace(/[\\/]/g, "_")}${suffix}.html`;

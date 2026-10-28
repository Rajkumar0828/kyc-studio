import fs from "node:fs";
import path from "node:path";
import { extractId, countIdTokens } from "../src/lib/meta/extractId";

// Usage: npx tsx --env-file=.env.local scripts/day1.ts [path/to/specimen.png]
const imgPath = process.argv[2] ?? "../eval/specimens/id-01.png";
const mime = imgPath.toLowerCase().endsWith(".jpg") || imgPath.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : "image/png";
const img = fs.readFileSync(imgPath).toString("base64");

async function main() {
  console.log("input tokens:", await countIdTokens(img, mime));

  const r = await extractId(img, mime);
  console.log(JSON.stringify(r, null, 2));

  // Write an HTML overlay so the evidence boxes can be checked by eye.
  const outDir = "../eval/out";
  fs.mkdirSync(outDir, { recursive: true });
  const name = path.basename(imgPath, path.extname(imgPath));
  const rects = Object.entries(r)
    .filter(([, f]) => typeof f === "object" && f.found)
    .map(([k, f]) => {
      const [x0, y0, x1, y1] = (f as { box: number[] }).box;
      return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="red" stroke-width="3" vector-effect="non-scaling-stroke"/>` +
        `<text x="${x0}" y="${Math.max(y0 - 4, 12)}" fill="red" font-size="14">${k}</text>`;
    })
    .join("\n");
  const html = `<!doctype html><meta charset="utf-8"><title>${name} boxes</title>
<div style="position:relative;display:inline-block">
<img src="data:${mime};base64,${img}" style="display:block;max-width:100%">
<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">${rects}</svg>
</div>`;
  const out = path.join(outDir, `${name}.html`);
  fs.writeFileSync(out, html);
  console.log("box overlay:", path.resolve(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { chromium, type Browser } from "playwright-core";

export type Box = [number, number, number, number];
export interface MeasuredField {
  value: string;
  normalized: string;
  box: Box;
}
export interface Rendered {
  png: Buffer;
  width: number;
  height: number;
  fields: Record<string, MeasuredField>;
}

// Uses the Microsoft Edge already installed on Windows; no browser download.
export const launch = (): Promise<Browser> => chromium.launch({ channel: "msedge", headless: true });

// Passed as a string so the bundler cannot inject helpers that don't exist in the page.
const MEASURE = `Array.from(document.querySelectorAll("[data-field]")).map((e) => {
  const r = e.getBoundingClientRect();
  return { name: e.getAttribute("data-field"), value: e.textContent, normalized: e.getAttribute("data-norm"),
           x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
})`;

// Renders one HTML page at exactly width x height CSS px (1 px = 1 image px),
// measures every [data-field] element, then screenshots. Blur is applied after
// measuring; a CSS filter does not move layout, so the boxes stay correct.
export async function render(browser: Browser, html: string, width: number, height: number, blurPx = 0): Promise<Rendered> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready");
    const raw = (await page.evaluate(MEASURE)) as Array<{ name: string; value: string; normalized: string | null; x0: number; y0: number; x1: number; y1: number }>;
    if (blurPx) await page.addStyleTag({ content: `.doc { filter: blur(${blurPx}px); }` });
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });

    // Outward rounding so the box always contains the printed text.
    const fx = (v: number) => (v / width) * 1000, fy = (v: number) => (v / height) * 1000;
    const clamp = (n: number) => Math.min(1000, Math.max(0, n));
    const fields: Record<string, MeasuredField> = {};
    for (const f of raw) {
      if (fields[f.name]) throw new Error(`field ${f.name} appears twice`);
      fields[f.name] = {
        value: f.value,
        normalized: f.normalized ?? f.value,
        box: [clamp(Math.floor(fx(f.x0))), clamp(Math.floor(fy(f.y0))), clamp(Math.ceil(fx(f.x1))), clamp(Math.ceil(fy(f.y1)))],
      };
    }
    return { png, width, height, fields };
  } finally {
    await page.close();
  }
}

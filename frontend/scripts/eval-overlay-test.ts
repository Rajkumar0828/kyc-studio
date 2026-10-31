// Offline tests for eval overlay pages. Usage: npx tsx scripts/eval-overlay-test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { imageHref, overlayName, resolveHref, writeOverlay } from "./eval-meta/overlays";
import { scoreField } from "./eval-meta/score";

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message.split("\n").join("\n      ") : e}`);
  }
}

const REPO = path.resolve(__dirname, "..", "..");
const IMAGE = path.join(REPO, "eval", "specimens", "p1-clean", "id.png");
// Same layout as a real run: eval/reports/<timestamp>/overlays/<name>.html (gitignored).
const RUN_DIR = path.join(REPO, "eval", "reports", "__overlay-test__");
const HTML = path.join(RUN_DIR, "overlays", overlayName("p1-clean/id.png"));

test("the image href in the real report layout is relative and points at an existing image", () => {
  const href = imageHref(HTML, IMAGE);
  assert.ok(!href.startsWith("file:") && !path.isAbsolute(href), href);
  const target = resolveHref(HTML, href);
  assert.equal(path.resolve(target), path.resolve(IMAGE));
  assert.ok(fs.existsSync(target), target);
});

test("paths with spaces are URL-encoded and resolve back", () => {
  const html = path.join(REPO, "eval", "reports", "a b", "overlays", "x.html");
  const img = path.join(REPO, "eval", "img dir", "y.png");
  const href = imageHref(html, img);
  assert.match(href, /img%20dir\/y\.png$/);
  assert.equal(path.resolve(resolveHref(html, href)), path.resolve(img));
});

test("a page on another drive or root links the image with a file:/// URL that exists", () => {
  const html = path.join(os.tmpdir(), "kyc-overlay", "x.html");
  const href = imageHref(html, IMAGE);
  const target = resolveHref(html, href);
  if (path.parse(html).root.toLowerCase() !== path.parse(IMAGE).root.toLowerCase()) assert.ok(href.startsWith("file:///"), href);
  assert.ok(fs.existsSync(target), target);
});

test("the overlay page draws model and truth boxes, shows pixel size, and escapes text", () => {
  const truth = { found: true, value: "ELIN THORNQUIST", normalized: "Elin Thornquist", box: [332, 260, 555, 314] as [number, number, number, number] };
  const fields = [
    scoreField("full_name", { found: true, value: "<script>alert(1)</script>", box: [600, 600, 700, 650] }, truth),
    scoreField("expiry_date", { found: false, value: "", box: [0, 0, 0, 0] }, { found: false, value: "", normalized: "", box: [0, 0, 0, 0] }),
  ];
  writeOverlay({ htmlFile: HTML, imageFile: IMAGE, title: "p1-clean/id.png", subtitle: ["case p1-clean"], fields });
  const html = fs.readFileSync(HTML, "utf8");
  assert.match(html, /class="box truth"/);
  assert.match(html, /class="box model"/);
  assert.match(html, /1712 × 1080 px/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  const src = html.match(/<img src="([^"]+)"/)![1];
  assert.ok(fs.existsSync(resolveHref(HTML, src.replace(/&amp;/g, "&"))));
});

fs.rmSync(RUN_DIR, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);

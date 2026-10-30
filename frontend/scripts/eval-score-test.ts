// Offline tests for the Meta eval's scoring rules. No API calls.
// Usage: npx tsx scripts/eval-score-test.ts
import assert from "node:assert/strict";
import { centreInside, iou, isIsoFormat, MIN_IOU, normText, parseDate, scoreBox, scoreField, type Box, type TruthField } from "./eval-meta/score";

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

const TRUTH_NAME: TruthField = { found: true, value: "ELIN THORNQUIST", normalized: "Elin Thornquist", box: [332, 260, 555, 314] };

test("IoU of identical boxes is 1, of disjoint boxes 0", () => {
  assert.equal(iou([0, 0, 10, 10], [0, 0, 10, 10]), 1);
  assert.equal(iou([0, 0, 10, 10], [20, 20, 30, 30]), 0);
  assert.equal(iou([0, 0, 0, 0], [0, 0, 0, 0]), 0);
});

test("IoU of half-overlapping boxes is 1/3", () => {
  assert.ok(Math.abs(iou([0, 0, 10, 10], [5, 0, 15, 10]) - 1 / 3) < 1e-9);
});

test("a tight box inside a padded truth box passes (centre inside, IoU >= 0.4)", () => {
  const tight: Box = [335, 268, 552, 306]; // glyphs only, truth adds line padding
  const s = scoreBox(tight, TRUTH_NAME.box);
  assert.ok(s.iou >= MIN_IOU && s.iou < 1, `iou ${s.iou}`);
  assert.equal(s.pass, true);
});

test("a box with centre inside but too small fails on IoU", () => {
  const s = scoreBox([430, 280, 450, 290], TRUTH_NAME.box);
  assert.equal(s.centreInside, true);
  assert.equal(s.pass, false);
});

test("a box with good overlap but centre outside fails", () => {
  // Shifted right so its centre falls past the truth box's right edge.
  const s = scoreBox([450, 260, 700, 314], TRUTH_NAME.box);
  assert.equal(centreInside([450, 260, 700, 314], TRUTH_NAME.box), false);
  assert.equal(s.pass, false);
});

test("dates: common formats parse to YYYY-MM-DD", () => {
  assert.equal(parseDate("09 MAY 2031"), "2031-05-09");
  assert.equal(parseDate("9 May 2031"), "2031-05-09");
  assert.equal(parseDate("1 October 2026"), "2026-10-01");
  assert.equal(parseDate("May 9, 2031"), "2031-05-09");
  assert.equal(parseDate("2031-05-09"), "2031-05-09");
  assert.equal(parseDate("2031/5/9"), "2031-05-09");
});

test("dates: ambiguous or invalid input is not parsed", () => {
  assert.equal(parseDate("09/05/2031"), null);
  assert.equal(parseDate("31 FEB 2031"), null);
  assert.equal(parseDate("2031-13-01"), null);
  assert.equal(parseDate(""), null);
});

test("ISO format detection", () => {
  assert.equal(isIsoFormat("2031-05-09"), true);
  assert.equal(isIsoFormat("09 MAY 2031"), false);
});

test("text normalisation ignores case and collapses whitespace", () => {
  assert.equal(normText("  ELIN   THORNQUIST "), normText("Elin Thornquist"));
});

test("scoreField: value as printed matches the normalized truth", () => {
  const s = scoreField("full_name", { found: true, value: "ELIN THORNQUIST", box: [335, 268, 552, 306] }, TRUTH_NAME);
  assert.equal(s.valuePass, true);
  assert.equal(s.pass, true);
});

test("scoreField: printed date passes the value check but is flagged as not ISO", () => {
  const truth: TruthField = { found: true, value: "09 MAY 2031", normalized: "2031-05-09", box: [660, 497, 811, 551] };
  const s = scoreField("expiry_date", { found: true, value: "09 MAY 2031", box: [662, 505, 808, 545] }, truth);
  assert.equal(s.valuePass, true);
  assert.equal(s.isoFormat, false);
});

test("scoreField: field absent in truth passes only when the model also says absent", () => {
  const absent: TruthField = { found: false, value: "", normalized: "", box: [0, 0, 0, 0] };
  assert.equal(scoreField("date_of_birth", { found: false, value: "", box: [0, 0, 0, 0] }, absent).pass, true);
  assert.equal(scoreField("date_of_birth", { found: true, value: "1990-01-01", box: [1, 1, 2, 2] }, absent).pass, false);
});

test("scoreField: model misses a field that exists", () => {
  const s = scoreField("full_name", { found: false, value: "", box: [0, 0, 0, 0] }, TRUTH_NAME);
  assert.equal(s.pass, false);
  assert.equal(s.boxPass, false);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);

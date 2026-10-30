// Scoring rules for the Meta eval. Pure functions, tested offline by scripts/eval-score-test.ts.

export type Box = [number, number, number, number]; // [x_min, y_min, x_max, y_max], 0-1000 grid

export const MIN_IOU = 0.4;
export const BOX_RULE =
  `A box passes when the centre of the model's box lies inside the truth box AND IoU >= ${MIN_IOU}. ` +
  "Truth boxes include the text's line padding while model boxes tend to be tight, so IoU alone under-scores; it is still reported for every box.";
export const VALUE_RULE =
  "Values are compared with truth.normalized, case-insensitive, with whitespace collapsed. Dates are first parsed to YYYY-MM-DD " +
  '(e.g. "09 MAY 2031", "9 May 2031", "May 9, 2031", "2031-05-09"); whether the model returned the requested YYYY-MM-DD format is reported separately.';

const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

export function iou(a: Box, b: Box): number {
  const inter: Box = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  const i = area(inter);
  const u = area(a) + area(b) - i;
  return u > 0 ? i / u : 0;
}

export function centreInside(model: Box, truth: Box): boolean {
  const cx = (model[0] + model[2]) / 2, cy = (model[1] + model[3]) / 2;
  return cx >= truth[0] && cx <= truth[2] && cy >= truth[1] && cy <= truth[3];
}

export function scoreBox(model: Box, truth: Box) {
  const v = iou(model, truth);
  const centre = centreInside(model, truth);
  return { iou: v, centreInside: centre, pass: centre && v >= MIN_IOU };
}

export const normText = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const month = (s: string) => {
  const i = MONTHS.indexOf(s.slice(0, 3).toLowerCase());
  return i < 0 ? null : i + 1;
};
function iso(y: number, m: number | null, d: number): string | null {
  if (!m) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

// Parses common unambiguous date formats to YYYY-MM-DD. Numeric day/month orders
// like 09/05/2031 are ambiguous and deliberately not parsed.
export function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[ .-]+([A-Za-z]{3,9})\.?[ ,.-]+(\d{4})$/))) return iso(+m[3], month(m[2]), +m[1]);
  if ((m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/))) return iso(+m[3], month(m[1]), +m[2]);
  return null;
}

export const DATE_FIELDS = new Set(["date_of_birth", "issue_date", "expiry_date"]);
export const isIsoFormat = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());

export interface TruthField {
  found: boolean;
  value: string;
  normalized: string;
  box: Box;
}
export interface ModelField {
  found: boolean;
  value: string;
  box: Box;
}

export interface FieldScore {
  field: string;
  truthFound: boolean;
  modelFound: boolean;
  truth: string;
  model: string;
  valuePass: boolean;
  isoFormat: boolean | null; // dates only
  iou: number | null;
  centreInside: boolean | null;
  boxPass: boolean | null; // null when there is no box to score
  pass: boolean;
}

export function scoreField(field: string, model: ModelField | undefined, truth: TruthField): FieldScore {
  const base = { field, truthFound: truth.found, modelFound: !!model?.found, truth: truth.normalized, model: model?.found ? model.value : "" };
  // Absent in truth: correct only if the model also says absent.
  if (!truth.found) {
    const ok = !model?.found;
    return { ...base, valuePass: ok, isoFormat: null, iou: null, centreInside: null, boxPass: null, pass: ok };
  }
  if (!model?.found) return { ...base, valuePass: false, isoFormat: null, iou: null, centreInside: null, boxPass: false, pass: false };

  const date = DATE_FIELDS.has(field);
  const valuePass = date ? parseDate(model.value) === truth.normalized : normText(model.value) === normText(truth.normalized);
  const box = scoreBox(model.box, truth.box);
  return { ...base, valuePass, isoFormat: date ? isIsoFormat(model.value) : null, iou: box.iou, centreInside: box.centreInside, boxPass: box.pass, pass: valuePass && box.pass };
}

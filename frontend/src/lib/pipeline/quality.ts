import sharp from "sharp";
import type { InputFile } from "../ai/types";

const ALLOWED = ["image/png", "image/jpeg", "application/pdf"];
const MIN_BYTES = 20 * 1024, MAX_BYTES = 10 * 1024 * 1024, MIN_EDGE = 600;
// Laplacian variance threshold, calibrated on eval/specimens (see eval/generator/README.md).
export const SHARPNESS_EDGE = 1000, MIN_SHARPNESS = 100;

// Reads width/height from PNG or JPEG headers without an image library.
export function imageSize(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Variance of the Laplacian on a grayscale copy scaled to SHARPNESS_EDGE px on
// its long side, so the score does not depend on the upload's resolution.
// Low variance = few crisp edges = blurry.
export async function sharpness(bytes: Buffer): Promise<number> {
  const { data, info } = await sharp(bytes)
    .greyscale()
    .resize(SHARPNESS_EDGE, SHARPNESS_EDGE, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let sum = 0, sumSq = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
      sum += lap;
      sumSq += lap * lap;
    }
  }
  const n = (w - 2) * (h - 2);
  return sumSq / n - (sum / n) ** 2;
}

// Returns problems a customer can fix by retaking/re-uploading; empty = pass.
export async function qualityProblems(file: InputFile): Promise<string[]> {
  const p: string[] = [];
  if (!ALLOWED.includes(file.mime)) return [`${file.filename}: file type ${file.mime} is not accepted (use JPG, PNG or PDF).`];
  if (file.bytes.length < MIN_BYTES) p.push(`${file.filename}: the file is too small to read reliably.`);
  if (file.bytes.length > MAX_BYTES) p.push(`${file.filename}: the file is larger than 10 MB.`);
  if (file.mime !== "application/pdf") {
    const s = imageSize(file.bytes);
    if (!s) p.push(`${file.filename}: the image could not be read.`);
    else if (Math.min(s.w, s.h) < MIN_EDGE) p.push(`${file.filename}: resolution is too low (${s.w}x${s.h}); please retake closer to the document.`);
    else {
      const score = await sharpness(file.bytes).catch(() => null);
      if (score === null) p.push(`${file.filename}: the image could not be read.`);
      else if (score < MIN_SHARPNESS) p.push(`${file.filename}: the image is too blurry to read; please retake it in focus.`);
    }
  }
  return p;
}

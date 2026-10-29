import { getMeta, MODEL } from "../meta/client";
import { DocType } from "../policy/schema";
import { z } from "zod";
import type { AiProvider, Extraction, InputFile } from "./types";

// Real provider. Same structured-output pattern as meta/extractId.ts.
// Untested until credits arrive: run scripts/day1.ts first, then flip AI_PROVIDER=meta.
const clamp = (n: number) => Math.min(1000, Math.max(0, Math.round(n)));

async function jsonCall<T>(name: string, schema: object, parse: (v: unknown) => T, text: string, file?: InputFile): Promise<T> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text }];
  if (file) content.push({ type: "image_url", image_url: { url: `data:${file.mime};base64,${file.bytes.toString("base64")}` } });
  const res = await getMeta().chat.completions.create({
    model: MODEL,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: [{ role: "user", content: content as any }],
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema: schema as Record<string, unknown> } },
  });
  return parse(JSON.parse(res.choices[0].message.content ?? "{}"));
}

const fieldSchema = {
  type: "object",
  properties: {
    found: { type: "boolean" }, value: { type: "string" }, confidence: { type: "number" },
    box: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 },
  },
  required: ["found", "value", "confidence", "box"], additionalProperties: false,
};
const FIELDS = ["full_name", "date_of_birth", "document_number", "expiry_date", "issue_date", "address"] as const;
const ZField = z.object({
  found: z.boolean(), value: z.string(), confidence: z.number().min(0).max(1),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).transform((b) => b.map(clamp) as [number, number, number, number]),
});

export const metaProvider: AiProvider = {
  name: "meta",

  classifyDocument: (file) =>
    jsonCall("doc_class", {
      type: "object",
      properties: { docType: { type: "string", enum: DocType.options }, confidence: { type: "number" } },
      required: ["docType", "confidence"], additionalProperties: false,
    }, (v) => z.object({ docType: DocType, confidence: z.number() }).parse(v),
    "Classify this KYC document. Use unknown if it is none of the listed types. confidence is 0-1.", file),

  extractFields: (file, docType) =>
    jsonCall("extraction", {
      type: "object",
      properties: Object.fromEntries(FIELDS.map((k) => [k, fieldSchema])),
      required: [...FIELDS], additionalProperties: false,
    }, (v) => ({ document_type: docType, ...z.object(Object.fromEntries(FIELDS.map((k) => [k, ZField]))).parse(v) }) as Extraction,
    `This is a ${docType}. For each field return found, the exact text as printed, confidence 0-1, and box as ` +
    "[x_min, y_min, x_max, y_max] on a normalized 0-1000 grid with (0,0) at top-left. Dates as YYYY-MM-DD. " +
    'If a field is absent set found=false, value="", confidence=0, box=[0,0,0,0].', file),

  compareValues: (field, a, b) =>
    jsonCall("compare", {
      type: "object",
      properties: { same: { type: "boolean" }, confidence: { type: "number" }, reason: { type: "string" } },
      required: ["same", "confidence", "reason"], additionalProperties: false,
    }, (v) => z.object({ same: z.boolean(), confidence: z.number(), reason: z.string() }).parse(v),
    `Do these two ${field} values from different KYC documents refer to the same thing? Allow formatting, ` +
    `abbreviation and transliteration differences only.\nA: ${a}\nB: ${b}`),

  summarizeForReviewer: async ({ score, reasons, decision }) =>
    (await jsonCall("summary", { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
      (v) => z.object({ summary: z.string() }).parse(v),
      `Write a 2-3 sentence neutral summary for a KYC analyst. Only use these facts; do not add new ones.\n` +
      `Score: ${score}\nProposed outcome: ${decision}\nFindings:\n- ${reasons.join("\n- ") || "none"}`)).summary,

  customerGuidance: async (issues) =>
    (await jsonCall("guidance", { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false },
      (v) => z.object({ message: z.string() }).parse(v),
      `Write a short, friendly message asking a bank customer to fix these onboarding issues. Do not mention fraud or risk scores.\n- ${issues.join("\n- ")}`)).message,

  compilePolicy: (englishText) =>
    jsonCall("policy", {
      type: "object",
      properties: {
        id: { type: "string" }, version: { type: "integer" }, name: { type: "string" }, customerCategory: { type: "string" },
        requiredDocuments: { type: "array", items: { type: "object", properties: { label: { type: "string" }, anyOf: { type: "array", items: { type: "string", enum: DocType.options } } }, required: ["label", "anyOf"], additionalProperties: false } },
        minAge: { type: "integer" }, proofOfAddressMaxAgeDays: { type: "integer" }, selfieRequired: { type: "boolean" }, authorityLookup: { type: "boolean" },
        risk: { type: "object", properties: { autoApproveMax: { type: "number" } }, required: ["autoApproveMax"], additionalProperties: false },
      },
      required: ["id", "version", "name", "customerCategory", "requiredDocuments", "minAge", "proofOfAddressMaxAgeDays", "selfieRequired", "authorityLookup", "risk"],
      additionalProperties: false,
    }, (v) => v,
      "Convert this KYC policy into the JSON spec. Use sensible defaults for anything the text does not state " +
      `(minAge 18, proofOfAddressMaxAgeDays 90, risk.autoApproveMax 25).\n\nPolicy:\n${englishText}`),
};

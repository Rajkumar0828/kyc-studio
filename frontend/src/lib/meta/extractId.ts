import { z } from "zod";
import { meta, MODEL } from "./client";

const field = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    value: { type: "string" },
    box: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 },
  },
  required: ["found", "value", "box"],
  additionalProperties: false,
} as const;

const schema = {
  type: "object",
  properties: {
    document_type: { type: "string" },
    full_name: field,
    date_of_birth: field,
    document_number: field,
    expiry_date: field,
    address: field,
  },
  required: ["document_type", "full_name", "date_of_birth", "document_number", "expiry_date", "address"],
  additionalProperties: false,
} as const;

// Second safety net after the API's strict schema. Boxes are clamped to the
// 0-1000 grid because the model can slightly overshoot at image edges.
const clamp = (n: number) => Math.min(1000, Math.max(0, Math.round(n)));

const Field = z.object({
  found: z.boolean(),
  value: z.string(),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).transform((b) => b.map(clamp) as [number, number, number, number]),
});

export const IdExtraction = z.object({
  document_type: z.string(),
  full_name: Field,
  date_of_birth: Field,
  document_number: Field,
  expiry_date: Field,
  address: Field,
});
export type IdExtraction = z.infer<typeof IdExtraction>;

export const PROMPT =
  "Read this identity document. For each field return found, the exact text as printed, " +
  "and box as [x_min, y_min, x_max, y_max] on a normalized 0-1000 grid with (0,0) at the top-left. " +
  "If a field is not present, set found=false, value=\"\" and box=[0,0,0,0].";

// No system message: grounding works best with an uncluttered prompt.
export async function extractId(imageBase64: string, mime = "image/png"): Promise<IdExtraction> {
  const res = await meta.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "id_extraction", strict: true, schema },
    },
  });
  return IdExtraction.parse(JSON.parse(res.choices[0].message.content ?? "{}"));
}

// Exact input-token count for the same request, via POST /v1/responses/input_tokens.
export async function countIdTokens(imageBase64: string, mime = "image/png") {
  const r = await meta.responses.inputTokens.count({
    model: MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT },
          { type: "input_image", image_url: `data:${mime};base64,${imageBase64}`, detail: "auto" },
        ],
      },
    ],
  });
  return r.input_tokens;
}

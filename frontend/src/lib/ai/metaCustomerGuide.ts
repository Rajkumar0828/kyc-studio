import { z } from "zod";
import { docList } from "../policy/labels";
import { callMetaJson, type MetaProviderOptions } from "./meta";
import { JOURNEY_STEPS, type CustomerGuide } from "./types";

// Meta-backed wording for the apply journey. The model only words the steps;
// it receives structured facts from the policy (never the source text or the
// consent text) and the requirement list shown to customers stays deterministic.

const stepsSchema = {
  type: "object",
  properties: Object.fromEntries(JOURNEY_STEPS.map((s) => [s, { type: "string" }])),
  required: [...JOURNEY_STEPS],
  additionalProperties: false,
};
const Steps = z.object(Object.fromEntries(JOURNEY_STEPS.map((s) => [s, z.string().trim().min(1).max(600)]))).strict();

const messageSchema = { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false };

export function createMetaCustomerGuide(opts: MetaProviderOptions = {}): CustomerGuide {
  return {
    name: "meta",

    async stepHelp(policy) {
      const facts = [
        ...policy.requiredDocuments.map((d) => `${d.label}: one of ${docList(d.anyOf)}`),
        `Minimum age: ${policy.minAge}`,
        ...(policy.requiredDocuments.some((d) => d.label === "Proof of address") ? [`Proof of address issued within ${policy.proofOfAddressMaxAgeDays} days`] : []),
        `Selfie: ${policy.selfieRequired ? "required" : "not required"}`,
        `Data kept for ${policy.retentionDays} days`,
      ];
      const text =
        "Write short, friendly help text (one or two sentences each) for the steps of a bank's identity verification journey: " +
        `${JOURNEY_STEPS.join(", ")}. Use plain language. Only describe these facts; do not add requirements, deadlines, fees or promises. ` +
        "Do not mention fraud, risk scores or AI.\nFacts:\n- " + facts.join("\n- ");
      return Steps.parse(await callMetaJson("guide", stepsSchema, text, opts)) as Record<(typeof JOURNEY_STEPS)[number], string>;
    },

    async resultMessage(decision, fixes) {
      const text =
        "Write a short, friendly message (at most three sentences) to a bank customer about the outcome of their identity verification. " +
        "Do not mention fraud, risk scores or AI, and do not promise timelines. " +
        `Outcome: ${decision === "auto_approve" ? "verified" : decision === "request_info" ? "we need more information" : "a person will review the application"}.` +
        (fixes.length ? `\nWhat the customer needs to fix:\n- ${fixes.join("\n- ")}` : "");
      return z.object({ message: z.string().trim().min(1).max(800) }).strict().parse(await callMetaJson("guidance", messageSchema, text, opts)).message;
    },
  };
}

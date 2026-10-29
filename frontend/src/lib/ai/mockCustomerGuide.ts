import type { CustomerGuide } from "./types";

// Template-based wording for the apply journey. No model involved.
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");

export const mockCustomerGuide: CustomerGuide = {
  name: "mock",

  async stepHelp(policy) {
    const docs = policy.requiredDocuments.map((d) => d.label.toLowerCase());
    const needs = [...docs, ...(policy.selfieRequired ? ["a selfie"] : [])];
    return {
      consent: "Before we start, please read how your information will be used.",
      tour: `You will need ${list(needs)}. It takes about five minutes.`,
      documents: "Upload a clear photo or scan of each document: all four corners visible, no glare, text in focus.",
      selfie: "Take a selfie facing the camera in good light, without hats or sunglasses.",
      review: "Check that each file is the right document before you submit.",
      result: "Here is what happens next.",
    };
  },

  async resultMessage(decision, fixes) {
    if (decision === "auto_approve") return "You're verified. Thank you, there is nothing else you need to do.";
    if (decision === "request_info")
      return fixes.length ? `We need a little more from you before we can continue: ${fixes.join(" ")}` : "We need a little more information before we can continue.";
    return "Thanks, we have everything we need for now. A member of our team will review your application and contact you.";
  },
};

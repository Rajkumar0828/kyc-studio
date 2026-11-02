import { getCustomerGuide } from "../ai";
import { metaSettings } from "../ai/meta";
import { templateSteps } from "../ai/mockCustomerGuide";
import { JOURNEY_STEPS } from "../ai/types";
import { aiBudgetLeft } from "../security/aiBudget";
import type { PolicySpec } from "./schema";
import { StoredGuide } from "./store/types";

export { TEMPLATE_FALLBACK_LABEL } from "./guideLabels";

// Step wording for one version, generated at publish time. The requirement list
// is deterministic; only the wording is AI. If the AI wording can't be produced
// (provider error, invalid output, daily cap), the template is used and marked,
// so a Meta problem never blocks a publish.
export async function generateGuide(spec: PolicySpec): Promise<StoredGuide> {
  const now = new Date().toISOString();
  const fallback = (reason: string): StoredGuide => ({
    steps: templateSteps(spec), source: "template_fallback", provider: "template", model: null, effort: null,
    note: `AI wording unavailable: ${reason}`.slice(0, 300), generatedAt: now,
  });
  if (!aiBudgetLeft()) return fallback("the daily AI call cap has been reached");
  try {
    const guide = getCustomerGuide({ policyId: spec.id });
    const steps = await guide.stepHelp(spec);
    const parsed = StoredGuide.shape.steps.safeParse(Object.fromEntries(JOURNEY_STEPS.map((s) => [s, steps[s]])));
    if (!parsed.success) return fallback("the generated wording was incomplete");
    if (guide.name === "mock") return { steps: parsed.data, source: "template", provider: "mock", model: null, effort: null, note: null, generatedAt: now };
    const settings = metaSettings();
    return { steps: parsed.data, source: "ai", provider: guide.name, model: settings.model, effort: settings.reasoningEffort.guide, note: null, generatedAt: now };
  } catch (e) {
    return fallback(e instanceof Error ? e.message : String(e));
  }
}

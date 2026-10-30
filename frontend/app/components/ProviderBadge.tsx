import { Badge } from "./Badge";

// Marks text or results produced by an AI provider, so mock output is never
// mistaken for a model's.
export function ProviderBadge({ provider, label = "AI" }: { provider: string; label?: string }) {
  const mock = provider === "mock";
  return (
    <Badge tone={mock ? "mock" : "accent"} title={mock ? "Produced by the deterministic mock provider, not a model" : `Produced by the ${provider} provider`}>
      {label}: {mock ? "mock" : provider}
    </Badge>
  );
}

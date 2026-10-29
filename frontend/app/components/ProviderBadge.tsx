// Marks text or results produced by an AI provider, so mock output is never
// mistaken for a model's.
export function ProviderBadge({ provider, label = "AI" }: { provider: string; label?: string }) {
  const mock = provider === "mock";
  return (
    <span
      title={mock ? "Produced by the deterministic mock provider, not a model" : `Produced by the ${provider} provider`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        mock ? "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300" : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
      }`}
    >
      {label}: {mock ? "mock" : provider}
    </span>
  );
}

// JSON with object keys sorted at every level, so equal values always serialise
// (and therefore hash or sign) identically. Undefined object values are dropped.
export const canonicalJson = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonicalJson).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(v);

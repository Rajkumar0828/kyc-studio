import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { CompileRecord } from "./readBack";
import type { CompiledRules } from "./schema";

// Rules can only come from a compile: the compile route signs the exact
// (source text, rules, read-back) it produced, and saving a draft requires a
// valid signature. There is no manual rule editing. The secret is random per
// server process, so tokens expire on restart (the officer just recompiles).

const g = globalThis as unknown as { _compileSecret?: Buffer };
const secret = () => (g._compileSecret ??= randomBytes(32));

// JSON with sorted keys, so equal values always sign the same.
const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
      : JSON.stringify(v);

export interface Compiled {
  sourceText: string;
  rules: CompiledRules;
  compile: CompileRecord | null;
}

export const signCompile = (c: Compiled) => createHmac("sha256", secret()).update(canonical(c)).digest("hex");

export function verifyCompile(c: Compiled, token: unknown): boolean {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(signCompile(c), "hex"), Buffer.from(token, "hex"));
}

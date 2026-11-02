import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "../canonicalJson";
import type { CompileRecord } from "./readBack";
import type { CompiledRules } from "./schema";

// Rules can only come from a compile: the compile route signs the exact
// (source text, rules, read-back) it produced, and saving a draft requires a
// valid signature. There is no manual rule editing. The secret is random per
// server process, so tokens expire on restart (the officer just recompiles).

const g = globalThis as unknown as { _compileSecret?: Buffer };
const secret = () => (g._compileSecret ??= randomBytes(32));

export interface Compiled {
  sourceText: string;
  rules: CompiledRules;
  compile: CompileRecord | null;
}

export const signCompile = (c: Compiled) => createHmac("sha256", secret()).update(canonicalJson(c)).digest("hex");

export function verifyCompile(c: Compiled, token: unknown): boolean {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(signCompile(c), "hex"), Buffer.from(token, "hex"));
}

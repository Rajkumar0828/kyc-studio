import { ZodError } from "zod";
import { ProviderUnavailable } from "../ai";
import { MetaOutputTruncated } from "../ai/meta";
import { CompilePreflightError, CompileValidationError } from "../ai/metaPolicyCompiler";
import { CompileInputError } from "../policy/compileCore";
import { AuditAppendFailed } from "../audit/chain";
import { PolicyStoreError } from "../policy/store";
import { MongoNotConfigured } from "../db/mongo";
import { VaultError } from "../vault/transit";
import { AiBudgetExceeded } from "./aiBudget";

// Error-to-response mapping for API routes. Kept out of guard.ts on purpose:
// it imports the AI, store, Mongo and Vault layers, and guard.ts is also used by
// /api/demo-access, which the banner calls on every page and should stay light.

const json = (status: number, error: string, code: string) => Response.json({ error, code }, { status });

// Maps errors thrown inside a guarded route to responses.
export function errorResponse(e: unknown, fallback = "Request failed"): Response {
  if (e instanceof AiBudgetExceeded) return json(429, e.message, "ai_daily_cap");
  if (e instanceof AuditAppendFailed) return json(503, "The change was made, but its audit event could not be written. Check the audit page.", "audit_failed");
  if (e instanceof ZodError) return json(422, "The data did not match the expected schema.", "invalid_data");
  if (e instanceof PolicyStoreError) return json(e.status, e.message, "policy_store");
  if (e instanceof ProviderUnavailable) return json(503, e.message, "provider_unavailable");
  if (e instanceof CompileInputError) return json(400, e.message, "compile_input");
  if (e instanceof CompileValidationError) return json(502, `${e.message}. Nothing was compiled; try again or rephrase the policy.`, "compile_invalid");
  if (e instanceof CompilePreflightError) return json(502, e.message, "compile_preflight");
  if (e instanceof MetaOutputTruncated)
    return json(502, e.step === "compile"
      ? `This policy is too long to compile in one go (the answer hit the ${e.maxCompletionTokens}-token limit). Split it into shorter parts and compile each part as its own policy.`
      : `The model's answer was cut off at ${e.maxCompletionTokens} tokens (step ${e.step}). Try again.`, "output_truncated");
  if (e instanceof MongoNotConfigured || (e instanceof Error && /^Mongo(ServerSelection|Network|NotConnected|Topology)/.test(e.name)))
    return json(503, "The database is not available right now.", "storage_unavailable");
  if (e instanceof VaultError) return json(503, "The encryption service (Vault) is not available right now.", "storage_unavailable");
  // Log the error class and code only: messages can carry connection details or content.
  console.error("[error]", e instanceof Error ? `${e.name}${(e as { code?: unknown }).code !== undefined ? ` code=${String((e as { code?: unknown }).code)}` : ""}` : "unknown");
  return json(500, fallback, "error");
}

// For routes and pages that need MongoDB (and Vault): 409 with the setting to change.
export const requiresStorage = (message: string) => json(409, message, "requires_storage");

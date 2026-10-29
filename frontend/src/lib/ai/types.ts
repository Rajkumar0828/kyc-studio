import type { Decision } from "../pipeline/types";
import type { CompiledRules, DocType, PolicySpec } from "../policy/schema";

export interface InputFile {
  filename: string;
  mime: string;
  bytes: Buffer;
  declaredType?: DocType; // the upload slot it came from; a hint, not evidence
}

export interface Field {
  found: boolean;
  value: string;
  confidence: number; // 0..1
  box: [number, number, number, number]; // 0-1000 grid, [0,0,0,0] if not found
}

export type FieldName = "full_name" | "date_of_birth" | "document_number" | "expiry_date" | "issue_date" | "address";
export type Extraction = { document_type: DocType } & Record<FieldName, Field>;

export interface ValueComparison {
  same: boolean;
  confidence: number;
  reason: string;
}

export interface RiskSummaryInput {
  score: number;
  reasons: string[];
  decision: string;
}

// Everything the platform asks of a model goes through this interface, so the
// whole pipeline runs on MockProvider now and switches to Meta with one env var.
export interface AiProvider {
  name: string;
  classifyDocument(file: InputFile): Promise<{ docType: DocType; confidence: number }>;
  extractFields(file: InputFile, docType: DocType): Promise<Extraction>;
  compareValues(field: string, a: string, b: string): Promise<ValueComparison>;
  summarizeForReviewer(input: RiskSummaryInput): Promise<string>;
  customerGuidance(issues: string[]): Promise<string>;
}

export interface CompileWarning {
  kind: "unsupported" | "conflict" | "default";
  sentence?: string;
  message: string;
}

// English policy text -> rules from the closed RuleKind vocabulary. Output is
// untrusted: API routes validate it with CompiledRules before use.
export interface PolicyCompiler {
  name: string;
  compile(text: string): Promise<{ rules: CompiledRules; warnings: CompileWarning[] }>;
}

export const JOURNEY_STEPS = ["consent", "tour", "documents", "selfie", "review", "result"] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];

// Customer-facing wording for the apply journey. Never decides anything.
export interface CustomerGuide {
  name: string;
  stepHelp(policy: PolicySpec): Promise<Record<JourneyStep, string>>;
  resultMessage(decision: Decision, fixes: string[]): Promise<string>;
}

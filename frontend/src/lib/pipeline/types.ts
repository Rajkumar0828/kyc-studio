import type { DocType } from "../policy/schema";
import type { Extraction, InputFile } from "../ai/types";

export type Status = "pass" | "warn" | "fail";
// customer_fixable -> ask the customer (retake, newer doc); integrity -> a human must look.
export type Category = "customer_fixable" | "integrity" | "info";

export interface Check {
  step: string;
  code: string;
  status: Status;
  category: Category;
  message: string;
  evidence?: { docIndex?: number; field?: string; box?: number[]; values?: string[] };
}

export interface ProcessedDoc {
  index: number;
  filename: string;
  docType: DocType;
  classConfidence: number;
  extraction?: Extraction;
}

export type Decision = "auto_approve" | "manual_review" | "request_info";

export interface PipelineResult {
  caseId: string;
  policy: { id: string; version: number };
  provider: string;
  docs: ProcessedDoc[];
  checks: Check[];
  score: number;
  decision: Decision;
  reviewerSummary: string;
  customerMessage?: string;
  startedAt: Date;
  finishedAt: Date;
}

export interface CaseInput {
  caseId: string;
  documents: InputFile[];
  selfie?: InputFile;
  asOf?: Date; // reference "today" for date rules; defaults to the real current date
}

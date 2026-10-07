/**
 * Domain types for the tiered verification gate.
 *
 * The gate looks at two independent axes:
 *   1. RULES      – does what the model read satisfy our business requirements?
 *   2. CONFIDENCE – how much do we trust that the model read it correctly?
 *
 * Keeping them separate is the core design idea: a document can be perfectly
 * valid but unreadable (retake it), or perfectly readable but invalid
 * (wrong name → a human decides).
 */

export type Outcome = 'approve' | 'retry' | 'human_review';

export type VerificationKind = 'address' | 'job_photo';

/* ------------------------------------------------------------------ */
/* Extractions: what the on-device model returns (schema-constrained)  */
/* ------------------------------------------------------------------ */

export type AddressDocType =
  | 'utility_bill'
  | 'bank_statement'
  | 'tenancy_agreement'
  | 'government_letter'
  | 'other'
  | 'not_a_document';

export type Legibility = 'clear' | 'partial' | 'poor';

export interface AddressExtraction {
  documentType: AddressDocType;
  fullName: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  /** ISO date, YYYY-MM-DD */
  issueDate: string | null;
  issuer: string | null;
  legibility: Legibility;
}

export interface AddressExpected {
  fullName: string;
  city: string;
  state?: string;
}

export type JobCategory =
  | 'plumbing'
  | 'electrical'
  | 'carpentry'
  | 'painting'
  | 'tiling'
  | 'hvac'
  | 'cleaning'
  | 'other'
  | 'unclear';

export type PhotoQuality = 'clear' | 'blurry' | 'dark';

export interface JobPhotoExtraction {
  category: JobCategory;
  workAppearsComplete: 'yes' | 'partial' | 'no' | 'cannot_tell';
  /** false for screenshots, stock imagery, photos of a screen, etc. */
  isRealSitePhoto: boolean;
  photoQuality: PhotoQuality;
  /** One short sentence describing what is visible. */
  description: string;
}

export interface JobPhotoExpected {
  category: Exclude<JobCategory, 'unclear' | 'other'>;
}

/* ------------------------------------------------------------------ */
/* Evaluation: rules + confidence signals                              */
/* ------------------------------------------------------------------ */

export interface RuleResult {
  id: string;
  label: string;
  passed: boolean;
  /** Could the user fix this themselves (retake the photo, upload another document)? */
  fixableByUser: boolean;
  /** Developer-facing explanation, shown in the result card. */
  detail: string;
  /** Short, plain-language instruction shown to the end user on retry. */
  userMessage?: string;
}

export interface ConfidenceSignal {
  id: string;
  label: string;
  /** 0..1, higher = more trustworthy reading */
  value: number;
  weight: number;
}

export interface Evaluation {
  kind: VerificationKind;
  rules: RuleResult[];
  signals: ConfidenceSignal[];
  /**
   * True when the problem looks like the capture (blur, cut-off, not a
   * document) rather than the content – a retake is worth trying.
   */
  captureIssue: boolean;
  /** Mean cross-pass agreement, or null when only one pass was run. */
  agreement: number | null;
}

/* ------------------------------------------------------------------ */
/* Gate                                                                */
/* ------------------------------------------------------------------ */

export interface GateConfig {
  /** Minimum confidence (0..1) for an automatic approval. */
  approveThreshold: number;
  /** After this many retries the gate escalates to a human instead. */
  maxRetries: number;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  approveThreshold: 0.85,
  maxRetries: 2,
};

export interface GateDecision {
  outcome: Outcome;
  confidence: number;
  agreement: number | null;
  rules: RuleResult[];
  signals: ConfidenceSignal[];
  /** Why the gate decided this, for logs and the result card. */
  reasons: string[];
  /** What to tell the end user. */
  userMessage: string;
}

/* ------------------------------------------------------------------ */
/* Timing                                                              */
/* ------------------------------------------------------------------ */

export interface InferenceTimings {
  totalMs: number;
  perPassMs: number[];
  /** Time to first token for each pass, if the runtime reports it. */
  ttftMs?: number[];
  tokensPerSecond?: number[];
}

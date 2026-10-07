import type {
  AddressExpected,
  AddressExtraction,
  InferenceTimings,
  JobPhotoExtraction,
} from '../domain/types';

/**
 * The seam between "what the model reads" and "what we decide".
 *
 * Everything above this interface (gate, screens, benchmark) is runtime-agnostic.
 * Swap LiteRT-LM for another runtime, or for a cloud call, by implementing it.
 */

export type EnginePhase = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

export interface EngineStatus {
  phase: EnginePhase;
  /** 0..1 while downloading */
  progress?: number;
  message?: string;
  memoryVerdict?: 'safe' | 'tight' | 'critical';
}

export interface PreflightInfo {
  verdict: 'safe' | 'tight' | 'critical';
  totalEstimatedBytes: number;
  availableBytes: number;
  recommendation: string;
}

export type AddressScenario =
  | 'clean'
  | 'stale'
  | 'name_mismatch'
  | 'blurry'
  | 'not_a_document'
  | 'passes_disagree';

export type JobScenario = 'clean' | 'blurry' | 'wrong_trade' | 'screenshot' | 'incomplete';

/** Only the mock engine reads these; the real engine ignores them. */
export interface MockHints {
  addressScenario?: AddressScenario;
  jobScenario?: JobScenario;
  expectedAddress?: AddressExpected;
}

export type JobPhotoRole = 'before' | 'after';

export interface RunOptions {
  /** 1 = fastest, 2 = adds a differently-worded second read for self-consistency. */
  passes: 1 | 2;
  /**
   * Downscale so the long edge is at most this many pixels. When omitted the
   * runtime's own scaling is used (LiteRT-LM scales to 1024px).
   */
  maxImageEdge?: number;
  /** Labels the job photo for the model (fault vs fix). Defaults to after. */
  jobRole?: JobPhotoRole;
  mock?: MockHints;
}

export interface AddressRun {
  passes: AddressExtraction[];
  timings: InferenceTimings;
}

export interface JobPhotoRun {
  passes: JobPhotoExtraction[];
  timings: InferenceTimings;
}

export type EngineErrorKind = 'not_ready' | 'memory' | 'inference' | 'parse';

export class EngineError extends Error {
  constructor(message: string, readonly kind: EngineErrorKind) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface VerificationEngine {
  readonly id: 'litert-gemma';
  readonly label: string;
  /** Can this device hold the model? Null if the runtime cannot tell. */
  preflight(): PreflightInfo | null;
  load(onStatus: (s: EngineStatus) => void): Promise<void>;
  isReady(): boolean;
  extractAddress(imageUri: string, opts: RunOptions): Promise<AddressRun>;
  extractJobPhoto(imageUri: string, opts: RunOptions): Promise<JobPhotoRun>;
  unload(): Promise<void>;
}

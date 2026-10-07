import type {
  AddressExpected,
  AddressExtraction,
  InferenceTimings,
  Outcome,
} from '../domain/types';

/** One image's result, as recorded on a device. */
export interface BenchmarkItem {
  id: string;
  variant: string;
  expectedOutcome: Outcome;
  expected: AddressExpected;
  /** Ground truth of what is printed on the document. */
  truth: AddressExtraction | null;
  /** True when every field is actually legible (so field accuracy is meaningful). */
  fieldsVisible: boolean;
  /** Raw readings, one per pass. Empty when the engine failed. */
  passes: AddressExtraction[];
  timings?: InferenceTimings;
  /** Set when inference failed; the gate fails closed on these. */
  error?: string;
}

export interface BenchmarkMeta {
  device: string;
  os: string;
  engine: string;
  backend: string;
  passes: 1 | 2;
  /** null = the runtime's own scaling (1024 px for LiteRT-LM). */
  maxImageEdge: number | null;
  startedAt: string;
  /** Date the documents were generated "as of", so recency rules are stable. */
  asOf: string;
  /** Free-form notes: battery %, thermal state, room temperature... */
  notes?: string;
  /** TRUE only for fabricated pipeline-test data. Never quote these numbers. */
  demoData?: boolean;
}

export interface BenchmarkRun {
  meta: BenchmarkMeta;
  items: BenchmarkItem[];
}

export interface LabelFile {
  generatedOn: string;
  seed: number;
  items: Array<{
    id: string;
    file: string;
    kind: 'address';
    variant: string;
    expected: AddressExpected;
    truth: Record<string, string | null>;
    fieldsVisible: boolean;
    expectedOutcome: Outcome;
  }>;
}

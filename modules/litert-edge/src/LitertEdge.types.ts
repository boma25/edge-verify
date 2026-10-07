export type LitertBackend = 'cpu' | 'gpu';

export interface MemoryInfo {
  totalBytes: number;
  availableBytes: number;
  lowMemory: boolean;
  thresholdBytes: number;
}

export interface LoadOptions {
  modelPath: string;
  backend: LitertBackend;
  maxNumTokens: number;
  cacheDir: string;
}

export interface LoadResult {
  initSeconds: number;
}

export interface RunOptions {
  imagePath: string;
  systemPrompt: string;
  prompt: string;
  schemaJson: string | null;
  maxOutputTokens: number;
}

export interface RunResult {
  text: string;
  totalMs: number;
  ttftSeconds: number;
  prefillTps: number;
  decodeTps: number;
}

export interface LitertEdgeNativeModule {
  memoryInfo(): Promise<MemoryInfo>;
  load(opts: LoadOptions): Promise<LoadResult>;
  run(opts: RunOptions): Promise<RunResult>;
  unload(): Promise<void>;
}

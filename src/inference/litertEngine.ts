import {
  GEMMA_4_E2B_IT,
  createLLM,
  estimateMemory,
  isMemoryError,
  type Backend,
  type LiteRTLMInstance,
} from 'react-native-litert-lm';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { InferenceTimings } from '../domain/types';
import {
  EngineError,
  type AddressRun,
  type EngineStatus,
  type JobPhotoRun,
  type PreflightInfo,
  type RunOptions,
  type VerificationEngine,
} from './engine';
import { ExtractionParseError, parseAddressExtraction, parseJobPhotoExtraction } from './parse';
import {
  ADDRESS_PROMPT_A,
  ADDRESS_PROMPT_B,
  ADDRESS_SCHEMA_A,
  ADDRESS_SCHEMA_B,
  ADDRESS_SYSTEM_PROMPT,
  JOB_SYSTEM_PROMPT,
  jobPassSpecs,
} from './schemas';
import { log } from '../util/log';
import { hasEnoughRamToTry, MIN_FREE_RAM_BYTES } from './memoryGuard';
import { backendCandidates, backendLabel } from './selectBackend';

/** Gemma 4 E2B on LiteRT-LM is ~2.58 GB on disk. */
const MODEL_FILE_BYTES = 2.58e9;

export interface LiteRTEngineConfig {
  /** Defaults to the public Gemma 4 E2B .litertlm file. */
  modelUrl?: string;
  /** KV-cache budget. A single image + schema fits comfortably in 2048. */
  maxContextTokens?: number;
}

interface PassSpec {
  prompt: string;
  schema: object;
}

interface PassResult {
  raw: string;
  ms: number;
  ttftMs?: number;
  tokensPerSecond?: number;
}

/**
 * On-device Gemma 4 E2B via react-native-litert-lm.
 *
 * Backend is chosen automatically (NPU → GPU → CPU) with fallback on failure.
 */
export class LiteRTGemmaEngine implements VerificationEngine {
  readonly id = 'litert-gemma' as const;
  label: string;

  private llm: LiteRTLMInstance | null = null;
  private ready = false;
  private activeBackend: Backend | null = null;
  private readonly modelUrl: string;
  private readonly maxContextTokens: number;
  private readonly candidates: Backend[];

  constructor(cfg: LiteRTEngineConfig = {}) {
    this.modelUrl = cfg.modelUrl ?? GEMMA_4_E2B_IT;
    this.maxContextTokens = cfg.maxContextTokens ?? 2048;
    this.candidates = backendCandidates();
    this.label = `Gemma 4 E2B · LiteRT · auto (${this.candidates.map(backendLabel).join('→')})`;
  }

  /** Backend that actually loaded, or null before load. */
  getBackend(): Backend | null {
    return this.activeBackend;
  }

  private ensure(): LiteRTLMInstance {
    if (!this.llm) this.llm = createLLM();
    return this.llm;
  }

  preflight(): PreflightInfo | null {
    try {
      const usage = this.ensure().getMemoryUsage();
      const est = estimateMemory({
        modelFileSizeBytes: MODEL_FILE_BYTES,
        availableMemoryBytes: usage.availableMemoryBytes,
        config: {
          backend: this.activeBackend ?? this.candidates[0],
          maxContextTokens: this.maxContextTokens,
        },
      });
      return {
        verdict: est.verdict,
        totalEstimatedBytes: est.totalEstimatedBytes,
        availableBytes: est.availableBytes,
        recommendation: est.recommendation,
      };
    } catch {
      return null;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async load(onStatus: (s: EngineStatus) => void): Promise<void> {
    if (this.ready) {
      log.info('engine', 'load skipped — already ready', { backend: this.activeBackend });
      onStatus({ phase: 'ready' });
      return;
    }
    const llm = this.ensure();
    const pre = this.preflight();
    log.info('engine', 'load start', {
      candidates: this.candidates,
      availableBytes: pre?.availableBytes,
      estimatedBytes: pre?.totalEstimatedBytes,
      verdict: pre?.verdict,
      minFreeRam: MIN_FREE_RAM_BYTES,
    });
    if (pre && !hasEnoughRamToTry(pre.availableBytes)) {
      log.error('engine', 'load blocked — under RAM floor', {
        availableBytes: pre.availableBytes,
        minFreeRam: MIN_FREE_RAM_BYTES,
      });
      onStatus({
        phase: 'error',
        memoryVerdict: 'critical',
        message: `Need at least ${MIN_FREE_RAM_BYTES / 1e9} GB free RAM (have ${(pre.availableBytes / 1e9).toFixed(1)} GB).`,
      });
      throw new EngineError('not enough memory', 'memory');
    }
    onStatus({ phase: 'downloading', progress: 0 });

    let lastError: unknown;
    for (let i = 0; i < this.candidates.length; i++) {
      const backend = this.candidates[i];
      log.info('engine', `trying backend ${backendLabel(backend)}`);
      try {
        await llm.loadModel(
          this.modelUrl,
          {
            backend,
            temperature: 0,
            maxContextTokens: this.maxContextTokens,
            maxOutputTokens: 320,
            enableStructuredOutput: true,
            // Gemma 4 E2B filename does not match the library's "3n"/"gemma3" sniff.
            multimodal: true,
            // Bypass LiteRT's ~estimate-fit check; we already enforce MIN_FREE_RAM_BYTES.
            forceLoad: true,
          },
          (p) =>
            onStatus(p >= 1 ? { phase: 'loading' } : { phase: 'downloading', progress: p }),
        );
        this.activeBackend = backend;
        this.ready = true;
        this.label = `Gemma 4 E2B · LiteRT · ${backendLabel(backend)}`;
        log.info('engine', 'load ok', { backend, multimodal: true });
        onStatus({ phase: 'ready' });
        return;
      } catch (e) {
        lastError = e;
        log.warn('engine', `backend ${backendLabel(backend)} failed`, {
          message: e instanceof Error ? e.message : String(e),
          memoryError: isMemoryError(e),
        });
        if (isMemoryError(e)) {
          onStatus({
            phase: 'error',
            memoryVerdict: e.estimate.verdict,
            message: 'Not enough memory',
          });
          throw new EngineError(e.message, 'memory');
        }
        // Try next accelerator; unload partial state if needed.
        try {
          await llm.unload();
        } catch {
          /* ignore */
        }
        this.llm = null;
        if (i < this.candidates.length - 1) {
          onStatus({
            phase: 'loading',
            message: `${backendLabel(backend)} failed · trying ${backendLabel(this.candidates[i + 1])}`,
          });
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    log.error('engine', 'load failed on all backends', { message });
    // Keep status.message short for UI; full detail stays on the thrown error.
    onStatus({ phase: 'error', message: 'Model failed to load' });
    throw new EngineError(message, 'inference');
  }

  async unload(): Promise<void> {
    log.info('engine', 'unload');
    if (this.llm) await this.llm.unload();
    this.ready = false;
    this.activeBackend = null;
    this.label = `Gemma 4 E2B · LiteRT · auto (${this.candidates.map(backendLabel).join('→')})`;
  }

  async extractAddress(imageUri: string, opts: RunOptions): Promise<AddressRun> {
    log.info('engine', 'extractAddress start', { passes: opts.passes, uri: trimUri(imageUri) });
    const specs: PassSpec[] = [
      { prompt: ADDRESS_PROMPT_A, schema: ADDRESS_SCHEMA_A },
      { prompt: ADDRESS_PROMPT_B, schema: ADDRESS_SCHEMA_B },
    ].slice(0, opts.passes);
    const { results, timings } = await this.runPasses(ADDRESS_SYSTEM_PROMPT, specs, imageUri, opts);
    const passes = results.map((r, i) =>
      this.parse(() => parseAddressExtraction(r.raw), `address pass ${i + 1}`, r.raw),
    );
    log.info('engine', 'extractAddress ok', {
      totalMs: timings.totalMs,
      perPassMs: timings.perPassMs,
      documentType: passes[0]?.documentType,
      legibility: passes[0]?.legibility,
    });
    return { passes, timings };
  }

  async extractJobPhoto(imageUri: string, opts: RunOptions): Promise<JobPhotoRun> {
    const role = opts.jobRole ?? 'after';
    log.info('engine', 'extractJobPhoto start', {
      role,
      passes: opts.passes,
      uri: trimUri(imageUri),
    });
    const specs: PassSpec[] = jobPassSpecs(role).slice(0, opts.passes);
    const { results, timings } = await this.runPasses(JOB_SYSTEM_PROMPT, specs, imageUri, opts);
    const passes = results.map((r, i) =>
      this.parse(() => parseJobPhotoExtraction(r.raw), `job ${role} pass ${i + 1}`, r.raw),
    );
    log.info('engine', 'extractJobPhoto ok', {
      role,
      totalMs: timings.totalMs,
      category: passes[0]?.category,
      photoQuality: passes[0]?.photoQuality,
    });
    return { passes, timings };
  }

  private parse<T>(fn: () => T, label: string, raw: string): T {
    try {
      return fn();
    } catch (e) {
      log.error('engine', `parse failed (${label})`, {
        message: e instanceof Error ? e.message : String(e),
        rawPreview: raw.slice(0, 240),
      });
      if (e instanceof ExtractionParseError) throw new EngineError(e.message, 'parse');
      throw e;
    }
  }

  private async runPasses(
    systemPrompt: string,
    specs: PassSpec[],
    imageUri: string,
    opts: RunOptions,
  ): Promise<{ results: PassResult[]; timings: InferenceTimings }> {
    if (!this.ready || !this.llm) {
      log.error('engine', 'extract called before ready');
      throw new EngineError('model is not loaded', 'not_ready');
    }
    const llm = this.llm;
    const path = await this.prepareImage(imageUri, opts.maxImageEdge);
    log.info('engine', 'image ready', { path: trimUri(path), maxImageEdge: opts.maxImageEdge ?? 'runtime' });

    const started = Date.now();
    const results: PassResult[] = [];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      try {
        llm.resetConversation(undefined, systemPrompt);
        const t0 = Date.now();
        const raw = await llm.execute(
          [
            { type: 'image', path },
            { type: 'text', text: spec.prompt },
          ],
          undefined,
          { responseSchema: JSON.stringify(spec.schema), maxOutputTokens: 320 },
        );
        const ms = Date.now() - t0;
        const stats = llm.getStats();
        log.info('engine', `pass ${i + 1}/${specs.length} ok`, {
          ms,
          ttftMs: stats.timeToFirstToken,
          tokensPerSecond: stats.tokensPerSecond,
          rawChars: raw.length,
        });
        results.push({
          raw,
          ms,
          ttftMs: stats.timeToFirstToken,
          tokensPerSecond: stats.tokensPerSecond,
        });
      } catch (e) {
        log.error('engine', `pass ${i + 1}/${specs.length} inference failed`, {
          message: e instanceof Error ? e.message : String(e),
        });
        if (e instanceof EngineError) throw e;
        throw new EngineError(e instanceof Error ? e.message : String(e), 'inference');
      }
    }

    return {
      results,
      timings: {
        totalMs: Date.now() - started,
        perPassMs: results.map((r) => r.ms),
        ttftMs: results.map((r) => r.ttftMs ?? 0),
        tokensPerSecond: results.map((r) => r.tokensPerSecond ?? 0),
      },
    };
  }

  private async prepareImage(uri: string, maxEdge?: number): Promise<string> {
    const toPath = (u: string) => u.replace(/^file:\/\//, '');
    if (!maxEdge) return toPath(uri);

    const base = await ImageManipulator.manipulate(uri).renderAsync();
    if (Math.max(base.width, base.height) <= maxEdge) return toPath(uri);

    const resize = base.width >= base.height ? { width: maxEdge } : { height: maxEdge };
    const resized = await ImageManipulator.manipulate(base).resize(resize).renderAsync();
    const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    return toPath(saved.uri);
  }
}

function trimUri(uri: string): string {
  if (uri.length <= 64) return uri;
  return `${uri.slice(0, 28)}…${uri.slice(-28)}`;
}


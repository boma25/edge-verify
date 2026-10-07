import type { InferenceTimings } from '../domain/types';
import { log } from '../util/log';
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

import * as LitertEdge from '../../modules/litert-edge';
import type { LitertBackend, RunResult } from '../../modules/litert-edge';

/** Gemma 4 E2B .litertlm on-disk size (~2.58 GB). Exact bytes UNKNOWN until measured on device. */
export const MODEL_FILE_BYTES = 2.58e9;
export const MODEL_FILENAME = 'gemma-4-E2B-it.litertlm';
export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm';

/**
 * Heuristic RAM multipliers vs model file size (not LiteRT's estimator).
 * safe  >= 1.6× model bytes free
 * tight >= 1.15× model bytes free
 * else critical
 */
export const MEMORY_SAFE_MULT = 1.6;
export const MEMORY_TIGHT_MULT = 1.15;

/** Accept downloaded size within ±2% of MODEL_FILE_BYTES (exact byte count UNKNOWN). */
const SIZE_TOLERANCE = 0.02;

const MAX_CONTEXT_TOKENS = 2048;
const MAX_OUTPUT_TOKENS = 320;

export interface LiteRTKotlinEngineConfig {
  modelUrl?: string;
  modelFileName?: string;
  modelFileBytes?: number;
}

interface PassSpec {
  prompt: string;
  schema: object;
}

type FsModule = typeof import('expo-file-system');
type ManipModule = typeof import('expo-image-manipulator');

function fs(): FsModule {
  // Lazy so Node unit tests can import this module without loading RN.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-file-system') as FsModule;
}

function imageManip(): ManipModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-image-manipulator') as ManipModule;
}

/** Expo File.uri → absolute filesystem path for native open(). */
export function toFsPath(uriOrPath: string): string {
  let p = uriOrPath.trim();
  if (p.startsWith('file://')) {
    p = p.replace(/^file:\/\//, '');
    if (p.startsWith('localhost/')) p = p.slice('localhost'.length);
  }
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/**
 * On-device Gemma 4 E2B via local Expo module → Google's Kotlin LiteRT-LM API.
 * Tries GPU then CPU (no NPU in v1).
 */
export class LiteRTKotlinEngine implements VerificationEngine {
  readonly id = 'litert-gemma' as const;
  label = 'Gemma 4 E2B (LiteRT-LM Kotlin)';

  private ready = false;
  private activeBackend: LitertBackend | null = null;
  private lastPreflight: PreflightInfo | null = null;
  /** Absolute FS path of the loaded .litertlm (vision re-opens this at run time). */
  private loadedModelPath: string | null = null;
  private readonly modelUrl: string;
  private readonly modelFileName: string;
  private readonly modelFileBytes: number;

  constructor(cfg: LiteRTKotlinEngineConfig = {}) {
    this.modelUrl = cfg.modelUrl ?? MODEL_DOWNLOAD_URL;
    this.modelFileName = cfg.modelFileName ?? MODEL_FILENAME;
    this.modelFileBytes = cfg.modelFileBytes ?? MODEL_FILE_BYTES;
  }

  preflight(): PreflightInfo | null {
    return this.lastPreflight;
  }

  isReady(): boolean {
    return this.ready;
  }

  private modelsDir() {
    const { Directory, Paths } = fs();
    return new Directory(Paths.document, 'models');
  }

  private modelFile() {
    const { File } = fs();
    return new File(this.modelsDir(), this.modelFileName);
  }

  private cacheDir() {
    const { Directory, Paths } = fs();
    return new Directory(Paths.cache, 'litert-kotlin');
  }

  private sizeLooksOk(bytes: number): boolean {
    const lo = this.modelFileBytes * (1 - SIZE_TOLERANCE);
    const hi = this.modelFileBytes * (1 + SIZE_TOLERANCE);
    return bytes >= lo && bytes <= hi;
  }

  private computePreflight(availableBytes: number): PreflightInfo {
    const safeFloor = this.modelFileBytes * MEMORY_SAFE_MULT;
    const tightFloor = this.modelFileBytes * MEMORY_TIGHT_MULT;
    let verdict: PreflightInfo['verdict'];
    let recommendation: string;
    if (availableBytes >= safeFloor) {
      verdict = 'safe';
      recommendation = 'Enough free RAM to try loading.';
    } else if (availableBytes >= tightFloor) {
      verdict = 'tight';
      recommendation = 'Marginal free RAM; load may still fail.';
    } else {
      verdict = 'critical';
      recommendation = 'Not enough free RAM for this model.';
    }
    return {
      verdict,
      totalEstimatedBytes: this.modelFileBytes * MEMORY_SAFE_MULT,
      availableBytes,
      recommendation,
    };
  }

  async refreshMemoryPreflight(): Promise<PreflightInfo | null> {
    if (!LitertEdge.isAvailable()) {
      this.lastPreflight = null;
      return null;
    }
    try {
      const mem = await LitertEdge.memoryInfo();
      this.lastPreflight = this.computePreflight(mem.availableBytes);
      return this.lastPreflight;
    } catch {
      this.lastPreflight = null;
      return null;
    }
  }

  /**
   * Download the .litertlm to document/models only (no RAM gate, no native load).
   * Safe on low-RAM devices.
   */
  async downloadModel(onStatus: (s: EngineStatus) => void): Promise<void> {
    if (!LitertEdge.isAvailable()) {
      onStatus({ phase: 'error', message: 'Kotlin LiteRT module not available' });
      throw new EngineError('LitertEdge native module is not available', 'inference');
    }
    try {
      const mem = await LitertEdge.memoryInfo();
      this.lastPreflight = this.computePreflight(mem.availableBytes);
    } catch {
      /* preflight optional for download */
    }
    const file = await this.ensureModelFile(onStatus);
    log.info('kotlinEngine', 'downloadModel done', { size: file.size, path: file.uri });
    onStatus({
      phase: 'idle',
      memoryVerdict: this.lastPreflight?.verdict,
      message: 'Model on disk — tap Load',
    });
  }

  /**
   * Load weights into RAM from the already-downloaded file.
   * Does not download; fails with not_ready if the file is missing.
   */
  async load(onStatus: (s: EngineStatus) => void): Promise<void> {
    if (this.ready) {
      onStatus({ phase: 'ready' });
      return;
    }
    if (!LitertEdge.isAvailable()) {
      onStatus({ phase: 'error', message: 'Kotlin LiteRT module not available' });
      throw new EngineError('LitertEdge native module is not available', 'inference');
    }

    const file = this.modelFile();
    if (!file.exists || !this.sizeLooksOk(file.size)) {
      onStatus({ phase: 'error', message: 'Download the model first' });
      throw new EngineError('Download the model first', 'not_ready');
    }

    const mem = await LitertEdge.memoryInfo();
    const pre = this.computePreflight(mem.availableBytes);
    this.lastPreflight = pre;
    onStatus({
      phase: 'loading',
      memoryVerdict: pre.verdict,
      message: pre.recommendation,
    });
    if (pre.verdict === 'critical') {
      log.warn('kotlinEngine', 'load blocked — under RAM floor', {
        availableBytes: pre.availableBytes,
      });
      onStatus({
        phase: 'error',
        memoryVerdict: 'critical',
        message: `Not enough memory (${(pre.availableBytes / 1e9).toFixed(1)} GB free)`,
      });
      throw new EngineError('not enough memory', 'memory');
    }

    const cache = this.cacheDir();
    if (!cache.exists) cache.create({ intermediates: true, idempotent: true });

    const modelPath = toFsPath(file.uri);
    const cachePath = toFsPath(cache.uri);
    log.info('kotlinEngine', 'native load', { modelPath, cachePath, size: file.size });

    const backends: LitertBackend[] = ['gpu', 'cpu'];
    let lastError: unknown;
    for (let i = 0; i < backends.length; i++) {
      const backend = backends[i];
      log.info('kotlinEngine', `trying backend ${backend}`);
      try {
        const result = await LitertEdge.load({
          modelPath,
          backend,
          maxNumTokens: MAX_CONTEXT_TOKENS,
          cacheDir: cachePath,
        });
        this.activeBackend = backend;
        this.loadedModelPath = modelPath;
        this.ready = true;
        this.label = `Gemma 4 E2B (LiteRT-LM Kotlin · ${backend.toUpperCase()})`;
        log.info('kotlinEngine', 'load ok', { backend, initSeconds: result.initSeconds, modelPath });
        onStatus({ phase: 'ready', memoryVerdict: pre.verdict });
        return;
      } catch (e) {
        lastError = e;
        log.warn('kotlinEngine', `backend ${backend} failed`, {
          message: e instanceof Error ? e.message : String(e),
        });
        try {
          await LitertEdge.unload();
        } catch {
          /* ignore */
        }
        this.loadedModelPath = null;
        if (i < backends.length - 1) {
          onStatus({
            phase: 'loading',
            memoryVerdict: pre.verdict,
            message: `${backend.toUpperCase()} failed · trying ${backends[i + 1].toUpperCase()}`,
          });
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    onStatus({ phase: 'error', memoryVerdict: pre.verdict, message: 'Model failed to load' });
    throw new EngineError(message, 'inference');
  }

  private async ensureModelFile(onStatus: (s: EngineStatus) => void) {
    const { File } = fs();
    const dir = this.modelsDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = this.modelFile();
    if (file.exists && this.sizeLooksOk(file.size)) {
      log.info('kotlinEngine', 'model on disk', { size: file.size, path: file.uri });
      return file;
    }
    if (file.exists) {
      log.warn('kotlinEngine', 'deleting incomplete/wrong-size model', { size: file.size });
      file.delete();
    }

    onStatus({ phase: 'downloading', progress: 0 });
    log.info('kotlinEngine', 'download start', { url: this.modelUrl, dest: file.uri });
    let downloaded: InstanceType<FsModule['File']>;
    try {
      downloaded = await File.downloadFileAsync(this.modelUrl, file, {
        idempotent: true,
        onProgress: ({ bytesWritten, totalBytes }) => {
          const progress =
            totalBytes > 0
              ? Math.min(1, bytesWritten / totalBytes)
              : Math.min(0.99, bytesWritten / this.modelFileBytes);
          onStatus({ phase: 'downloading', progress });
        },
      });
    } catch (e) {
      throw new EngineError(e instanceof Error ? e.message : String(e), 'inference');
    }

    if (!downloaded.exists || !this.sizeLooksOk(downloaded.size)) {
      throw new EngineError(
        `Downloaded model size mismatch (got ${downloaded.exists ? downloaded.size : 0}, expected ~${this.modelFileBytes})`,
        'inference',
      );
    }
    onStatus({ phase: 'downloading', progress: 1 });
    log.info('kotlinEngine', 'download ok', { size: downloaded.size, path: downloaded.uri });
    return downloaded;
  }

  async unload(): Promise<void> {
    log.info('kotlinEngine', 'unload');
    try {
      await LitertEdge.unload();
    } catch {
      /* ignore */
    }
    this.ready = false;
    this.activeBackend = null;
    this.loadedModelPath = null;
    this.label = 'Gemma 4 E2B (LiteRT-LM Kotlin)';
  }

  async extractAddress(imageUri: string, opts: RunOptions): Promise<AddressRun> {
    const specs: PassSpec[] = [
      { prompt: ADDRESS_PROMPT_A, schema: ADDRESS_SCHEMA_A },
      { prompt: ADDRESS_PROMPT_B, schema: ADDRESS_SCHEMA_B },
    ].slice(0, opts.passes);
    const { results, timings } = await this.runPasses(ADDRESS_SYSTEM_PROMPT, specs, imageUri, opts);
    const passes = results.map((r, i) =>
      this.parse(() => parseAddressExtraction(r.text), `address pass ${i + 1}`, r.text),
    );
    return { passes, timings };
  }

  async extractJobPhoto(imageUri: string, opts: RunOptions): Promise<JobPhotoRun> {
    const role = opts.jobRole ?? 'after';
    const specs: PassSpec[] = jobPassSpecs(role).slice(0, opts.passes);
    log.info('kotlinEngine', 'extractJobPhoto start', {
      role,
      passes: opts.passes,
      uriTail: imageUri.slice(-40),
      promptPreview: specs[0]?.prompt.slice(0, 48),
    });
    const { results, timings } = await this.runPasses(JOB_SYSTEM_PROMPT, specs, imageUri, opts);
    const passes = results.map((r, i) =>
      this.parse(() => parseJobPhotoExtraction(r.text), `job ${role} pass ${i + 1}`, r.text),
    );
    log.info('kotlinEngine', 'extractJobPhoto ok', {
      role,
      totalMs: timings.totalMs,
      category: passes[0]?.category,
      workAppearsComplete: passes[0]?.workAppearsComplete,
      photoQuality: passes[0]?.photoQuality,
      description: passes[0]?.description,
    });
    return { passes, timings };
  }

  private parse<T>(fn: () => T, label: string, raw: string): T {
    try {
      return fn();
    } catch (e) {
      log.error('kotlinEngine', `parse failed (${label})`, {
        message: e instanceof Error ? e.message : String(e),
        rawPreview: raw.slice(0, 240),
      });
      if (e instanceof ExtractionParseError) throw new EngineError(e.message, 'parse');
      throw e;
    }
  }

  private assertModelFilePresent(): void {
    try {
      const onDisk = this.modelFile();
      if (!onDisk.exists) {
        log.error('kotlinEngine', 'model file missing before run', {
          path: this.loadedModelPath ?? onDisk.uri,
        });
        this.ready = false;
        this.loadedModelPath = null;
        throw new EngineError('Model file missing on disk — re-download and load', 'not_ready');
      }
    } catch (e) {
      if (e instanceof EngineError) throw e;
      this.ready = false;
      this.loadedModelPath = null;
      throw new EngineError('Model file missing on disk — re-download and load', 'not_ready');
    }
  }

  private async runPasses(
    systemPrompt: string,
    specs: PassSpec[],
    imageUri: string,
    opts: RunOptions,
  ): Promise<{ results: RunResult[]; timings: InferenceTimings }> {
    if (!this.ready) {
      throw new EngineError('model is not loaded', 'not_ready');
    }
    this.assertModelFilePresent();
    const path = await this.prepareImage(imageUri, opts.maxImageEdge);
    const started = Date.now();
    const results: RunResult[] = [];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      try {
        const result = await LitertEdge.run({
          imagePath: path,
          systemPrompt,
          prompt: spec.prompt,
          schemaJson: JSON.stringify(spec.schema),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        });
        results.push(result);
      } catch (e) {
        if (e instanceof EngineError) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/no such file|model file missing|ERR_NOT_READY/i.test(msg)) {
          this.ready = false;
          this.loadedModelPath = null;
          throw new EngineError('Model file missing on disk — re-download and load', 'not_ready');
        }
        throw new EngineError(msg, 'inference');
      }
    }
    return {
      results,
      timings: {
        totalMs: Date.now() - started,
        perPassMs: results.map((r) => r.totalMs),
        ttftMs: results.map((r) => r.ttftSeconds * 1000),
        tokensPerSecond: results.map((r) => r.decodeTps),
      },
    };
  }

  private async prepareImage(uri: string, maxEdge?: number): Promise<string> {
    const toPath = (u: string) => u.replace(/^file:\/\//, '');
    if (!maxEdge) return toPath(uri);

    const { ImageManipulator, SaveFormat } = imageManip();
    const base = await ImageManipulator.manipulate(uri).renderAsync();
    if (Math.max(base.width, base.height) <= maxEdge) return toPath(uri);

    const resize = base.width >= base.height ? { width: maxEdge } : { height: maxEdge };
    const resized = await ImageManipulator.manipulate(base).resize(resize).renderAsync();
    const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    return toPath(saved.uri);
  }
}

function probeModelFile(fileName: string): { fileName: string; sizeBytes: number; path: string } | null {
  try {
    const { Directory, File, Paths } = fs();
    const file = new File(new Directory(Paths.document, 'models'), fileName);
    if (!file.exists) return null;
    let sizeBytes = 0;
    try {
      sizeBytes = file.size;
    } catch {
      // Some FS backends throw on size for multi-GB files; existence still counts.
      sizeBytes = 1;
    }
    if (sizeBytes <= 0) return null;
    return { fileName: file.name || fileName, sizeBytes, path: file.uri };
  } catch (e) {
    log.warn('kotlinEngine', 'probeModelFile failed', {
      fileName,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** True when the Gemma .litertlm is present under document/models. */
export function hasKotlinModelOnDisk(fileName: string = MODEL_FILENAME): boolean {
  return probeModelFile(fileName) != null;
}

/** List Kotlin-downloaded models under document/models. */
export function listKotlinCachedModels(): { fileName: string; sizeBytes: number; path: string }[] {
  try {
    const { Directory, Paths } = fs();
    const dir = new Directory(Paths.document, 'models');
    if (!dir.exists) {
      const probed = probeModelFile(MODEL_FILENAME);
      return probed ? [probed] : [];
    }
    // Avoid `instanceof File` — SharedObject instances can fail that check across requires.
    const listed = dir
      .list()
      .map((entry) => {
        const name = entry.name ?? '';
        if (!name.endsWith('.litertlm') && typeof (entry as { list?: unknown }).list === 'function') {
          return null;
        }
        if (name && !name.endsWith('.litertlm')) {
          // Still allow nameless File-like entries (list() quirks).
          if (typeof (entry as { size?: number }).size !== 'number') return null;
        }
        let sizeBytes = 0;
        try {
          sizeBytes = (entry as { size: number }).size;
        } catch {
          sizeBytes = 1;
        }
        if (!name && sizeBytes <= 0) return null;
        return {
          fileName: name || MODEL_FILENAME,
          sizeBytes,
          path: entry.uri,
        };
      })
      .filter((x): x is { fileName: string; sizeBytes: number; path: string } => x != null);

    if (listed.length > 0) return listed;

    const probed = probeModelFile(MODEL_FILENAME);
    return probed ? [probed] : [];
  } catch (e) {
    log.warn('kotlinEngine', 'listKotlinCachedModels failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    const probed = probeModelFile(MODEL_FILENAME);
    return probed ? [probed] : [];
  }
}

/** Delete one Kotlin-cached model by filename. */
export function deleteKotlinCachedModel(fileName: string): void {
  const { Directory, File, Paths } = fs();
  const file = new File(new Directory(Paths.document, 'models'), fileName);
  if (file.exists) file.delete();
}

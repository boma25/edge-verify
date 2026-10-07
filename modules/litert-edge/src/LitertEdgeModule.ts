import type {
  LitertEdgeNativeModule,
  LoadOptions,
  LoadResult,
  MemoryInfo,
  RunOptions,
  RunResult,
} from './LitertEdge.types';

let cached: LitertEdgeNativeModule | null | undefined;

function getNative(): LitertEdgeNativeModule | null {
  if (cached !== undefined) return cached;
  try {
    // Lazy require so Node unit tests can inject mocks without loading Expo.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require('expo') as typeof import('expo');
    cached = requireNativeModule<LitertEdgeNativeModule>('LitertEdge');
  } catch {
    cached = null;
  }
  return cached;
}

/** False in Expo Go / when the native module is missing. */
export function isAvailable(): boolean {
  return getNative() !== null;
}

function requireModule(): LitertEdgeNativeModule {
  const mod = getNative();
  if (!mod) {
    throw new Error('LitertEdge native module is not available (Android dev build required)');
  }
  return mod;
}

export async function memoryInfo(): Promise<MemoryInfo> {
  return requireModule().memoryInfo();
}

export async function load(opts: LoadOptions): Promise<LoadResult> {
  return requireModule().load(opts);
}

export async function run(opts: RunOptions): Promise<RunResult> {
  return requireModule().run(opts);
}

export async function unload(): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  await mod.unload();
}

/** @internal test hook — reset cached native module lookup. */
export function __resetNativeCacheForTests(): void {
  cached = undefined;
}

/** @internal test hook — inject a mock native module. */
export function __setNativeForTests(mod: LitertEdgeNativeModule | null): void {
  cached = mod;
}

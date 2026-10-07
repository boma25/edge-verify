import type {
  LitertEdgeNativeModule,
  LoadOptions,
  LoadResult,
  MemoryInfo,
  RunOptions,
  RunResult,
} from './LitertEdge.types';

export function isAvailable(): boolean {
  return false;
}

export async function memoryInfo(): Promise<MemoryInfo> {
  throw new Error('LitertEdge is Android-only');
}

export async function load(_opts: LoadOptions): Promise<LoadResult> {
  throw new Error('LitertEdge is Android-only');
}

export async function run(_opts: RunOptions): Promise<RunResult> {
  throw new Error('LitertEdge is Android-only');
}

export async function unload(): Promise<void> {
  /* no-op */
}

export function __resetNativeCacheForTests(): void {}

export function __setNativeForTests(_mod: LitertEdgeNativeModule | null): void {}

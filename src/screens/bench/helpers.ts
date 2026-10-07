import { Asset } from 'expo-asset';

import { fieldAccuracy, sweep } from '../../benchmark/analysis';
import type { BenchmarkItem } from '../../benchmark/types';
import type { VerificationEngine } from '../../inference';

export async function localUri(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('asset has no local uri');
  return uri;
}

export function safeRun(
  engine: VerificationEngine,
  uri: string,
  passes: 1 | 2,
  maxImageEdge?: number,
) {
  return engine.extractAddress(uri, { passes, maxImageEdge });
}

export function summarise(items: BenchmarkItem[], passes: 1 | 2, asOf: string) {
  return {
    acc: fieldAccuracy(items),
    rows: sweep(items, passes, asOf, [0.7, 0.8, 0.85, 0.9, 0.95]),
  };
}

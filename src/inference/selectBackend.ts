import { Platform } from 'react-native';
import type { Backend } from 'react-native-litert-lm';

/**
 * Ordered backends to try when loading the model.
 *
 * - iOS: Metal GPU, then CPU
 * - Android: NPU (Hexagon/APU) → GPU (OpenCL) → CPU
 *
 * LiteRT auto-falls back to CPU when an accelerator is missing; we still
 * retry the next candidate if load throws for a non-memory reason.
 */
export function backendCandidates(): Backend[] {
  if (Platform.OS === 'ios') return ['gpu', 'cpu'];
  return ['npu', 'gpu', 'cpu'];
}

export function backendLabel(backend: Backend): string {
  return backend.toUpperCase();
}

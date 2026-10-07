/**
 * Soft floor for allowing a load attempt.
 *
 * LiteRT's estimator often wants ~3.5–4 GB; we allow tries from 2.8 GB free
 * and pass forceLoad so its stricter preflight does not refuse.
 */
export const MIN_FREE_RAM_BYTES = 2.8e9;

export function hasEnoughRamToTry(availableBytes: number | undefined | null): boolean {
  if (availableBytes == null) return true; // unknown — let native decide
  return availableBytes >= MIN_FREE_RAM_BYTES;
}

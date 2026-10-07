import { EngineError } from '../inference/engine';

/** One-line user-facing error for toasts. */
export function shortError(err: unknown): string {
  if (err instanceof EngineError) {
    switch (err.kind) {
      case 'memory':
        return 'Not enough memory';
      case 'not_ready':
        return 'Model not loaded';
      case 'parse':
        return 'Could not read model output';
      case 'inference':
        return 'Model failed to run';
    }
  }

  const msg = (err instanceof Error ? err.message : String(err)).trim();
  if (!msg) return 'Something went wrong';
  if (/not enough memory|memory/i.test(msg) && /critical|exceed|refuse|available/i.test(msg)) {
    return 'Not enough memory';
  }
  if (/download|network|fetch|timeout|ECONN|ENOTFOUND/i.test(msg)) return 'Download failed';
  if (/permission|camera/i.test(msg)) return 'Camera permission needed';
  if (msg.length > 48) return 'Something went wrong';
  return msg;
}

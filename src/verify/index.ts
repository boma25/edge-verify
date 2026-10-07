/**
 * Verification pipeline (trace here after App → VerifyScreen).
 *
 *   runVerification  → engine extract + domain evaluate
 *   decisionFromResult → confidence gate
 */
export {
  MAX_RETRIES,
  decisionFromResult,
  runVerification,
  type RunResult,
  type RunVerificationInput,
  type Trade,
} from './run';
export { summarizeAddress, summarizeJob, summarizeJobPair } from './summarize';

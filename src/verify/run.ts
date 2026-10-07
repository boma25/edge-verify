import { decide, failClosedDecision } from '../domain/gate';
import type {
  AddressExpected,
  Evaluation,
  GateDecision,
  InferenceTimings,
  JobCategory,
  VerificationKind,
} from '../domain/types';
import { evaluateAddress, evaluateJobPair } from '../domain/validators';
import type { MockHints, RunOptions, VerificationEngine } from '../inference';
import { log } from '../util/log';
import { summarizeAddress, summarizeJobPair } from './summarize';

export const MAX_RETRIES = 2;

export type Trade = Exclude<JobCategory, 'unclear' | 'other'>;

/** Output of one verify call: evaluation (or fail-closed failure) + timings. */
export interface RunResult {
  kind: VerificationKind;
  /** After photo for job; sole image for address. */
  uri: string;
  beforeUri?: string;
  evaluation: Evaluation | null;
  failure?: string;
  timings?: InferenceTimings;
  summary: string;
}

export interface RunVerificationInput {
  engine: VerificationEngine;
  kind: VerificationKind;
  /** Address: document image. Job: ignored when before/after set. */
  imageUri?: string;
  /** Job pair: broken / incomplete state. */
  beforeUri?: string;
  /** Job pair: fixed / completed state. */
  afterUri?: string;
  passes: 1 | 2;
  expectedAddress: AddressExpected;
  trade: Trade;
  mock?: MockHints;
}

function mergeTimings(a: InferenceTimings, b: InferenceTimings): InferenceTimings {
  return {
    totalMs: a.totalMs + b.totalMs,
    perPassMs: [...a.perPassMs, ...b.perPassMs],
    ttftMs:
      a.ttftMs || b.ttftMs
        ? [...(a.ttftMs ?? []), ...(b.ttftMs ?? [])]
        : undefined,
  };
}

/**
 * Happy path: extract → evaluate.
 * Any engine/parse error returns evaluation=null so the gate fails closed.
 */
export async function runVerification(input: RunVerificationInput): Promise<RunResult> {
  const { engine, kind, passes, expectedAddress, trade, mock } = input;
  const opts: RunOptions = { passes, mock };

  log.info('verify', 'start', {
    kind,
    passes,
    engine: engine.id,
    expected:
      kind === 'address'
        ? { name: expectedAddress.fullName, city: expectedAddress.city }
        : { trade },
  });

  try {
    if (kind === 'address') {
      const imageUri = input.imageUri;
      if (!imageUri) throw new Error('address verify needs imageUri');
      const run = await engine.extractAddress(imageUri, opts);
      const evaluation = evaluateAddress(run.passes, expectedAddress);
      log.info('verify', 'evaluated address', {
        rulesFailed: evaluation.rules.filter((r) => !r.passed).map((r) => r.id),
        agreement: evaluation.agreement,
        captureIssue: evaluation.captureIssue,
        signals: evaluation.signals.map((s) => `${s.id}=${s.value.toFixed(2)}`),
        summary: summarizeAddress(run.passes[0]),
      });
      return {
        kind,
        uri: imageUri,
        evaluation,
        timings: run.timings,
        summary: summarizeAddress(run.passes[0]),
      };
    }

    const beforeUri = input.beforeUri;
    const afterUri = input.afterUri ?? input.imageUri;
    if (!beforeUri || !afterUri) {
      throw new Error('job verify needs beforeUri and afterUri');
    }

    log.info('verify', 'job pair extract', {
      trade,
      beforeTail: beforeUri.slice(-40),
      afterTail: afterUri.slice(-40),
    });

    // One pass per photo keeps latency close to a 2-pass address read.
    // Each image is explicitly labeled BEFORE / AFTER in the model prompt.
    log.info('verify', 'extract before…');
    const beforeRun = await engine.extractJobPhoto(beforeUri, {
      passes: 1,
      mock,
      jobRole: 'before',
    });
    log.info('verify', 'before reading', {
      category: beforeRun.passes[0]?.category,
      complete: beforeRun.passes[0]?.workAppearsComplete,
      quality: beforeRun.passes[0]?.photoQuality,
      real: beforeRun.passes[0]?.isRealSitePhoto,
      description: beforeRun.passes[0]?.description,
      totalMs: beforeRun.timings.totalMs,
    });

    log.info('verify', 'extract after…');
    const afterRun = await engine.extractJobPhoto(afterUri, {
      passes: 1,
      mock,
      jobRole: 'after',
    });
    log.info('verify', 'after reading', {
      category: afterRun.passes[0]?.category,
      complete: afterRun.passes[0]?.workAppearsComplete,
      quality: afterRun.passes[0]?.photoQuality,
      real: afterRun.passes[0]?.isRealSitePhoto,
      description: afterRun.passes[0]?.description,
      totalMs: afterRun.timings.totalMs,
    });

    const evaluation = evaluateJobPair(beforeRun.passes, afterRun.passes, { category: trade });
    const summary = summarizeJobPair(beforeRun.passes[0], afterRun.passes[0]);
    log.info('verify', 'evaluated job pair', {
      trade,
      rulesFailed: evaluation.rules.filter((r) => !r.passed).map((r) => r.id),
      agreement: evaluation.agreement,
      captureIssue: evaluation.captureIssue,
      signals: evaluation.signals.map((s) => `${s.id}=${s.value.toFixed(2)}`),
      summary,
    });
    return {
      kind,
      uri: afterUri,
      beforeUri,
      evaluation,
      timings: mergeTimings(beforeRun.timings, afterRun.timings),
      summary,
    };
  } catch (e) {
    const failure = e instanceof Error ? e.message : String(e);
    log.error('verify', 'fail closed — extract/evaluate threw', {
      kind,
      failure,
      name: e instanceof Error ? e.name : undefined,
    });
    return {
      kind,
      uri: input.afterUri ?? input.imageUri ?? '',
      beforeUri: input.beforeUri,
      evaluation: null,
      failure,
      summary: 'no reading available',
    };
  }
}

/** Pure: result + knobs → approve | retry | human_review. */
export function decisionFromResult(
  result: RunResult | null,
  threshold: number,
  attempt: number,
): GateDecision | null {
  if (!result) return null;
  if (!result.evaluation) {
    const d = failClosedDecision(result.failure ?? 'unknown error');
    log.warn('gate', 'fail closed', { failure: result.failure, outcome: d.outcome });
    return d;
  }
  const d = decide(result.evaluation, { approveThreshold: threshold, maxRetries: MAX_RETRIES }, attempt);
  log.info('gate', 'decision', {
    outcome: d.outcome,
    confidence: d.confidence,
    threshold,
    attempt,
    reasons: d.reasons,
  });
  return d;
}

import {
  DEFAULT_GATE_CONFIG,
  type Evaluation,
  type GateConfig,
  type GateDecision,
  type RuleResult,
  type VerificationKind,
} from './types';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** First matching failed rule wins — capture issues before content judgements. */
const MESSAGE_PRIORITY: Record<VerificationKind, readonly string[]> = {
  address: [
    'legibility',
    'doc_type',
    'address_present',
    'issue_date',
    'name_match',
    'location_match',
  ],
  job_photo: [
    'photo_quality',
    'real_photo',
    'category_match',
    'same_trade',
    'before_needs_work',
    'work_complete',
  ],
};

/** One descriptive sentence for the user; never a joined list. */
export function primaryUserMessage(
  rules: RuleResult[],
  kind: VerificationKind,
  fallback: string,
): string {
  const failed = new Map(
    rules.filter((r) => !r.passed && r.userMessage).map((r) => [r.id, r.userMessage!.trim()]),
  );
  for (const id of MESSAGE_PRIORITY[kind]) {
    const msg = failed.get(id);
    if (msg) return msg;
  }
  for (const msg of failed.values()) return msg;
  return fallback;
}

/**
 * Confidence = how much we trust the READING (not whether the document is valid).
 *
 * Weighted mean of the signals, capped by cross-pass agreement: if two
 * independent passes disagree, we cannot be more confident than they agree.
 */
export function computeConfidence(ev: Evaluation): number {
  const totalWeight = ev.signals.reduce((s, x) => s + x.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = ev.signals.reduce((s, x) => s + x.weight * clamp01(x.value), 0) / totalWeight;
  const capped = ev.agreement == null ? weighted : Math.min(weighted, ev.agreement);
  return round3(clamp01(capped));
}

/**
 * The tiered decision.
 *
 *   rules pass  AND confident                       → approve   (stays on-device)
 *   capture problem (blur, cut-off, …)              → retry     (retake; state why)
 *   confident, rules fail, user can fix it          → retry     (specific message)
 *   anything else, or retries exhausted             → human review
 *
 * `attempt` is the number of retries already used (0 on the first try).
 */
export function decide(
  ev: Evaluation,
  config: GateConfig = DEFAULT_GATE_CONFIG,
  attempt = 0,
): GateDecision {
  const confidence = computeConfidence(ev);
  const failed = ev.rules.filter((r) => !r.passed);
  const rulesPass = failed.length === 0;
  const confident = confidence >= config.approveThreshold;
  const canRetry = attempt < config.maxRetries;
  const allFixable = failed.length > 0 && failed.every((r) => r.fixableByUser);

  const base = { confidence, agreement: ev.agreement, rules: ev.rules, signals: ev.signals };
  const confLine = `confidence ${confidence.toFixed(2)} ${confident ? '≥' : '<'} threshold ${config.approveThreshold.toFixed(2)}`;

  if (rulesPass && confident) {
    return {
      ...base,
      outcome: 'approve',
      reasons: ['all rules passed', confLine],
      userMessage: 'Verified.',
    };
  }

  const failedLines = failed.map((r) => `${r.label}: ${r.detail}`);
  const message = (fallback: string) => primaryUserMessage(ev.rules, ev.kind, fallback);

  // Blurry / cut-off / not-a-doc: ask for a retake and say so. Do not escalate
  // misreads (e.g. name mismatch) from a bad capture to a person yet.
  if (ev.captureIssue && canRetry) {
    return {
      ...base,
      outcome: 'retry',
      reasons: [
        confLine,
        confident
          ? 'capture problem — retake before trusting judgement rules'
          : 'low confidence that looks like a capture problem',
        ...failedLines,
      ],
      userMessage: message('Document not clear. Please retake.'),
    };
  }

  if (confident && allFixable && canRetry) {
    return {
      ...base,
      outcome: 'retry',
      reasons: [confLine, 'confident reading, but a fixable rule failed', ...failedLines],
      userMessage: message('Retake needed.'),
    };
  }

  const why: string[] = [confLine];
  if (!rulesPass && !allFixable) why.push('a rule failed that only a person can judge');
  if (!rulesPass && allFixable && !canRetry) why.push('retries exhausted');
  if (!confident && !ev.captureIssue) why.push('readable capture but low confidence (passes disagree or values implausible)');
  if (ev.captureIssue && !canRetry) why.push('retries exhausted');
  if (rulesPass && !confident) why.push('rules pass but we do not trust the reading enough to auto-approve');

  return {
    ...base,
    outcome: 'human_review',
    reasons: [...why, ...failedLines],
    userMessage: message('Needs a person to review.'),
  };
}

/**
 * Fail CLOSED: if inference crashes, runs out of memory, times out or returns
 * unparseable output, the safe default is a person – never an approval.
 */
export function failClosedDecision(_message: string): GateDecision {
  return {
    outcome: 'human_review',
    confidence: 0,
    agreement: null,
    rules: [],
    signals: [],
    reasons: ['On-device reading failed', 'Failing closed to human review'],
    userMessage: 'Needs a person to review.',
  };
}


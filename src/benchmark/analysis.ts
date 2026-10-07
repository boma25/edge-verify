import { decide, failClosedDecision } from '../domain/gate';
import { fieldSimilarity } from '../domain/similarity';
import type { GateDecision, Outcome } from '../domain/types';
import { evaluateAddress } from '../domain/validators';
import type { BenchmarkItem } from './types';

export const DEFAULT_THRESHOLDS = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99];

export interface SweepRow {
  threshold: number;
  n: number;
  /** Share of all items decided on-device with no human and no retry. */
  approveRate: number;
  retryRate: number;
  /** Share sent to a person: the cost you are trying to minimise. */
  humanRate: number;
  /** Items auto-approved that should NOT have been. The number that must stay ~0. */
  wrongApprovals: number;
  /** wrongApprovals / items that should not be approved. */
  falseApproveRate: number;
  /** Of everything auto-approved, the share that was right. Null if nothing was approved. */
  approvalPrecision: number | null;
  /** Items that SHOULD have been approved but were not (needless friction). */
  missedApproveRate: number;
  /** Share where the gate's outcome equals the expected outcome. */
  outcomeAccuracy: number;
}

function decideItem(
  item: BenchmarkItem,
  passesUsed: 1 | 2,
  asOf: string,
  threshold: number,
): GateDecision {
  if (item.error || item.passes.length === 0) {
    return failClosedDecision(item.error ?? 'no reading');
  }
  const ev = evaluateAddress(item.passes.slice(0, passesUsed), item.expected, {
    now: new Date(`${asOf}T12:00:00Z`),
  });
  return decide(ev, { approveThreshold: threshold, maxRetries: 2 }, 0);
}

export function sweep(
  items: BenchmarkItem[],
  passesUsed: 1 | 2,
  asOf: string,
  thresholds: number[] = DEFAULT_THRESHOLDS,
): SweepRow[] {
  const n = items.length;
  const shouldApprove = items.filter((i) => i.expectedOutcome === 'approve').length;
  const shouldNot = n - shouldApprove;

  return thresholds.map((threshold) => {
    const counts: Record<Outcome, number> = { approve: 0, retry: 0, human_review: 0 };
    let wrongApprovals = 0;
    let missedApprove = 0;
    let correct = 0;

    for (const item of items) {
      const outcome = decideItem(item, passesUsed, asOf, threshold).outcome;
      counts[outcome]++;
      if (outcome === 'approve' && item.expectedOutcome !== 'approve') wrongApprovals++;
      if (outcome !== 'approve' && item.expectedOutcome === 'approve') missedApprove++;
      if (outcome === item.expectedOutcome) correct++;
    }

    return {
      threshold,
      n,
      approveRate: counts.approve / n,
      retryRate: counts.retry / n,
      humanRate: counts.human_review / n,
      wrongApprovals,
      falseApproveRate: shouldNot === 0 ? 0 : wrongApprovals / shouldNot,
      approvalPrecision: counts.approve === 0 ? null : 1 - wrongApprovals / counts.approve,
      missedApproveRate: shouldApprove === 0 ? 0 : missedApprove / shouldApprove,
      outcomeAccuracy: correct / n,
    };
  });
}

/** Confusion matrix of expected (rows) vs actual (columns) at one threshold. */
export function confusion(
  items: BenchmarkItem[],
  passesUsed: 1 | 2,
  asOf: string,
  threshold: number,
): Record<Outcome, Record<Outcome, number>> {
  const outcomes: Outcome[] = ['approve', 'retry', 'human_review'];
  const m = Object.fromEntries(
    outcomes.map((e) => [e, Object.fromEntries(outcomes.map((a) => [a, 0]))]),
  ) as Record<Outcome, Record<Outcome, number>>;
  for (const item of items) {
    m[item.expectedOutcome][decideItem(item, passesUsed, asOf, threshold).outcome]++;
  }
  return m;
}

export interface FieldAccuracy {
  n: number;
  documentType: number;
  fullName: number;
  addressLine: number;
  city: number;
  issueDate: number;
  /** All five correct on the same document. */
  allFields: number;
}

/** How well the model READS clean documents, independent of the gate. */
export function fieldAccuracy(items: BenchmarkItem[]): FieldAccuracy | null {
  const usable = items.filter((i) => i.fieldsVisible && !i.error && i.passes.length > 0 && i.truth);
  if (usable.length === 0) return null;

  const text = (a: string | null, b: string | null) => fieldSimilarity(a, b) >= 0.9;
  let dt = 0, nm = 0, ad = 0, ct = 0, dd = 0, all = 0;
  for (const i of usable) {
    const r = i.passes[0];
    const t = i.truth!;
    const ok = {
      dt: r.documentType === t.documentType,
      nm: text(r.fullName, t.fullName),
      ad: text(r.addressLine, t.addressLine),
      ct: text(r.city, t.city),
      dd: r.issueDate === t.issueDate,
    };
    dt += +ok.dt; nm += +ok.nm; ad += +ok.ad; ct += +ok.ct; dd += +ok.dd;
    if (Object.values(ok).every(Boolean)) all++;
  }
  const n = usable.length;
  return {
    n,
    documentType: dt / n,
    fullName: nm / n,
    addressLine: ad / n,
    city: ct / n,
    issueDate: dd / n,
    allFields: all / n,
  };
}

export interface Latency {
  n: number;
  medianMs: number;
  p90Ms: number;
  medianTokensPerSecond: number | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/** Time per image when `passesUsed` reads are made (from the recorded per-pass times). */
export function latency(items: BenchmarkItem[], passesUsed: 1 | 2): Latency | null {
  const totals = items
    .filter((i) => i.timings && !i.error)
    .map((i) => i.timings!.perPassMs.slice(0, passesUsed).reduce((s, v) => s + v, 0))
    .sort((a, b) => a - b);
  if (totals.length === 0) return null;

  const tps = items
    .flatMap((i) => i.timings?.tokensPerSecond?.slice(0, passesUsed) ?? [])
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  return {
    n: totals.length,
    medianMs: percentile(totals, 0.5),
    p90Ms: percentile(totals, 0.9),
    medianTokensPerSecond: tps.length ? percentile(tps, 0.5) : null,
  };
}

export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

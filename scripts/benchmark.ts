/**
 * Threshold-sweep analysis of an on-device benchmark run.
 *
 *   npm run benchmark -- path/to/results.json        # real run exported from the phone
 *   npm run benchmark -- --demo                      # FABRICATED readings, pipeline smoke test only
 *
 * Writes benchmark/out/<name>.csv and <name>.json (ready to chart for slides).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import {
  confusion,
  fieldAccuracy,
  latency,
  pct,
  sweep,
  type SweepRow,
} from '../src/benchmark/analysis';
import type { BenchmarkItem, BenchmarkRun, LabelFile } from '../src/benchmark/types';
import type { AddressExtraction } from '../src/domain/types';

const ROOT = resolve(__dirname, '..');
const LABELS = join(ROOT, 'assets', 'synthetic', 'labels.json');
const OUT_DIR = join(ROOT, 'benchmark', 'out');
const REPORT_THRESHOLD = 0.85;

/* ------------------------- demo (fabricated) data ------------------------- */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A made-up "model": NOT a measurement of Gemma or anything else. */
function fabricateReading(
  truth: LabelFile['items'][number],
  rand: () => number,
): AddressExtraction {
  const t = truth.truth as Record<string, string | null>;
  const base: AddressExtraction = {
    documentType: (t.documentType as AddressExtraction['documentType']) ?? 'other',
    fullName: t.fullName,
    addressLine: t.addressLine,
    city: t.city,
    state: t.state,
    issueDate: t.issueDate,
    issuer: t.issuer,
    legibility: 'clear',
  };
  switch (truth.variant) {
    case 'not_document':
      return { ...base, documentType: 'not_a_document', legibility: 'poor' };
    case 'blurry':
      return rand() < 0.85
        ? { ...base, legibility: 'poor', fullName: null, addressLine: null, city: null, state: null, issueDate: null }
        : { ...base, legibility: 'partial', fullName: null, issueDate: rand() < 0.5 ? null : base.issueDate };
    case 'cropped':
      return { ...base, fullName: null, addressLine: null, city: null, state: null, legibility: rand() < 0.5 ? 'partial' : 'clear' };
    default: {
      const noisy = truth.variant === 'mild' ? 0.12 : 0.04;
      const r: AddressExtraction = { ...base, legibility: truth.variant === 'mild' && rand() < 0.3 ? 'partial' : 'clear' };
      if (rand() < noisy && r.fullName) r.fullName = r.fullName.replace(/[aeiou]/, 'x');
      if (rand() < noisy && r.issueDate) r.issueDate = r.issueDate.replace(/-\d\d$/, '-01');
      if (rand() < noisy / 2 && r.addressLine) r.addressLine = r.addressLine.replace(/^\d+/, '99');
      return r;
    }
  }
}

function demoRun(): BenchmarkRun {
  const labels = JSON.parse(readFileSync(LABELS, 'utf8')) as LabelFile;
  const rand = mulberry32(42);
  const items: BenchmarkItem[] = labels.items.map((l) => {
    const passes = [fabricateReading(l, rand), fabricateReading(l, rand)];
    const ms = 1200 + Math.round(rand() * 600);
    return {
      id: l.id,
      variant: l.variant,
      expectedOutcome: l.expectedOutcome,
      expected: l.expected,
      truth: l.truth as unknown as AddressExtraction,
      fieldsVisible: l.fieldsVisible,
      passes,
      timings: { totalMs: ms * 2, perPassMs: [ms, ms], tokensPerSecond: [10, 10] },
    };
  });
  return {
    meta: {
      device: 'FABRICATED',
      os: 'n/a',
      engine: 'demo noise model',
      backend: 'n/a',
      passes: 2,
      maxImageEdge: null,
      startedAt: new Date().toISOString(),
      asOf: labels.generatedOn,
      notes: 'FABRICATED readings to smoke-test the analysis. Not a measurement. Never quote these numbers.',
      demoData: true,
    },
    items,
  };
}

/* ------------------------------- reporting ------------------------------- */

function table(rows: SweepRow[]): string {
  const head = ['thr', 'approve', 'retry', 'human', 'wrong✓', 'falseApp%', 'precision', 'missed✓%', 'outcomeAcc'];
  const lines = rows.map((r) =>
    [
      r.threshold.toFixed(2),
      pct(r.approveRate),
      pct(r.retryRate),
      pct(r.humanRate),
      String(r.wrongApprovals),
      pct(r.falseApproveRate),
      r.approvalPrecision == null ? '  n/a' : pct(r.approvalPrecision),
      pct(r.missedApproveRate),
      pct(r.outcomeAccuracy),
    ].map((c, i) => c.padStart(i === 0 ? 4 : 10)).join(' '),
  );
  return [head.map((h, i) => h.padStart(i === 0 ? 4 : 10)).join(' '), ...lines].join('\n');
}

function recommended(rows: SweepRow[]): string {
  const safe = rows.filter((r) => r.wrongApprovals === 0);
  if (safe.length === 0) return 'none: wrong approvals persist even at the highest threshold tested';
  const best = safe.reduce((a, b) => (b.approveRate > a.approveRate ? b : a));
  return `${best.threshold.toFixed(2)} (zero wrong approvals, ${pct(best.approveRate)} auto-approved, ${pct(best.humanRate)} to humans)`;
}

function main() {
  const args = process.argv.slice(2);
  const demo = args.includes('--demo');
  const file = args.find((a) => !a.startsWith('--'));

  if (!demo && !file) {
    console.error('usage: npm run benchmark -- <results.json>\n       npm run benchmark -- --demo');
    process.exit(1);
  }

  const run: BenchmarkRun = demo ? demoRun() : (JSON.parse(readFileSync(resolve(file!), 'utf8')) as BenchmarkRun);
  const name = demo ? 'demo' : basename(file!).replace(/\.json$/i, '');
  const { meta, items } = run;

  console.log('='.repeat(78));
  if (meta.demoData) console.log('!!! DEMO DATA: fabricated readings. These numbers are NOT model results. !!!');
  console.log(`device   ${meta.device} (${meta.os})`);
  console.log(`engine   ${meta.engine} · backend ${meta.backend} · passes recorded ${meta.passes} · image edge ${meta.maxImageEdge ?? 'runtime default'}`);
  console.log(`images   ${items.length} (${items.filter((i) => i.error).length} failed → fail closed) · as of ${meta.asOf}`);
  if (meta.notes) console.log(`notes    ${meta.notes}`);
  console.log('='.repeat(78));

  const acc = fieldAccuracy(items);
  if (acc) {
    console.log(`\nREADING ACCURACY on ${acc.n} legible documents (before any gate):`);
    console.log(
      `  type ${pct(acc.documentType)} · name ${pct(acc.fullName)} · address ${pct(acc.addressLine)} · city ${pct(acc.city)} · date ${pct(acc.issueDate)} · ALL FIELDS ${pct(acc.allFields)}`,
    );
  }

  const passModes: (1 | 2)[] = meta.passes === 2 ? [1, 2] : [1];
  const csv: string[] = [
    'passes,threshold,n,approveRate,retryRate,humanRate,wrongApprovals,falseApproveRate,approvalPrecision,missedApproveRate,outcomeAccuracy',
  ];
  const result: Record<string, unknown> = { meta, fieldAccuracy: acc };

  for (const p of passModes) {
    const rows = sweep(items, p, meta.asOf);
    const lat = latency(items, p);
    console.log(`\n--- ${p} read${p === 2 ? 's' : ''} per image ${'-'.repeat(50)}`);
    if (lat) {
      console.log(
        `latency: median ${(lat.medianMs / 1000).toFixed(1)}s · p90 ${(lat.p90Ms / 1000).toFixed(1)}s` +
          (lat.medianTokensPerSecond ? ` · ~${lat.medianTokensPerSecond.toFixed(1)} tok/s` : ''),
      );
    }
    console.log(table(rows));
    console.log(`lowest-risk threshold: ${recommended(rows)}`);
    const cm = confusion(items, p, meta.asOf, REPORT_THRESHOLD);
    console.log(`\nconfusion @ ${REPORT_THRESHOLD} (rows = expected, cols = gate):`);
    for (const e of ['approve', 'retry', 'human_review'] as const) {
      console.log(
        `  ${e.padEnd(13)} approve ${String(cm[e].approve).padStart(3)}  retry ${String(cm[e].retry).padStart(3)}  human ${String(cm[e].human_review).padStart(3)}`,
      );
    }
    for (const r of rows) {
      csv.push(
        [p, r.threshold, r.n, r.approveRate, r.retryRate, r.humanRate, r.wrongApprovals, r.falseApproveRate, r.approvalPrecision ?? '', r.missedApproveRate, r.outcomeAccuracy].join(','),
      );
    }
    result[`passes${p}`] = { sweep: rows, latency: lat, confusionAtReport: cm };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${name}.csv`), csv.join('\n') + '\n');
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(`\nwrote benchmark/out/${name}.csv and ${name}.json`);
}

main();

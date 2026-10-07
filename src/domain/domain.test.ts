import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { daysBetween, parseIsoDate } from './dates';
import { computeConfidence, decide, failClosedDecision } from './gate';
import { fieldSimilarity, tokenSetSimilarity } from './similarity';
import { evaluateAddress, evaluateJobPair, evaluateJobPhoto } from './validators';
import {
  DEFAULT_GATE_CONFIG,
  type AddressExpected,
  type AddressExtraction,
  type JobPhotoExtraction,
} from './types';

const NOW = new Date('2026-10-04T12:00:00Z');
const expected: AddressExpected = {
  fullName: 'John Doe',
  city: 'Springfield',
  state: 'IL',
};

const cleanDoc = (over: Partial<AddressExtraction> = {}): AddressExtraction => ({
  documentType: 'utility_bill',
  fullName: 'John Doe',
  addressLine: '123 Main Street',
  city: 'Springfield',
  state: 'IL',
  issueDate: '2026-09-12',
  issuer: 'Lumen Power Distribution',
  legibility: 'clear',
  ...over,
});

const evalAddr = (passes: AddressExtraction[]) => evaluateAddress(passes, expected, { now: NOW });

describe('similarity', () => {
  it('ignores name order', () => {
    assert.equal(tokenSetSimilarity('John Michael Doe', 'Doe John Michael'), 1);
  });
  it('accepts initials', () => {
    const s = tokenSetSimilarity('J. M. Doe', 'John Michael Doe');
    assert.ok(s > 0.9, `got ${s}`);
  });
  it('forgives a one-letter typo on a long token', () => {
    assert.ok(tokenSetSimilarity('Johnathan Doe', 'Jonathan Doe') > 0.9);
  });
  it('penalises a missing name part', () => {
    const s = tokenSetSimilarity('John Doe', 'John Michael Doe');
    assert.ok(s < 0.8, `got ${s}`);
  });
  it('rejects a different person', () => {
    assert.ok(tokenSetSimilarity('Jane Smith', 'John Doe') < 0.3);
  });
  it('handles diacritics and case', () => {
    assert.equal(tokenSetSimilarity('JOSÉ ÁLVAREZ', 'jose alvarez'), 1);
  });
  it('treats one missing value as disagreement, both missing as agreement', () => {
    assert.equal(fieldSimilarity(null, null), 1);
    assert.equal(fieldSimilarity('x', null), 0);
  });
});

describe('dates', () => {
  it('parses strict ISO dates only', () => {
    assert.ok(parseIsoDate('2026-09-12'));
    assert.equal(parseIsoDate('2026-02-31'), null);
    assert.equal(parseIsoDate('12/09/2026'), null);
    assert.equal(parseIsoDate(null), null);
  });
  it('counts whole days', () => {
    assert.equal(daysBetween(new Date('2026-09-04T00:00:00Z'), new Date('2026-10-04T23:00:00Z')), 30);
  });
});

describe('address gate', () => {
  it('approves a clean, valid document (single pass)', () => {
    const d = decide(evalAddr([cleanDoc()]));
    assert.equal(d.outcome, 'approve');
    assert.equal(d.confidence, 1);
  });

  it('approves when two passes agree', () => {
    const d = decide(evalAddr([cleanDoc(), cleanDoc()]));
    assert.equal(d.outcome, 'approve');
    assert.equal(d.agreement, 1);
  });

  it('asks for a different document when it is confidently too old', () => {
    const d = decide(evalAddr([cleanDoc({ issueDate: '2026-01-10' })]));
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /too old/i);
  });

  it('escalates a stale document once retries are exhausted', () => {
    const d = decide(evalAddr([cleanDoc({ issueDate: '2026-01-10' })]), DEFAULT_GATE_CONFIG, 2);
    assert.equal(d.outcome, 'human_review');
    assert.ok(d.reasons.some((r) => r.includes('retries exhausted')));
  });

  it('sends a name mismatch to a human even when the reading is confident', () => {
    const d = decide(evalAddr([cleanDoc({ fullName: 'Jane Doe' })]));
    assert.equal(d.outcome, 'human_review');
    assert.ok(d.confidence >= DEFAULT_GATE_CONFIG.approveThreshold);
  });

  it('asks for a retake when the capture is unreadable', () => {
    const blurry = cleanDoc({
      legibility: 'poor',
      fullName: null,
      addressLine: null,
      city: null,
      state: null,
      issueDate: null,
      issuer: null,
    });
    const d = decide(evalAddr([blurry]));
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /blurry/i);
    assert.ok(d.confidence < 0.3);
  });

  it('states blur and retries instead of escalating a name mismatch on a blurry read', () => {
    const d = decide(evalAddr([cleanDoc({ legibility: 'poor', fullName: 'Jane Doe' })]));
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /blurry/i);
    assert.doesNotMatch(d.userMessage, /name/i);
  });

  it('asks for a retake when the photo is not a document at all', () => {
    const d = decide(
      evalAddr([
        cleanDoc({
          documentType: 'not_a_document',
          fullName: null,
          addressLine: null,
          city: null,
          state: null,
          issueDate: null,
          issuer: null,
          legibility: 'clear',
        }),
      ]),
    );
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /doesn’t look like a document/i);
  });

  it('prefers blur over other failures in the user message', () => {
    const d = decide(
      evalAddr([
        cleanDoc({
          documentType: 'not_a_document',
          fullName: null,
          addressLine: null,
          city: null,
          issueDate: null,
          legibility: 'poor',
        }),
      ]),
    );
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /blurry/i);
    assert.match(d.userMessage, /better light/i);
  });

  it('retries on a future date', () => {
    const d = decide(evalAddr([cleanDoc({ issueDate: '2027-03-01' })]));
    assert.equal(d.outcome, 'retry');
  });

  it('escalates when two passes disagree on a readable capture', () => {
    const other = cleanDoc({
      fullName: 'Jane Doe',
      addressLine: '9 Oak Avenue',
      city: 'Shelbyville',
      issueDate: '2026-08-01',
    });
    const ev = evalAddr([cleanDoc(), other]);
    const d = decide(ev);
    assert.equal(d.outcome, 'human_review');
    assert.ok((d.agreement ?? 1) < 0.5);
    assert.ok(d.reasons.some((r) => r.includes('do not trust')));
  });

  it('caps confidence at the agreement between passes', () => {
    const ev = evalAddr([cleanDoc(), cleanDoc({ fullName: 'Jane Doe' })]);
    assert.ok(ev.agreement !== null);
    assert.ok(computeConfidence(ev) <= (ev.agreement as number) + 1e-9);
  });

  it('asks for a retake when the document is only partially readable', () => {
    const d = decide(evalAddr([cleanDoc({ legibility: 'partial' })]));
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /blurry/i);
    assert.match(d.userMessage, /better light/i);
  });

  it('lets the threshold flip a borderline decision on a clear capture', () => {
    // Two passes that mostly agree but disagree on one soft field — confidence
    // sits between common thresholds.
    const ev = evalAddr([
      cleanDoc(),
      cleanDoc({ issuer: 'Different Bank Plc', addressLine: '14 Admiralty Way, Lekki Phase 1' }),
    ]);
    const conf = computeConfidence(ev);
    assert.ok(conf > 0.7 && conf < 0.95, `expected mid confidence, got ${conf}`);
    const strict = decide(ev, { approveThreshold: Math.min(0.95, conf + 0.05), maxRetries: 2 });
    const lenient = decide(ev, { approveThreshold: Math.max(0.5, conf - 0.05), maxRetries: 2 });
    assert.equal(strict.outcome, 'human_review');
    assert.equal(lenient.outcome, 'approve');
  });

  it('retries are bounded', () => {
    const blurry = cleanDoc({ legibility: 'poor', fullName: null, addressLine: null, city: null, issueDate: null });
    const ev = evalAddr([blurry]);
    assert.equal(decide(ev, DEFAULT_GATE_CONFIG, 0).outcome, 'retry');
    assert.equal(decide(ev, DEFAULT_GATE_CONFIG, 1).outcome, 'retry');
    assert.equal(decide(ev, DEFAULT_GATE_CONFIG, 2).outcome, 'human_review');
  });

  it('throws on empty input', () => {
    assert.throws(() => evaluateAddress([], expected));
  });
});

describe('fail closed', () => {
  it('never approves when inference fails', () => {
    const d = failClosedDecision('out of memory');
    assert.equal(d.outcome, 'human_review');
    assert.equal(d.confidence, 0);
    assert.ok(d.reasons[0].includes('reading failed'));
  });
});

describe('job photo gate', () => {
  const shot = (over: Partial<JobPhotoExtraction> = {}): JobPhotoExtraction => ({
    category: 'electrical',
    workAppearsComplete: 'yes',
    isRealSitePhoto: true,
    photoQuality: 'clear',
    description: 'A wall socket.',
    ...over,
  });
  const broken = (over: Partial<JobPhotoExtraction> = {}) =>
    shot({
      workAppearsComplete: 'no',
      description: 'A cracked wall socket with exposed wires.',
      ...over,
    });
  const fixed = (over: Partial<JobPhotoExtraction> = {}) =>
    shot({
      workAppearsComplete: 'yes',
      description: 'A newly fitted wall socket.',
      ...over,
    });
  const expectedJob = { category: 'electrical' as const };
  const pair = (before: JobPhotoExtraction, after: JobPhotoExtraction) =>
    evaluateJobPair([before], [after], expectedJob);

  it('approves a clear before/after of the booked trade', () => {
    assert.equal(decide(pair(broken(), fixed())).outcome, 'approve');
  });
  it('asks for a retake of a blurry after photo', () => {
    const d = decide(pair(broken(), fixed({ photoQuality: 'blurry' })));
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /blurry/i);
  });
  it('sends a different after trade to a human', () => {
    const d = decide(pair(broken(), fixed({ category: 'plumbing' })));
    assert.equal(d.outcome, 'human_review');
  });
  it('sends visibly incomplete after work to a human, not a retake', () => {
    const d = decide(pair(broken(), fixed({ workAppearsComplete: 'no' })));
    assert.equal(d.outcome, 'human_review');
  });
  it('still accepts clear trade photos when the model falsely marks them not-real', () => {
    const d = decide(
      pair(broken({ isRealSitePhoto: false }), fixed({ isRealSitePhoto: false })),
    );
    assert.equal(d.outcome, 'approve');
  });

  it('asks for a fresh photo when not-real and the scene is weak', () => {
    const d = decide(
      pair(
        broken({ isRealSitePhoto: false, photoQuality: 'blurry', category: 'unclear' }),
        fixed({ isRealSitePhoto: false, photoQuality: 'blurry', category: 'unclear' }),
      ),
    );
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /site photo|blurry/i);
  });
  it('retries when before already looks finished', () => {
    const d = decide(pair(fixed(), fixed()));
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /before/i);
  });
  it('retries when before and after look like different trades', () => {
    const d = decide(pair(broken({ category: 'plumbing' }), fixed()));
    assert.equal(d.outcome, 'retry');
    assert.match(d.userMessage, /same job/i);
  });
  it('single-photo helper still approves a finished after shot', () => {
    assert.equal(decide(evaluateJobPhoto([fixed()], expectedJob)).outcome, 'approve');
  });
});

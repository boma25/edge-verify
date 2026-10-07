import { addressAgreement, jobPhotoAgreement } from './agreement';
import { daysBetween, parseIsoDate } from './dates';
import { fieldSimilarity } from './similarity';
import type {
  AddressDocType,
  AddressExpected,
  AddressExtraction,
  ConfidenceSignal,
  Evaluation,
  JobPhotoExpected,
  JobPhotoExtraction,
  RuleResult,
} from './types';

const ACCEPTED_DOC_TYPES: AddressDocType[] = [
  'utility_bill',
  'bank_statement',
  'tenancy_agreement',
  'government_letter',
];

const NAME_MATCH_MIN = 0.8;
const LOCATION_MATCH_MIN = 0.8;

export interface AddressEvalOptions {
  /** Injected for deterministic tests. */
  now?: Date;
  /** Documents older than this are rejected. */
  maxDocAgeDays?: number;
}

const fmt = (n: number) => n.toFixed(2);

/* ------------------------------------------------------------------ */
/* Proof of address                                                    */
/* ------------------------------------------------------------------ */

/**
 * Rules are evaluated on the FIRST pass. Disagreement between passes does not
 * change the rules – it lowers the confidence signals instead, which is what
 * pushes the case towards a retry or a human.
 */
export function evaluateAddress(
  passes: AddressExtraction[],
  expected: AddressExpected,
  options: AddressEvalOptions = {},
): Evaluation {
  if (passes.length === 0) throw new Error('evaluateAddress needs at least one pass');
  const p = passes[0];
  const now = options.now ?? new Date();
  const maxAge = options.maxDocAgeDays ?? 90;

  const rules: RuleResult[] = [];

  // 1. Accepted document type
  const typeOk = ACCEPTED_DOC_TYPES.includes(p.documentType);
  rules.push({
    id: 'doc_type',
    label: 'Accepted document type',
    passed: typeOk,
    fixableByUser: true,
    detail: `read as "${p.documentType}"`,
    userMessage: typeOk
      ? undefined
      : p.documentType === 'not_a_document'
        ? 'This doesn’t look like a document. Photograph a utility bill, bank statement, or official letter.'
        : 'This document type isn’t accepted. Use a utility bill, bank statement, tenancy agreement, or government letter.',
  });

  // 2. Name matches the account holder
  if (p.fullName == null) {
    rules.push({
      id: 'name_match',
      label: 'Name matches account',
      passed: false,
      fixableByUser: true,
      detail: 'no name could be read',
      userMessage: 'Name isn’t readable. Retake so the full name is sharp and in frame.',
    });
  } else {
    const sim = fieldSimilarity(expected.fullName, p.fullName);
    const nameOk = sim >= NAME_MATCH_MIN;
    rules.push({
      id: 'name_match',
      label: 'Name matches account',
      passed: nameOk,
      // A different name is a judgement call (spouse, maiden name, company
      // bill) – that is exactly what a human reviewer is for.
      fixableByUser: false,
      detail: `similarity ${fmt(sim)} ("${p.fullName}" vs "${expected.fullName}")`,
      userMessage: nameOk
        ? undefined
        : 'Name doesn’t match the account. Use a document in the account holder’s name.',
    });
  }

  // 3. Address is present
  const addressOk = p.addressLine != null && p.city != null;
  rules.push({
    id: 'address_present',
    label: 'Address visible',
    passed: addressOk,
    fixableByUser: true,
    detail: addressOk ? 'street and city read' : 'street or city missing',
    userMessage: addressOk
      ? undefined
      : 'Address isn’t readable. Retake so street and city are sharp and in frame.',
  });

  // 4. Location matches what the user told us (only when readable)
  if (p.city != null) {
    const citySim = fieldSimilarity(expected.city, p.city);
    const stateSim =
      expected.state && p.state ? fieldSimilarity(expected.state, p.state) : 1;
    const sim = Math.min(citySim, stateSim);
    const locOk = sim >= LOCATION_MATCH_MIN;
    rules.push({
      id: 'location_match',
      label: 'City / state matches',
      passed: locOk,
      fixableByUser: false,
      detail: `similarity ${fmt(sim)} ("${p.city}${p.state ? ', ' + p.state : ''}")`,
      userMessage: locOk
        ? undefined
        : 'Address doesn’t match what you entered. Use a document for that address, or update your details.',
    });
  }

  // 5. Recent, not in the future
  const issued = parseIsoDate(p.issueDate);
  if (issued == null) {
    rules.push({
      id: 'issue_date',
      label: `Dated within ${maxAge} days`,
      passed: false,
      fixableByUser: true,
      detail: p.issueDate ? `unparseable date "${p.issueDate}"` : 'no date could be read',
      userMessage: 'Date isn’t readable. Retake so the issue date is clear.',
    });
  } else {
    const age = daysBetween(issued, now);
    if (age < -1) {
      rules.push({
        id: 'issue_date',
        label: `Dated within ${maxAge} days`,
        passed: false,
        fixableByUser: true,
        detail: `date is ${-age} days in the future`,
        userMessage:
          'Document date looks wrong. Check the date and retake if it was a glare or crop issue.',
      });
    } else {
      const recent = age <= maxAge;
      rules.push({
        id: 'issue_date',
        label: `Dated within ${maxAge} days`,
        passed: recent,
        fixableByUser: true,
        detail: `${age} days old`,
        userMessage: recent
          ? undefined
          : `Document is too old. Upload one issued within the last ${maxAge} days.`,
      });
    }
  }

  // 6. Document must be clear enough to trust the reading
  const clearDoc = p.legibility === 'clear';
  rules.push({
    id: 'legibility',
    label: 'Document is clear',
    passed: clearDoc,
    fixableByUser: true,
    detail: `legibility: ${p.legibility}`,
    userMessage: clearDoc
      ? undefined
      : 'Document is blurry. Retake in better light, hold steady, and fill the frame.',
  });

  // ---- Confidence signals: "do we trust this reading?" ----
  const signals: ConfidenceSignal[] = [];

  const legibilityValue = { clear: 1, partial: 0.6, poor: 0.2 }[p.legibility];
  signals.push({ id: 'legibility', label: 'Legibility (model-reported)', value: legibilityValue, weight: 3 });

  const fieldsPresent = [p.fullName, p.addressLine, p.city, p.issueDate, p.issuer].filter(
    (v) => v != null,
  ).length;
  const completeness =
    p.documentType === 'not_a_document' ? 0 : fieldsPresent / 5;
  signals.push({ id: 'completeness', label: 'Fields read', value: completeness, weight: 2 });

  const plausibility: number[] = [];
  if (p.issueDate != null) {
    const d = parseIsoDate(p.issueDate);
    plausibility.push(d && d.getUTCFullYear() >= 2000 ? 1 : 0);
  }
  if (p.fullName != null) {
    const tokens = p.fullName.trim().split(/\s+/);
    const looksLikeName =
      tokens.length >= 2 && /^[\p{L}\s.'-]+$/u.test(p.fullName) && tokens.every((t) => t.length >= 1);
    plausibility.push(looksLikeName ? 1 : 0.3);
  }
  if (p.addressLine != null) {
    plausibility.push(/\d/.test(p.addressLine) || p.addressLine.trim().split(/\s+/).length >= 3 ? 1 : 0.5);
  }
  signals.push({
    id: 'plausibility',
    label: 'Values look well-formed',
    value: plausibility.length === 0 ? 0.5 : plausibility.reduce((s, v) => s + v, 0) / plausibility.length,
    weight: 1,
  });

  const agreement = addressAgreement(passes);
  if (agreement != null) {
    signals.push({ id: 'agreement', label: 'Agreement between passes', value: agreement, weight: 4 });
  }

  const captureIssue =
    p.legibility !== 'clear' ||
    p.documentType === 'not_a_document' ||
    p.fullName == null ||
    p.addressLine == null ||
    p.city == null ||
    p.issueDate == null;

  return { kind: 'address', rules, signals, captureIssue, agreement };
}

/* ------------------------------------------------------------------ */
/* Completed-job photo (before + after pair)                           */
/* ------------------------------------------------------------------ */

const qualityValue = (q: JobPhotoExtraction['photoQuality']) =>
  ({ clear: 1, blurry: 0.3, dark: 0.4 })[q];

/**
 * Single-photo evaluation kept for tests and any after-only callers.
 * Production job verify uses {@link evaluateJobPair}.
 */
export function evaluateJobPhoto(
  passes: JobPhotoExtraction[],
  expected: JobPhotoExpected,
): Evaluation {
  if (passes.length === 0) throw new Error('evaluateJobPhoto needs at least one pass');
  const after = passes[0];
  // Synthetic "before": same trade, visibly not done — so pair rules reduce to after checks.
  const before: JobPhotoExtraction = {
    category: expected.category,
    workAppearsComplete: 'no',
    isRealSitePhoto: true,
    photoQuality: 'clear',
    description: 'Prior state (single-photo mode)',
  };
  return evaluateJobPair([before], passes, expected);
}

/**
 * Before = broken / incomplete · After = fixed. Two independent extractions;
 * rules require the after to look finished and the before to look like there
 * was something to fix, ideally the same trade.
 */
export function evaluateJobPair(
  beforePasses: JobPhotoExtraction[],
  afterPasses: JobPhotoExtraction[],
  expected: JobPhotoExpected,
): Evaluation {
  if (beforePasses.length === 0) throw new Error('evaluateJobPair needs a before pass');
  if (afterPasses.length === 0) throw new Error('evaluateJobPair needs an after pass');
  const before = beforePasses[0];
  const after = afterPasses[0];
  const rules: RuleResult[] = [];

  // Small VLMs often mark plain indoor fixture photos as not-real. Only fail when
  // the model flags fake AND the scene is also weak (unclear trade or bad quality).
  const modelSaysReal = before.isRealSitePhoto && after.isRealSitePhoto;
  const sceneLooksUsable =
    before.photoQuality === 'clear' &&
    after.photoQuality === 'clear' &&
    before.category !== 'unclear' &&
    after.category !== 'unclear';
  const realOk = modelSaysReal || sceneLooksUsable;
  rules.push({
    id: 'real_photo',
    label: 'Real site photos',
    passed: realOk,
    fixableByUser: true,
    detail: `before real=${before.isRealSitePhoto}, after real=${after.isRealSitePhoto}${
      !modelSaysReal && sceneLooksUsable ? ' (accepted: clear usable scene)' : ''
    }`,
    userMessage: realOk
      ? undefined
      : 'This doesn’t look like a real site photo. Take photos at the job location, not screenshots or stock images.',
  });

  const afterClear = after.photoQuality === 'clear';
  const beforeClear = before.photoQuality === 'clear';
  const qualityOk = afterClear && beforeClear;
  rules.push({
    id: 'photo_quality',
    label: 'Photos are clear',
    passed: qualityOk,
    fixableByUser: true,
    detail: `before=${before.photoQuality}, after=${after.photoQuality}`,
    userMessage: qualityOk
      ? undefined
      : !afterClear
        ? after.photoQuality === 'dark'
          ? 'After photo is too dark. Retake in brighter light or turn on the flash.'
          : 'After photo is blurry. Retake in better light and hold the phone steady.'
        : before.photoQuality === 'dark'
          ? 'Before photo is too dark. Retake in brighter light or turn on the flash.'
          : 'Before photo is blurry. Retake in better light and hold the phone steady.',
  });

  const afterCat = after.category === expected.category;
  rules.push({
    id: 'category_match',
    label: 'After shows the booked trade',
    passed: afterCat,
    fixableByUser: after.category === 'unclear',
    detail: `after="${after.category}", booked="${expected.category}"`,
    userMessage: afterCat
      ? undefined
      : after.category === 'unclear'
        ? 'Can’t tell the trade from the after photo. Step back so the finished work fills the frame.'
        : 'After photo shows a different trade than booked. Photograph the work for this job.',
  });

  const beforeKnown = before.category !== 'unclear';
  const afterKnown = after.category !== 'unclear';
  const sameTrade =
    beforeKnown && afterKnown ? before.category === after.category : afterCat && before.category === expected.category;
  rules.push({
    id: 'same_trade',
    label: 'Before and after look like the same trade',
    passed: sameTrade,
    fixableByUser: true,
    detail: `before="${before.category}", after="${after.category}"`,
    userMessage: sameTrade
      ? undefined
      : 'Before and after don’t look like the same job. Retake both of the same repair.',
  });

  const beforeNeedsWork = before.workAppearsComplete !== 'yes';
  rules.push({
    id: 'before_needs_work',
    label: 'Before shows work still needed',
    passed: beforeNeedsWork,
    fixableByUser: true,
    detail: `before complete=${before.workAppearsComplete}`,
    userMessage: beforeNeedsWork
      ? undefined
      : 'Before photo already looks finished. Use a photo of the broken or incomplete state.',
  });

  const afterDone = after.workAppearsComplete === 'yes';
  rules.push({
    id: 'work_complete',
    label: 'After shows work complete',
    passed: afterDone,
    fixableByUser: after.workAppearsComplete === 'cannot_tell',
    detail: `after complete=${after.workAppearsComplete}`,
    userMessage: afterDone
      ? undefined
      : after.workAppearsComplete === 'cannot_tell'
        ? 'Can’t tell if the work is finished. Retake the after photo showing the completed result clearly.'
        : 'After photo still looks incomplete. Photograph again when the job is fully done.',
  });

  const signals: ConfidenceSignal[] = [];
  signals.push({
    id: 'photo_quality',
    label: 'Photo quality (both)',
    value: (qualityValue(before.photoQuality) + qualityValue(after.photoQuality)) / 2,
    weight: 3,
  });
  signals.push({
    id: 'decisiveness',
    label: 'Model could classify both scenes',
    value:
      ((before.category === 'unclear' ? 0 : 0.25) +
        (after.category === 'unclear' ? 0 : 0.25) +
        (before.workAppearsComplete === 'cannot_tell' ? 0 : 0.25) +
        (after.workAppearsComplete === 'cannot_tell' ? 0 : 0.25)),
    weight: 2,
  });
  signals.push({
    id: 'repair_delta',
    label: 'Before incomplete → after complete',
    value: beforeNeedsWork && afterDone ? 1 : beforeNeedsWork || afterDone ? 0.45 : 0.15,
    weight: 2,
  });

  const beforeAgree = jobPhotoAgreement(beforePasses);
  const afterAgree = jobPhotoAgreement(afterPasses);
  const agreement =
    beforeAgree != null && afterAgree != null
      ? (beforeAgree + afterAgree) / 2
      : (afterAgree ?? beforeAgree);
  if (agreement != null) {
    signals.push({ id: 'agreement', label: 'Agreement between passes', value: agreement, weight: 4 });
  }

  const captureIssue =
    !qualityOk ||
    !realOk ||
    before.category === 'unclear' ||
    after.category === 'unclear' ||
    before.workAppearsComplete === 'cannot_tell' ||
    after.workAppearsComplete === 'cannot_tell' ||
    !beforeNeedsWork;

  return { kind: 'job_photo', rules, signals, captureIssue, agreement: agreement ?? null };
}

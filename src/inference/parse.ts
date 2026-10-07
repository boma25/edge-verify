import type {
  AddressDocType,
  AddressExtraction,
  JobCategory,
  JobPhotoExtraction,
  Legibility,
  PhotoQuality,
} from '../domain/types';

/**
 * Constrained decoding already guarantees valid JSON in the right shape, but
 * the VALUES can still be junk ("N/A", "", wrong casing). This layer is the
 * second line of defence and keeps the domain code free of string cleanup.
 */

export class ExtractionParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'ExtractionParseError';
  }
}

const NULLISH = new Set(['', 'null', 'none', 'n/a', 'na', 'unknown', 'not visible', 'unreadable']);

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return NULLISH.has(t.toLowerCase()) ? null : t;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof v !== 'string') return fallback;
  const norm = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (allowed as readonly string[]).includes(norm) ? (norm as T) : fallback;
}

function parseObject(raw: string): Record<string, unknown> {
  // Models occasionally wrap JSON in a code fence even when told not to.
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(stripped);
  } catch {
    throw new ExtractionParseError('model output is not valid JSON', raw);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ExtractionParseError('model output is not a JSON object', raw);
  }
  return value as Record<string, unknown>;
}

const DOC_TYPES: readonly AddressDocType[] = [
  'utility_bill',
  'bank_statement',
  'tenancy_agreement',
  'government_letter',
  'other',
  'not_a_document',
];
const LEGIBILITY: readonly Legibility[] = ['clear', 'partial', 'poor'];

export function parseAddressExtraction(raw: string): AddressExtraction {
  const o = parseObject(raw);
  return {
    documentType: oneOf(o.documentType, DOC_TYPES, 'other'),
    fullName: cleanString(o.fullName),
    addressLine: cleanString(o.addressLine),
    city: cleanString(o.city),
    state: cleanString(o.state),
    issueDate: cleanString(o.issueDate),
    issuer: cleanString(o.issuer),
    // If the model can't even report legibility, assume the worst.
    legibility: oneOf(o.legibility, LEGIBILITY, 'poor'),
  };
}

const CATEGORIES: readonly JobCategory[] = [
  'plumbing',
  'electrical',
  'carpentry',
  'painting',
  'tiling',
  'hvac',
  'cleaning',
  'other',
  'unclear',
];
const COMPLETE = ['yes', 'partial', 'no', 'cannot_tell'] as const;
const QUALITY: readonly PhotoQuality[] = ['clear', 'blurry', 'dark'];

export function parseJobPhotoExtraction(raw: string): JobPhotoExtraction {
  const o = parseObject(raw);
  return {
    category: oneOf(o.category, CATEGORIES, 'unclear'),
    workAppearsComplete: oneOf(o.workAppearsComplete, COMPLETE, 'cannot_tell'),
    // Only an explicit `true` counts as a real photo.
    isRealSitePhoto: o.isRealSitePhoto === true,
    photoQuality: oneOf(o.photoQuality, QUALITY, 'blurry'),
    description: cleanString(o.description) ?? '',
  };
}

import type { AddressExtraction, JobPhotoExtraction } from '../domain/types';

/** One-line reading for the result UI. */
export function summarizeAddress(p: AddressExtraction): string {
  return `${p.documentType} · ${p.fullName ?? '—'} · ${p.addressLine ?? '—'}, ${p.city ?? '—'} · ${p.issueDate ?? 'no date'}`;
}

export function summarizeJob(p: JobPhotoExtraction): string {
  return `${p.category} · complete: ${p.workAppearsComplete} · ${p.photoQuality} · ${p.description}`;
}

export function summarizeJobPair(before: JobPhotoExtraction, after: JobPhotoExtraction): string {
  return `before: ${summarizeJob(before)} · after: ${summarizeJob(after)}`;
}

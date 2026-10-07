import type { AddressExtraction, JobPhotoExtraction } from './types';
import { fieldSimilarity } from './similarity';

function mean(values: number[]): number {
  return values.length === 0 ? 1 : values.reduce((s, v) => s + v, 0) / values.length;
}

function meanPairwise<T>(items: T[], pairScore: (a: T, b: T) => number): number | null {
  if (items.length < 2) return null;
  const scores: number[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      scores.push(pairScore(items[i], items[j]));
    }
  }
  return mean(scores);
}

function exact<T>(a: T, b: T): number {
  return a === b ? 1 : 0;
}

function addressPair(a: AddressExtraction, b: AddressExtraction): number {
  const scores: number[] = [exact(a.documentType, b.documentType)];
  const textFields: (keyof AddressExtraction)[] = ['fullName', 'addressLine', 'city'];
  for (const f of textFields) {
    const va = a[f] as string | null;
    const vb = b[f] as string | null;
    if (va == null && vb == null) continue; // nothing to compare
    scores.push(fieldSimilarity(va, vb));
  }
  if (a.issueDate != null || b.issueDate != null) {
    scores.push(exact(a.issueDate, b.issueDate));
  }
  return mean(scores);
}

function jobPair(a: JobPhotoExtraction, b: JobPhotoExtraction): number {
  return mean([
    exact(a.category, b.category),
    exact(a.workAppearsComplete, b.workAppearsComplete),
    exact(a.isRealSitePhoto, b.isRealSitePhoto),
    exact(a.photoQuality, b.photoQuality),
  ]);
}

/**
 * Self-consistency across independent passes (different prompts, same image).
 * Returns null when only one pass exists – there is nothing to compare.
 */
export function addressAgreement(passes: AddressExtraction[]): number | null {
  return meanPairwise(passes, addressPair);
}

export function jobPhotoAgreement(passes: JobPhotoExtraction[]): number | null {
  return meanPairwise(passes, jobPair);
}

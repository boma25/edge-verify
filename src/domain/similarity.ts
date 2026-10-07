/**
 * Small, dependency-free text matching helpers.
 *
 * Names on real documents vary a lot: order ("Doe John" vs "John Doe"),
 * initials ("J. Doe"), diacritics, casing and OCR-style typos. Matching is
 * therefore token-based and forgiving about order, but strict about content.
 */

export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity of two single tokens, 0..1. */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  // Initial vs full token: "s" matches "samuel".
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) {
    return 0.9;
  }
  const maxLen = Math.max(a.length, b.length);
  const ratio = 1 - levenshtein(a, b) / maxLen;
  // Short tokens must be exact; typos are only forgiven on longer ones.
  if (maxLen < 4) return 0;
  return ratio >= 0.75 ? ratio : 0;
}

/**
 * Order-insensitive similarity of two phrases, 0..1.
 * Greedy best-match of tokens, divided by the larger token count so that a
 * missing name part (e.g. no middle name) lowers the score instead of being
 * ignored.
 */
export function tokenSetSimilarity(a: string, b: string): number {
  const ta = normalizeText(a).split(' ').filter(Boolean);
  const tb = normalizeText(b).split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;

  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Set<number>();
  let total = 0;

  for (const s of short) {
    let best = 0;
    let bestIdx = -1;
    long.forEach((l, idx) => {
      if (used.has(idx)) return;
      const sim = tokenSimilarity(s, l);
      if (sim > best) {
        best = sim;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) {
      used.add(bestIdx);
      total += best;
    }
  }
  return total / long.length;
}

/** Null-aware similarity: both missing counts as agreement, one missing does not. */
export function fieldSimilarity(a: string | null, b: string | null): number {
  if (a == null && b == null) return 1;
  if (a == null || b == null) return 0;
  return tokenSetSimilarity(a, b);
}

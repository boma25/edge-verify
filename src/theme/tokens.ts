import { Platform } from 'react-native';

import type { Outcome } from '../domain/types';

/**
 * Brand violet is for titles and primary actions.
 * green / amber / coral are reserved for gate outcomes and never used for
 * decoration, so the audience learns what each colour means.
 */
export const colors = {
  ink: '#14111F',
  surface: '#1D1930',
  surfaceHigh: '#272240',
  border: '#34304D',
  text: '#F4F1FA',
  textMuted: '#A9A3C2',

  brand: '#6A4FF3',
  /** Lighter violet for small text on dark backgrounds (8:1 contrast on ink). */
  brandSoft: '#A99BFF',

  approve: '#3DDC97',
  retry: '#FFB84D',
  review: '#FF6B7A',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const fonts = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
} as const;

/** Colour is never the only signal: every outcome also has a glyph and a label. */
export const outcomeStyle: Record<
  Outcome,
  { color: string; glyph: string; label: string; short: string }
> = {
  approve: { color: colors.approve, glyph: '✓', label: 'Auto-approved', short: 'APPROVE' },
  retry: { color: colors.retry, glyph: '↻', label: 'Retake needed', short: 'RETRY' },
  human_review: { color: colors.review, glyph: '◆', label: 'Needs a person', short: 'HUMAN' },
};

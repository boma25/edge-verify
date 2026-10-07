import { StyleSheet } from 'react-native';

import { colors, fonts, radius, spacing } from '../../theme/tokens';

export const verifyStyles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 13 },
  mono: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 12 },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    fontSize: 15,
  },
  preview: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  settingTitle: { color: colors.text, fontSize: 15 },
  row: { flexDirection: 'row', gap: spacing.sm },
});

import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../theme/tokens';

export function AppHeader() {
  return (
    <View style={s.header}>
      <View style={s.mark} accessibilityLabel="Edge Verify">
        <Text style={s.markGlyph}>EV</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.appName}>Edge Verify</Text>
        <Text style={s.tagline}>Decide on the phone. Escalate only when unsure.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markGlyph: { color: colors.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  appName: { color: colors.text, fontSize: 22, fontWeight: '700' },
  tagline: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.mono },
});

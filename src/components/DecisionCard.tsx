import { StyleSheet, Text, View } from 'react-native';

import type { GateDecision, InferenceTimings } from '../domain/types';
import { colors, fonts, outcomeStyle, radius, spacing } from '../theme/tokens';
import { Card } from '../theme/ui';

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function DecisionCard({
  decision,
  timings,
  engineLabel,
}: {
  decision: GateDecision;
  threshold?: number;
  timings?: InferenceTimings;
  engineLabel: string;
}) {
  const o = outcomeStyle[decision.outcome];
  const detail =
    decision.outcome !== 'approve' && decision.userMessage.trim().length > 0
      ? decision.userMessage.trim()
      : null;

  return (
    <Card>
      <View style={[s.banner, { borderColor: o.color }]}>
        <Text style={[s.glyph, { color: o.color }]} accessibilityElementsHidden>
          {o.glyph}
        </Text>
        <Text style={[s.outcome, { color: o.color, flex: 1 }]}>{o.label}</Text>
      </View>

      {detail && <Text style={s.detail}>{detail}</Text>}

      {timings && (
        <Text style={s.footer}>
          {engineLabel} · {seconds(timings.totalMs)}
        </Text>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceHigh,
  },
  glyph: { fontSize: 20, fontWeight: '700', width: 28, textAlign: 'center' },
  outcome: { fontSize: 15, fontWeight: '700' },
  detail: { color: colors.text, fontSize: 15, lineHeight: 22 },
  footer: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 11 },
});

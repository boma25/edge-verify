import { StyleSheet, Text } from 'react-native';

import { pct, type FieldAccuracy, type SweepRow } from '../../benchmark/analysis';
import { colors, fonts } from '../../theme/tokens';
import { Card, Label } from '../../theme/ui';

export function BenchmarkSummary({
  count,
  failed,
  acc,
  rows,
}: {
  count: number;
  failed: number;
  acc: FieldAccuracy | null;
  rows: SweepRow[];
}) {
  return (
    <Card>
      <Label>
        Live summary · {count} done{failed ? ` · ${failed} failed (fail closed)` : ''}
      </Label>
      {acc && (
        <Text style={s.mono}>
          reading accuracy (legible docs, n={acc.n}): all fields {pct(acc.allFields)}
        </Text>
      )}
      <Text style={s.mono}>threshold · approve · human · WRONG approvals</Text>
      {rows.map((r) => (
        <Text key={r.threshold} style={[s.mono, r.wrongApprovals > 0 && { color: colors.review }]}>
          {r.threshold.toFixed(2)} · {pct(r.approveRate)} · {pct(r.humanRate)} · {r.wrongApprovals}
        </Text>
      ))}
      <Text style={s.hint}>Full analysis: npm run benchmark -- results.json</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 12 },
  mono: { color: colors.text, fontFamily: fonts.mono, fontSize: 12 },
});

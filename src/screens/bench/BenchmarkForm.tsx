import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing } from '../../theme/tokens';
import { Button, Card, Chip, Label } from '../../theme/ui';
import type { Edge } from './useBenchmarkScreen';

export function BenchmarkForm({
  total,
  ready,
  passes,
  onPasses,
  edge,
  onEdge,
  notes,
  onNotes,
  running,
  done,
  canExport,
  onRun,
  onStop,
  onExport,
}: {
  total: number;
  ready: boolean;
  passes: '1' | '2';
  onPasses: (v: '1' | '2') => void;
  edge: Edge;
  onEdge: (v: Edge) => void;
  notes: string;
  onNotes: (v: string) => void;
  running: boolean;
  done: number;
  canExport: boolean;
  onRun: () => void;
  onStop: () => void;
  onExport: () => void;
}) {
  return (
    <Card>
      <Label>Benchmark · {total} synthetic documents</Label>
      <Text style={s.body}>
        Records raw readings per image. Decisions are re-made at every threshold afterwards, so one
        run gives the whole accuracy-vs-human-load curve.
      </Text>
      {!ready && <Text style={s.warn}>Load the engine first (Verify tab).</Text>}

      <Label>Reads per image</Label>
      <Chip
        value={passes}
        onChange={onPasses}
        options={[
          { value: '1', label: '1 read' },
          { value: '2', label: '2 reads' },
        ]}
      />

      <Label>Image long edge</Label>
      <Chip
        value={edge}
        onChange={onEdge}
        options={[
          { value: 'default', label: 'runtime (1024)' },
          { value: '768', label: '768' },
          { value: '512', label: '512' },
        ]}
      />

      <Text style={s.hint}>Note the battery %, thermal state and room in your notes when you export.</Text>

      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Button
            title={running ? `Running ${done}/${total}` : 'Run benchmark'}
            onPress={onRun}
            disabled={!ready || running}
          />
        </View>
        {running && <Button title="Stop" variant="secondary" onPress={onStop} />}
      </View>

      <Button
        title="Export results (share JSON)"
        variant="secondary"
        onPress={onExport}
        disabled={!canExport}
      />

      <TextInput
        value={notes}
        onChangeText={onNotes}
        placeholder="notes: battery 80%, cool room, plugged out…"
        placeholderTextColor={colors.textMuted}
        style={s.input}
      />
    </Card>
  );
}

const s = StyleSheet.create({
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.textMuted, fontSize: 12 },
  warn: { color: colors.retry, fontSize: 13 },
  row: { flexDirection: 'row', gap: spacing.md },
  input: {
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    backgroundColor: colors.surfaceHigh,
  },
});

import { ScrollView, StyleSheet } from 'react-native';

import type { UseEngine } from '../state/useEngine';
import { spacing } from '../theme/tokens';
import { BenchmarkForm } from './bench/BenchmarkForm';
import { BenchmarkSummary } from './bench/BenchmarkSummary';
import { useBenchmarkScreen } from './bench/useBenchmarkScreen';

/**
 * Records raw readings. Decisions are re-made offline:
 * npm run benchmark -- results.json
 */
export function BenchmarkScreen({ engine }: { engine: UseEngine }) {
  const m = useBenchmarkScreen(engine);

  return (
    <ScrollView contentContainerStyle={s.pad}>
      <BenchmarkForm
        total={m.total}
        ready={m.ready}
        passes={m.passes}
        onPasses={m.setPasses}
        edge={m.edge}
        onEdge={m.setEdge}
        notes={m.notes}
        onNotes={m.setNotes}
        running={m.running}
        done={m.done}
        canExport={!m.running && m.items.length > 0}
        onRun={m.run}
        onStop={m.stop}
        onExport={m.exportJson}
      />

      {m.summary && (
        <BenchmarkSummary
          count={m.items.length}
          failed={m.failed}
          acc={m.summary.acc}
          rows={m.summary.rows}
        />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pad: { padding: spacing.lg, gap: spacing.lg },
});

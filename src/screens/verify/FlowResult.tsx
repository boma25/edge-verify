import { View } from 'react-native';

import { DecisionCard } from '../../components/DecisionCard';
import type { GateDecision, InferenceTimings } from '../../domain/types';
import { Button } from '../../theme/ui';

export function FlowResult({
  decision,
  timings,
  engineLabel,
  onRetry,
  onDone,
}: {
  decision: GateDecision;
  threshold: number;
  timings?: InferenceTimings;
  engineLabel: string;
  onRetry: () => void;
  onDone: () => void;
}) {
  const needsPerson = decision.outcome === 'human_review';
  const approved = decision.outcome === 'approve';

  return (
    <View style={{ gap: 16 }}>
      <DecisionCard decision={decision} timings={timings} engineLabel={engineLabel} />

      {!approved && <Button title="Retake" onPress={onRetry} />}
      <Button
        title={needsPerson ? 'Confirm' : 'Done'}
        variant="secondary"
        onPress={onDone}
      />
    </View>
  );
}

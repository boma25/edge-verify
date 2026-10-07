import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { UseEngine } from '../state/useEngine';
import { colors, radius, spacing } from '../theme/tokens';
import { AddressFlowModal } from './verify/AddressFlowModal';
import { DevicePanel } from './verify/DevicePanel';
import { JobFlowModal } from './verify/JobFlowModal';
import { verifyStyles as s } from './verify/styles';

/** Home: device setup, then start a verification modal. */
export function VerifyScreen({ engine }: { engine: UseEngine }) {
  const ready = engine.status.phase === 'ready';
  const [addressOpen, setAddressOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);

  return (
    <>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <DevicePanel engine={engine} />

        <Text style={home.section}>
          {ready ? 'Start a demo' : 'Load the engine to unlock flows'}
        </Text>

        <Pressable
          style={[home.tile, !ready && home.tileDisabled]}
          disabled={!ready}
          onPress={() => setAddressOpen(true)}
        >
          <Text style={home.tileEyebrow}>Proof of address</Text>
          <Text style={home.tileBody}>Person → your photo → on-device decision</Text>
        </Pressable>

        <Pressable
          style={[home.tile, !ready && home.tileDisabled]}
          disabled={!ready}
          onPress={() => setJobOpen(true)}
        >
          <Text style={home.tileEyebrow}>Completed job</Text>
          <Text style={home.tileBody}>Trade → photo → decision</Text>
        </Pressable>
      </ScrollView>

      <AddressFlowModal
        visible={addressOpen}
        engine={engine}
        onClose={() => setAddressOpen(false)}
      />
      <JobFlowModal visible={jobOpen} engine={engine} onClose={() => setJobOpen(false)} />
    </>
  );
}

const home = StyleSheet.create({
  section: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  tileDisabled: { opacity: 0.4 },
  tileEyebrow: { color: colors.text, fontSize: 18, fontWeight: '700' },
  tileBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});

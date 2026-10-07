import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { UseEngine } from '../../state/useEngine';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import { Button, Chip, Label } from '../../theme/ui';
import { FlowResult } from './FlowResult';
import { useJobFlow, type JobSlot } from './useJobFlow';

function PhotoSlot({
  title,
  uri,
  onCamera,
  onLibrary,
}: {
  title: string;
  uri: string | null;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  return (
    <View style={s.slot}>
      <Label>{title}</Label>
      {uri ? (
        <Image source={{ uri }} style={s.preview} resizeMode="contain" />
      ) : (
        <View style={[s.preview, s.empty]}>
          <Text style={s.hint}>No photo yet</Text>
        </View>
      )}
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Button title="Take photo" variant="secondary" onPress={onCamera} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Choose" variant="secondary" onPress={onLibrary} />
        </View>
      </View>
    </View>
  );
}

export function JobFlowModal({
  visible,
  engine,
  onClose,
}: {
  visible: boolean;
  engine: UseEngine;
  onClose: () => void;
}) {
  const m = useJobFlow(engine, onClose);

  const pick = (slot: JobSlot, source: 'camera' | 'library') => () => void m.pick(slot, source);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={m.back}>
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Pressable onPress={m.back} hitSlop={12}>
            <Text style={s.back}>{m.step === 'trade' ? 'Close' : 'Back'}</Text>
          </Pressable>
          <Text style={s.title}>Completed job</Text>
          <Text style={s.step}>
            {m.step === 'trade' && '1 · Trade'}
            {m.step === 'photos' && '2 · Before & after'}
            {(m.step === 'running' || m.step === 'result') && '3 · Decision'}
          </Text>
        </View>

        <ScrollView contentContainerStyle={s.content}>
          {m.step === 'trade' && (
            <>
              <Text style={s.lead}>Which trade was booked?</Text>
              <Chip value={m.trade} onChange={m.setTrade} options={m.trades} />
              <Button title="Continue" onPress={m.confirmTrade} />
            </>
          )}

          {m.step === 'photos' && (
            <>
              <Label>{m.trade}</Label>
              <Text style={s.lead}>Photo of the fault, then the fix.</Text>
              <PhotoSlot
                title="Before"
                uri={m.beforeUri}
                onCamera={pick('before', 'camera')}
                onLibrary={pick('before', 'library')}
              />
              <PhotoSlot
                title="After"
                uri={m.afterUri}
                onCamera={pick('after', 'camera')}
                onLibrary={pick('after', 'library')}
              />
              <Button
                title="Verify on device"
                onPress={() => void m.verify()}
                disabled={!m.canVerify}
              />
            </>
          )}

          {m.step === 'running' && (
            <View style={s.center}>
              <ActivityIndicator size="large" color={colors.brandSoft} />
              <Text style={s.lead}>Comparing before & after on this device…</Text>
            </View>
          )}

          {m.step === 'result' && m.decision && m.result && (
            <FlowResult
              decision={m.decision}
              threshold={m.threshold}
              timings={m.result.timings}
              engineLabel={engine.engine.label}
              onRetry={m.tryAnother}
              onDone={m.onClose}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  back: { color: colors.brandSoft, fontSize: 16, fontWeight: '600' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  step: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 12 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  lead: { color: colors.textMuted, fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 13 },
  slot: { gap: spacing.sm },
  preview: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  empty: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm },
  center: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xxl },
});

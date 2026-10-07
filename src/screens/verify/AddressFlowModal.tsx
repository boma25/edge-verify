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
import { Button, Label } from '../../theme/ui';
import { FlowResult } from './FlowResult';
import { useAddressFlow } from './useAddressFlow';

export function AddressFlowModal({
  visible,
  engine,
  onClose,
}: {
  visible: boolean;
  engine: UseEngine;
  onClose: () => void;
}) {
  const m = useAddressFlow(engine, onClose);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={m.back}>
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Pressable onPress={m.back} hitSlop={12}>
            <Text style={s.back}>{m.step === 'photo' ? 'Close' : 'Back'}</Text>
          </Pressable>
          <Text style={s.title}>Proof of address</Text>
          <Text style={s.step}>
            {m.step === 'photo' && '1 · Photo'}
            {(m.step === 'running' || m.step === 'result') && '2 · Decision'}
          </Text>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {m.step === 'photo' && (
            <>
              <Label>{m.person.expected.fullName}</Label>
              <Text style={s.lead}>Photograph or choose the document</Text>
              <Text style={s.hint}>
                {m.person.expected.city}
                {m.person.expected.state ? `, ${m.person.expected.state}` : ''}
              </Text>
              {m.imageUri ? (
                <Image source={{ uri: m.imageUri }} style={s.preview} resizeMode="contain" />
              ) : (
                <View style={[s.preview, s.empty]}>
                  <Text style={s.hint}>No photo yet</Text>
                </View>
              )}
              <View style={s.actions}>
                <View style={{ flex: 1 }}>
                  <Button title="Take photo" variant="secondary" onPress={() => void m.pick('camera')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Choose" variant="secondary" onPress={() => void m.pick('library')} />
                </View>
              </View>
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
              <Text style={s.lead}>Verifying on this device…</Text>
              {m.imageUri && (
                <Image source={{ uri: m.imageUri }} style={s.preview} resizeMode="contain" />
              )}
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
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  lead: { color: colors.textMuted, fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  center: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xxl },
  preview: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  empty: { alignItems: 'center', justifyContent: 'center' },
});

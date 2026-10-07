import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme/tokens';
import type { Tab } from './useAppShell';

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <View style={s.tabBar}>
      <TabButton label="Verify" active={tab === 'verify'} onPress={() => onTab('verify')} />
      <TabButton label="Bench" active={tab === 'bench'} onPress={() => onTab('bench')} />
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.tab, active && s.tabActive]}
    >
      <Text style={[s.tabText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  tabActive: { borderTopWidth: 2, borderTopColor: colors.brand, borderRadius: radius.sm },
  tabText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
});

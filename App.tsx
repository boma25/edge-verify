import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { BenchmarkScreen } from './src/screens/BenchmarkScreen';
import { VerifyScreen } from './src/screens/VerifyScreen';
import { AppHeader } from './src/shell/AppHeader';
import { TabBar } from './src/shell/TabBar';
import { useAppShell } from './src/shell/useAppShell';
import { colors } from './src/theme/tokens';
import { ToastProvider } from './src/ui/toast';

/**
 * Entry: index.ts → App → Shell.
 * Verify: home → Address/Job modal → runVerification → gate.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const m = useAppShell();

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <AppHeader />
      <View style={s.body}>
        {m.tab === 'verify' && <VerifyScreen engine={m.engine} />}
        {m.tab === 'bench' && <BenchmarkScreen engine={m.engine} />}
      </View>
      <TabBar tab={m.tab} onTab={m.setTab} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  body: { flex: 1 },
});

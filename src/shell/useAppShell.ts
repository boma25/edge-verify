import { useState } from 'react';

import { useEngine } from '../state/useEngine';

export type Tab = 'verify' | 'bench';

export function useAppShell() {
  const [tab, setTab] = useState<Tab>('verify');
  const engine = useEngine();

  return {
    tab,
    setTab,
    engine,
  };
}

export type AppShellModel = ReturnType<typeof useAppShell>;

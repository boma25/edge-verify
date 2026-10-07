import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  hasKotlinModelOnDisk,
  LiteRTKotlinEngine,
  type EngineStatus,
  type PreflightInfo,
  type VerificationEngine,
} from '../inference';
import { log } from '../util/log';

/** Active engine path. RN LiteRT fallback remains in codebase but is not selectable in UI. */
export type EngineKind = 'litert-kotlin';

export interface UseEngine {
  engine: VerificationEngine;
  kind: EngineKind;
  status: EngineStatus;
  preflight: PreflightInfo | null;
  /** Download .litertlm to disk only (no RAM load). */
  download: () => Promise<void>;
  /** Load weights into RAM (requires file already downloaded). */
  load: () => Promise<void>;
  /** Free RAM and return to idle so a cached file can be deleted or reloaded. */
  unload: () => Promise<void>;
  /** Re-read free RAM / memory estimate without changing load state. */
  refreshPreflight: () => void;
}

/**
 * Owns the Kotlin LiteRT-LM engine (Google AAR via local Expo module).
 */
export function useEngine(): UseEngine {
  const kind: EngineKind = 'litert-kotlin';
  const engine = useMemo(() => new LiteRTKotlinEngine(), []);
  const [status, setStatus] = useState<EngineStatus>({ phase: 'idle' });
  const [preflight, setPreflight] = useState<PreflightInfo | null>(null);

  const refreshPreflight = useCallback(() => {
    void engine.refreshMemoryPreflight().then((pre) => {
      setPreflight(pre);
      log.info('useEngine', 'preflight refreshed', {
        availableBytes: pre?.availableBytes,
        estimatedBytes: pre?.totalEstimatedBytes,
        verdict: pre?.verdict,
      });
    });
  }, [engine]);

  useEffect(() => {
    const onDisk = hasKotlinModelOnDisk();
    setStatus({
      phase: 'idle',
      message: onDisk ? 'Model on disk — tap Load' : undefined,
    });
    log.info('useEngine', 'mount', { modelOnDisk: onDisk });
    refreshPreflight();
    return () => {
      void engine.unload();
    };
  }, [engine, refreshPreflight]);

  const download = useCallback(async () => {
    log.info('useEngine', 'download requested');
    try {
      await engine.downloadModel(setStatus);
      refreshPreflight();
      log.info('useEngine', 'download finished');
    } catch (e) {
      refreshPreflight();
      log.error('useEngine', 'download failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [engine, refreshPreflight]);

  const load = useCallback(async () => {
    log.info('useEngine', 'load requested', { kind });
    try {
      await engine.load(setStatus);
      refreshPreflight();
      log.info('useEngine', 'load finished', { label: engine.label });
    } catch (e) {
      refreshPreflight();
      log.error('useEngine', 'load failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [engine, refreshPreflight]);

  const unload = useCallback(async () => {
    log.info('useEngine', 'unload requested');
    await engine.unload();
    setStatus({ phase: 'idle' });
    refreshPreflight();
  }, [engine, refreshPreflight]);

  return { engine, kind, status, preflight, download, load, unload, refreshPreflight };
}

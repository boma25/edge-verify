import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
  deleteCachedModel,
  listCachedModels,
  type CachedModel,
} from '../../inference/modelCache';
import type { UseEngine } from '../../state/useEngine';
import { formatBytes } from '../../util/formatBytes';
import { log } from '../../util/log';
import { shortError } from '../../ui/shortError';
import { useToast } from '../../ui/toast';

/**
 * Lists the Kotlin on-disk model (document/models) and deletes it after
 * unloading RAM if needed.
 */
export function useModelCache(engine: UseEngine) {
  const toast = useToast();
  // Probe disk on first paint so reload doesn't flash "Not downloaded".
  const [files, setFiles] = useState<CachedModel[]>(() => listCachedModels());
  const [deleting, setDeleting] = useState<string | null>(null);

  const busy =
    engine.status.phase === 'downloading' || engine.status.phase === 'loading' || deleting !== null;

  const refreshFiles = useCallback(() => {
    const next = listCachedModels();
    setFiles(next);
    log.info('models', 'disk probe', {
      fileCount: next.length,
      names: next.map((f) => f.fileName),
    });
  }, []);

  /** Refresh cached file list and free-RAM preflight. */
  const refresh = useCallback(() => {
    refreshFiles();
    engine.refreshPreflight();
  }, [engine, refreshFiles]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles, engine.status.phase, engine.kind]);

  function confirmDelete(file: CachedModel) {
    if (busy) return;
    Alert.alert(
      'Delete model?',
      `${file.fileName} (${formatBytes(file.sizeBytes)}) will be removed from this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void remove(file);
          },
        },
      ],
    );
  }

  async function remove(file: CachedModel) {
    setDeleting(file.fileName);
    log.info('models', 'delete requested', {
      fileName: file.fileName,
      sizeBytes: file.sizeBytes,
    });
    try {
      if (engine.status.phase === 'ready' || engine.status.phase === 'error') {
        await engine.unload();
      }
      deleteCachedModel(file);
      refresh();
      toast.show('Model deleted');
      log.info('models', 'delete ok', { fileName: file.fileName });
    } catch (e) {
      log.error('models', 'delete failed', {
        fileName: file.fileName,
        message: e instanceof Error ? e.message : String(e),
      });
      toast.error(shortError(e));
    } finally {
      setDeleting(null);
    }
  }

  return { files, deleting, busy, refresh, confirmDelete };
}

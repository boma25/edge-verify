import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { hasKotlinModelOnDisk, MODEL_FILENAME } from '../../inference/litertKotlinEngine';
import type { UseEngine } from '../../state/useEngine';
import { formatBytes } from '../../util/formatBytes';
import { shortError } from '../../ui/shortError';
import { useToast } from '../../ui/toast';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import { Button, Card } from '../../theme/ui';
import { useModelCache } from './useModelCache';

function ramLine(preflight: UseEngine['preflight']): string | undefined {
  if (!preflight) return undefined;
  return `${formatBytes(preflight.availableBytes)} free · ${preflight.verdict}`;
}

function phaseLabel(
  engine: UseEngine,
  hasModel: boolean,
): { title: string; detail?: string; tone: 'ok' | 'warn' | 'bad' | 'idle' } {
  const { status, preflight } = engine;
  const ram = ramLine(preflight);

  if (status.phase === 'ready') {
    return { title: 'Ready', detail: ram ?? 'Running on this device', tone: 'ok' };
  }
  if (status.phase === 'downloading') {
    return {
      title: `Downloading ${Math.round((status.progress ?? 0) * 100)}%`,
      detail: ram ? `Gemma 4 E2B · ~2.6 GB · ${ram}` : 'Gemma 4 E2B · ~2.6 GB',
      tone: 'warn',
    };
  }
  if (status.phase === 'loading') {
    return {
      title: 'Loading into memory',
      detail: ram ? `Trying GPU, then CPU… · ${ram}` : 'Trying GPU, then CPU…',
      tone: 'warn',
    };
  }
  if (status.phase === 'error') {
    return {
      title: status.memoryVerdict === 'critical' ? 'Not enough memory to load' : 'Something went wrong',
      detail: ram ?? status.message ?? 'Try again',
      tone: 'bad',
    };
  }
  if (hasModel) {
    if (preflight?.verdict === 'critical') {
      return {
        title: 'Downloaded · can’t load yet',
        detail: ram ? `${ram} — free RAM, then Load` : 'Model on disk; not enough RAM to load',
        tone: 'bad',
      };
    }
    return {
      title: 'Downloaded',
      detail: ram ? `${ram} — tap Load` : 'Model on disk — tap Load',
      tone: 'idle',
    };
  }
  return {
    title: 'Not downloaded',
    detail: ram ? `${ram} — tap Download first` : 'Download the model, then Load',
    tone: 'idle',
  };
}

const toneColor = {
  ok: colors.approve,
  warn: colors.retry,
  bad: colors.review,
  idle: colors.textMuted,
} as const;

/** Setup: download (disk) and load (RAM) as separate steps. */
export function DevicePanel({ engine }: { engine: UseEngine }) {
  const toast = useToast();
  const { files, deleting, busy: cacheBusy, refresh, confirmDelete } = useModelCache(engine);
  const ready = engine.status.phase === 'ready';
  const downloading = engine.status.phase === 'downloading';
  const loading = engine.status.phase === 'loading';
  const busy = cacheBusy || downloading || loading;
  const hasModel =
    files.some(
      (f) =>
        f.fileName === MODEL_FILENAME ||
        f.fileName.endsWith('.litertlm') ||
        f.sizeBytes > 1e9,
    ) || hasKotlinModelOnDisk();
  const phase = phaseLabel(engine, hasModel);
  const progress = downloading ? (engine.status.progress ?? 0) : null;
  const ramCritical = engine.preflight?.verdict === 'critical';
  const lastToastKey = useRef<string | null>(null);

  useEffect(() => {
    if (engine.status.phase !== 'error') return;
    const key = `${engine.status.memoryVerdict ?? ''}:${engine.status.message ?? 'error'}`;
    if (lastToastKey.current === key) return;
    lastToastKey.current = key;
    toast.error(shortError(engine.status.message ?? 'Something went wrong'));
  }, [engine.status.phase, engine.status.message, engine.status.memoryVerdict, toast]);

  return (
    <Card style={s.card}>
      <View style={s.top}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.kicker}>On this phone</Text>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: toneColor[phase.tone] }]} />
            <Text style={s.statusTitle}>{phase.title}</Text>
          </View>
          {phase.detail ? <Text style={s.detail}>{phase.detail}</Text> : null}
          {ready ? <Text style={s.detail}>{engine.engine.label}</Text> : null}
          {engine.preflight ? (
            <Text style={s.ram}>Available RAM · {formatBytes(engine.preflight.availableBytes)}</Text>
          ) : null}
        </View>
        <Pressable onPress={refresh} disabled={busy} hitSlop={8}>
          <Text style={[s.link, busy && { opacity: 0.4 }]}>Refresh</Text>
        </Pressable>
      </View>

      {progress != null && (
        <View style={s.track}>
          <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}

      {(downloading || loading) && (
        <View style={s.loadingRow}>
          <ActivityIndicator color={colors.brandSoft} />
          <Text style={s.detail}>
            {downloading ? 'Downloading — keep the app open' : 'Loading into memory…'}
          </Text>
        </View>
      )}

      {!ready && !downloading && !loading && (
        <View style={s.actions}>
          {!hasModel ? (
            <Button title="1. Download model (2.6 GB)" onPress={engine.download} disabled={busy} />
          ) : (
            <Text style={s.stepDone}>1. Download · done</Text>
          )}
          <Button
            title={
              ramCritical
                ? '2. Load · not enough RAM'
                : engine.status.phase === 'error'
                  ? '2. Try load again'
                  : '2. Load into memory'
            }
            onPress={engine.load}
            disabled={busy || !hasModel || ramCritical}
            variant={hasModel ? 'primary' : 'secondary'}
          />
        </View>
      )}

      {ready && (
        <Button title="Unload from memory" onPress={engine.unload} variant="secondary" disabled={busy} />
      )}

      <View style={s.models}>
        <Text style={s.section}>On disk</Text>
        {files.length === 0 ? (
          <Text style={s.empty}>No model file yet — use Download above.</Text>
        ) : (
          files.map((file) => (
            <View key={file.absolutePath} style={s.fileRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.fileName} numberOfLines={1}>
                  {prettyName(file.fileName)}
                </Text>
                <Text style={s.detail}>{formatBytes(file.sizeBytes)}</Text>
              </View>
              <Pressable onPress={() => confirmDelete(file)} disabled={busy} hitSlop={8}>
                <Text style={[s.delete, busy && { opacity: 0.4 }]}>
                  {deleting === file.fileName ? '…' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </Card>
  );
}

function prettyName(fileName: string): string {
  return fileName.replace(/\.litertlm$/i, '').replace(/[-_]/g, ' ');
}

const s = StyleSheet.create({
  card: { gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  kicker: {
    color: colors.brandSoft,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  detail: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  ram: {
    color: colors.brandSoft,
    fontFamily: fonts.mono,
    fontSize: 12,
    marginTop: 2,
  },
  link: { color: colors.brandSoft, fontSize: 14, fontWeight: '600' },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  fill: { height: 6, backgroundColor: colors.brand },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { gap: spacing.sm },
  stepDone: {
    color: colors.approve,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: spacing.sm,
  },
  models: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  empty: { color: colors.textMuted, fontSize: 13 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  fileName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  delete: { color: colors.review, fontSize: 14, fontWeight: '600' },
});

import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Share } from 'react-native';

import { GENERATED_ON, SYNTHETIC_IMAGES } from '../../../assets/synthetic';
import labelsJson from '../../../assets/synthetic/labels.json';
import type { BenchmarkItem, BenchmarkRun, LabelFile } from '../../benchmark/types';
import type { UseEngine } from '../../state/useEngine';
import { shortError } from '../../ui/shortError';
import { useToast } from '../../ui/toast';
import { localUri, safeRun, summarise } from './helpers';

const labels = labelsJson as unknown as LabelFile;

export type Edge = 'default' | '768' | '512';

export function useBenchmarkScreen(ctx: UseEngine) {
  const { engine, status } = ctx;
  const toast = useToast();
  const [passes, setPasses] = useState<'1' | '2'>('2');
  const [edge, setEdge] = useState<Edge>('default');
  const [notes, setNotes] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [items, setItems] = useState<BenchmarkItem[]>([]);
  const [meta, setMeta] = useState<BenchmarkRun['meta'] | null>(null);
  const cancel = useRef(false);

  const ready = status.phase === 'ready';
  const total = labels.items.length;

  const run = useCallback(async () => {
    cancel.current = false;
    setRunning(true);
    setDone(0);
    setItems([]);
    const p = Number(passes) as 1 | 2;
    const maxImageEdge = edge === 'default' ? undefined : Number(edge);
    const m: BenchmarkRun['meta'] = {
      device: `${Platform.OS} ${String((Platform.constants as { Model?: string }).Model ?? 'unknown')}`,
      os: `${Platform.OS} ${Platform.Version}`,
      engine: engine.label,
      backend: 'auto',
      passes: p,
      maxImageEdge: maxImageEdge ?? null,
      startedAt: new Date().toISOString(),
      asOf: GENERATED_ON,
      notes: notes || undefined,
    };
    setMeta(m);
    const out: BenchmarkItem[] = [];

    try {
      const first = labels.items[0];
      const warm = await localUri(SYNTHETIC_IMAGES[first.id]);
      await safeRun(engine, warm, p, maxImageEdge).catch(() => undefined);

      for (const l of labels.items) {
        if (cancel.current) break;
        const base: BenchmarkItem = {
          id: l.id,
          variant: l.variant,
          expectedOutcome: l.expectedOutcome,
          expected: l.expected,
          truth: l.truth as unknown as BenchmarkItem['truth'],
          fieldsVisible: l.fieldsVisible,
          passes: [],
        };
        try {
          const uri = await localUri(SYNTHETIC_IMAGES[l.id]);
          const r = await safeRun(engine, uri, p, maxImageEdge);
          out.push({ ...base, passes: r.passes, timings: r.timings });
        } catch (e) {
          out.push({ ...base, error: e instanceof Error ? e.message : String(e) });
          if (out.filter((i) => i.error).length === 1) {
            toast.error(shortError(e));
          }
        }
        setItems([...out]);
        setDone(out.length);
      }
    } finally {
      setRunning(false);
    }
  }, [engine, passes, edge, notes, toast]);

  const stop = useCallback(() => {
    cancel.current = true;
  }, []);

  const exportJson = useCallback(async () => {
    if (!meta) return;
    try {
      const payload: BenchmarkRun = { meta, items };
      await Share.share({ message: JSON.stringify(payload), title: 'edge-verify-benchmark.json' });
    } catch (e) {
      toast.error(shortError(e));
    }
  }, [meta, items, toast]);

  const summary = useMemo(
    () => (items.length > 0 && meta ? summarise(items, meta.passes, meta.asOf) : null),
    [items, meta],
  );
  const failed = items.filter((i) => i.error).length;

  return {
    engine,
    ready,
    passes,
    setPasses,
    edge,
    setEdge,
    notes,
    setNotes,
    running,
    done,
    total,
    items,
    failed,
    summary,
    run,
    stop,
    exportJson,
  };
}

export type BenchmarkScreenModel = ReturnType<typeof useBenchmarkScreen>;

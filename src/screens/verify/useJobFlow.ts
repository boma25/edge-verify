import { useMemo, useState } from 'react';

import { DEMO_PASSES, DEMO_THRESHOLD } from '../../demo/defaults';
import { DEMO_TRADES } from '../../demo/jobCatalog';
import type { UseEngine } from '../../state/useEngine';
import { shortError } from '../../ui/shortError';
import { useToast } from '../../ui/toast';
import { log } from '../../util/log';
import { decisionFromResult, runVerification, type RunResult, type Trade } from '../../verify';
import { pickImage, type ImageSource } from './pickImage';

export type JobStep = 'trade' | 'photos' | 'running' | 'result';
export type JobSlot = 'before' | 'after';

function uriTail(uri: string | null | undefined): string | undefined {
  return uri ? uri.slice(-40) : undefined;
}

export function useJobFlow(engine: UseEngine, onClose: () => void) {
  const toast = useToast();

  const [step, setStep] = useState<JobStep>('trade');
  const [trade, setTrade] = useState<Trade>('electrical');
  const [beforeUri, setBeforeUri] = useState<string | null>(null);
  const [afterUri, setAfterUri] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  const decision = useMemo(
    () => decisionFromResult(result, DEMO_THRESHOLD, attempt),
    [result, attempt],
  );

  function confirmTrade() {
    log.info('jobFlow', 'trade confirmed', { trade });
    setStep('photos');
  }

  async function pick(slot: JobSlot, source: ImageSource) {
    log.info('jobFlow', 'pick requested', { slot, source, trade });
    const res = await pickImage(source, { purpose: slot });
    if (!res) {
      log.info('jobFlow', 'pick cancelled', { slot, source });
      return;
    }
    if ('error' in res) {
      log.warn('jobFlow', 'pick failed', { error: res.error, slot, source });
      toast.error(res.error);
      return;
    }
    if (slot === 'before') setBeforeUri(res.uri);
    else setAfterUri(res.uri);
    setResult(null);
    log.info('jobFlow', 'pick stored', {
      slot,
      source,
      uriTail: uriTail(res.uri),
      hasBefore: slot === 'before' ? true : !!beforeUri,
      hasAfter: slot === 'after' ? true : !!afterUri,
    });
  }

  async function verify() {
    if (!beforeUri || !afterUri) {
      log.warn('jobFlow', 'verify skipped — missing photo', {
        hasBefore: !!beforeUri,
        hasAfter: !!afterUri,
        beforeTail: uriTail(beforeUri),
        afterTail: uriTail(afterUri),
      });
      return;
    }
    if (engine.status.phase !== 'ready') {
      log.warn('jobFlow', 'verify blocked — model not ready', { phase: engine.status.phase });
      toast.error('Load the model first');
      return;
    }
    log.info('jobFlow', 'verify start', {
      trade,
      attempt,
      beforeTail: uriTail(beforeUri),
      afterTail: uriTail(afterUri),
    });
    setStep('running');
    const next = await runVerification({
      engine: engine.engine,
      kind: 'job_photo',
      beforeUri,
      afterUri,
      passes: DEMO_PASSES,
      expectedAddress: { fullName: '', city: '' },
      trade,
    });
    if (!next.evaluation && next.failure) {
      log.warn('jobFlow', 'verify fail-closed', { failure: next.failure });
      toast.error(shortError(next.failure));
    } else {
      log.info('jobFlow', 'verify done', {
        summary: next.summary,
        totalMs: next.timings?.totalMs,
        rulesFailed: next.evaluation?.rules.filter((r) => !r.passed).map((r) => r.id),
      });
    }
    setResult(next);
    setStep('result');
  }

  function back() {
    log.info('jobFlow', 'back', { from: step });
    if (step === 'photos') {
      setStep('trade');
      return;
    }
    if (step === 'result') {
      setStep('photos');
      setResult(null);
      return;
    }
    onClose();
  }

  /** Retake after by default; keep before so the user can reshoot the fix. */
  function tryAnother() {
    log.info('jobFlow', 'retake after', {
      attempt: attempt + 1,
      keptBeforeTail: uriTail(beforeUri),
    });
    setAttempt((a) => a + 1);
    setAfterUri(null);
    setResult(null);
    setStep('photos');
  }

  return {
    trades: DEMO_TRADES,
    step,
    trade,
    setTrade,
    beforeUri,
    afterUri,
    result,
    decision,
    threshold: DEMO_THRESHOLD,
    confirmTrade,
    pick,
    verify,
    back,
    tryAnother,
    onClose,
    canVerify: !!beforeUri && !!afterUri,
  };
}

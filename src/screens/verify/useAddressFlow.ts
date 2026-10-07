import { useMemo, useState } from 'react';

import { getDemoPerson } from '../../demo/addressCatalog';
import { DEMO_PASSES, DEMO_THRESHOLD } from '../../demo/defaults';
import type { UseEngine } from '../../state/useEngine';
import { shortError } from '../../ui/shortError';
import { useToast } from '../../ui/toast';
import { log } from '../../util/log';
import { decisionFromResult, runVerification, type RunResult } from '../../verify';
import { pickImage, type ImageSource } from './pickImage';

export type AddressStep = 'photo' | 'running' | 'result';

export function useAddressFlow(engine: UseEngine, onClose: () => void) {
  const toast = useToast();
  const person = useMemo(() => getDemoPerson(), []);

  const [step, setStep] = useState<AddressStep>('photo');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  const decision = useMemo(
    () => decisionFromResult(result, DEMO_THRESHOLD, attempt),
    [result, attempt],
  );

  async function pick(source: ImageSource) {
    const res = await pickImage(source, { purpose: 'address' });
    if (!res) return;
    if ('error' in res) {
      log.warn('addressFlow', 'pick failed', { error: res.error });
      toast.error(res.error);
      return;
    }
    setImageUri(res.uri);
    setResult(null);
  }

  async function verify() {
    if (!imageUri) {
      log.warn('addressFlow', 'verify skipped — missing image');
      return;
    }
    if (engine.status.phase !== 'ready') {
      log.warn('addressFlow', 'verify blocked — model not ready', { phase: engine.status.phase });
      toast.error('Load the model first');
      return;
    }
    setStep('running');
    try {
      const next = await runVerification({
        engine: engine.engine,
        kind: 'address',
        imageUri,
        passes: DEMO_PASSES,
        expectedAddress: person.expected,
        trade: 'plumbing',
      });
      if (!next.evaluation && next.failure) {
        toast.error(shortError(next.failure));
      }
      setResult(next);
      setStep('result');
    } catch (e) {
      log.error('addressFlow', 'verify threw', {
        message: e instanceof Error ? e.message : String(e),
      });
      toast.error(shortError(e));
      setStep('photo');
    }
  }

  function back() {
    if (step === 'result') {
      setStep('photo');
      setResult(null);
      return;
    }
    onClose();
  }

  function tryAnother() {
    setAttempt((a) => a + 1);
    setImageUri(null);
    setResult(null);
    setStep('photo');
  }

  return {
    step,
    person,
    imageUri,
    result,
    decision,
    threshold: DEMO_THRESHOLD,
    canVerify: !!imageUri,
    pick,
    verify,
    back,
    tryAnother,
    onClose,
  };
}

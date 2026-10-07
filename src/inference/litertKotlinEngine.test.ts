import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import {
  __resetNativeCacheForTests,
  __setNativeForTests,
  type LitertEdgeNativeModule,
  type RunOptions as NativeRunOptions,
} from '../../modules/litert-edge';
import { EngineError } from './engine';
import {
  LiteRTKotlinEngine,
  MEMORY_SAFE_MULT,
  MODEL_FILE_BYTES,
} from './litertKotlinEngine';
import { ADDRESS_PROMPT_A, ADDRESS_PROMPT_B } from './schemas';

function mockNative(partial: Partial<LitertEdgeNativeModule>): LitertEdgeNativeModule {
  return {
    memoryInfo: async () => ({
      totalBytes: 8e9,
      availableBytes: MODEL_FILE_BYTES * MEMORY_SAFE_MULT,
      lowMemory: false,
      thresholdBytes: 1e9,
    }),
    load: async () => ({ initSeconds: 1.5 }),
    run: async () => ({
      text: '{}',
      totalMs: 10,
      ttftSeconds: 0.1,
      prefillTps: 100,
      decodeTps: 20,
    }),
    unload: async () => {},
    ...partial,
  };
}

const cleanAddressJson = JSON.stringify({
  documentType: 'utility_bill',
  fullName: 'Ada Lovelace',
  addressLine: '12 Computing Lane',
  city: 'London',
  state: null,
  issueDate: '2025-01-15',
  issuer: 'City Power',
  legibility: 'clear',
});

describe('LiteRTKotlinEngine', () => {
  beforeEach(() => {
    __resetNativeCacheForTests();
  });

  afterEach(() => {
    __resetNativeCacheForTests();
  });

  it('maps native throw to EngineError inference', async () => {
    __setNativeForTests(
      mockNative({
        run: async () => {
          throw new Error('native boom');
        },
      }),
    );
    const engine = new LiteRTKotlinEngine();
    const eng = engine as unknown as {
      ready: boolean;
      assertModelFilePresent: () => void;
    };
    eng.ready = true;
    eng.assertModelFilePresent = () => {};

    await assert.rejects(
      () => engine.extractAddress('file:///tmp/x.jpg', { passes: 1 }),
      (e: unknown) => e instanceof EngineError && e.kind === 'inference',
    );
  });

  it('maps bad JSON to EngineError parse', async () => {
    __setNativeForTests(
      mockNative({
        run: async () => ({
          text: 'not json at all',
          totalMs: 5,
          ttftSeconds: 0.05,
          prefillTps: 1,
          decodeTps: 1,
        }),
      }),
    );
    const engine = new LiteRTKotlinEngine();
    const eng = engine as unknown as {
      ready: boolean;
      assertModelFilePresent: () => void;
    };
    eng.ready = true;
    eng.assertModelFilePresent = () => {};

    await assert.rejects(
      () => engine.extractAddress('file:///tmp/x.jpg', { passes: 1 }),
      (e: unknown) => e instanceof EngineError && e.kind === 'parse',
    );
  });

  it('two passes use different prompts', async () => {
    const prompts: string[] = [];
    __setNativeForTests(
      mockNative({
        run: async (opts: NativeRunOptions) => {
          prompts.push(opts.prompt);
          return {
            text: cleanAddressJson,
            totalMs: 8,
            ttftSeconds: 0.08,
            prefillTps: 50,
            decodeTps: 15,
          };
        },
      }),
    );
    const engine = new LiteRTKotlinEngine();
    const eng = engine as unknown as {
      ready: boolean;
      assertModelFilePresent: () => void;
    };
    eng.ready = true;
    eng.assertModelFilePresent = () => {};

    const result = await engine.extractAddress('file:///tmp/x.jpg', { passes: 2 });
    assert.equal(result.passes.length, 2);
    assert.deepEqual(prompts, [ADDRESS_PROMPT_A, ADDRESS_PROMPT_B]);
    assert.equal(result.passes[0].fullName, 'Ada Lovelace');
  });

  it('rejects load when memory is critical without calling native', async () => {
    let nativeLoadCalls = 0;
    __setNativeForTests(
      mockNative({
        memoryInfo: async () => ({
          totalBytes: 4e9,
          availableBytes: MODEL_FILE_BYTES * 0.5,
          lowMemory: true,
          thresholdBytes: 5e8,
        }),
        load: async () => {
          nativeLoadCalls += 1;
          throw new Error('should not be called');
        },
      }),
    );
    const engine = new LiteRTKotlinEngine();
    (engine as unknown as { modelFile: () => { exists: boolean; size: number; uri: string } }).modelFile =
      () => ({
        exists: true,
        size: MODEL_FILE_BYTES,
        uri: 'file:///tmp/gemma-4-E2B-it.litertlm',
      });

    const statuses: string[] = [];
    await assert.rejects(
      () =>
        engine.load((s) => {
          statuses.push(s.phase);
        }),
      (e: unknown) => e instanceof EngineError && e.kind === 'memory',
    );
    assert.equal(nativeLoadCalls, 0);
    assert.ok(statuses.includes('error'));
    assert.equal(engine.preflight()?.verdict, 'critical');
  });

  it('load fails clearly when model is not downloaded', async () => {
    __setNativeForTests(mockNative({}));
    const engine = new LiteRTKotlinEngine();
    (engine as unknown as { modelFile: () => { exists: boolean; size: number; uri: string } }).modelFile =
      () => ({ exists: false, size: 0, uri: 'file:///tmp/missing.litertlm' });

    await assert.rejects(
      () => engine.load(() => {}),
      (e: unknown) =>
        e instanceof EngineError && e.kind === 'not_ready' && /download/i.test(e.message),
    );
  });
});

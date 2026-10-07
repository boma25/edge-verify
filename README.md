# Edge Verify

Companion app for the DevFest Onitsha 2026 talk **"Building AI at the Edge with Gemma & LiteRT for African Builders"**.

A React Native / Expo app that runs **Gemma on-device via LiteRT-LM** to verify proof-of-address documents and completed-job photos, then uses a **confidence gate** to decide: auto-approve, ask for a retake, or escalate to a person.

> **Public repo, synthetic data only.** Every test document in `assets/synthetic/` is generated with fictional details (demo holder: John Doe). Never commit real documents or real people's details.

## The idea in one paragraph

Two separate questions are asked of every reading: **are the rules satisfied** (right document type, name matches, recent...) and **do we trust the reading** (legibility, completeness, plausibility, agreement between two differently-worded passes). Approve only when both say yes. A fixable problem gets a bounded retry; anything unfixable or doubtful goes to a human. **Any inference error fails closed to human review.** The decision is a pure function of the stored evaluation, so changing the threshold re-decides without re-running the model.

## Engine

**Kotlin LiteRT-LM** via local Expo module [`modules/litert-edge`](modules/litert-edge) → Google's `litertlm-android` **0.18.0** (Android-only). Shared interface: [`src/inference/engine.ts`](src/inference/engine.ts).

**Download** and **Load** are separate steps on the Verify setup card: download writes the ~2.6 GB file to disk (allowed on low RAM); load puts weights in memory (blocked when the heuristic verdict is `critical`). Available RAM is always shown.

On-disk models live only under the Kotlin path (`document/models/`). There is no RN `ModelRegistry` purge step (that was deleting the file on reload).

Resolved native/Maven/HF facts: [`docs/kotlin-module-facts.md`](docs/kotlin-module-facts.md). Device checklist: [`docs/device-verification-checklist.md`](docs/device-verification-checklist.md).

## Run it

Needs a **dev build** (native modules; not Expo Go) on a physical **arm64 Android** phone. No x86 emulator.

```bash
npm install
npx expo install --check
npx expo prebuild --clean   # regenerates android/ with local module + OpenCL native libs
npm run android             # expo run:android, phone plugged in with USB debugging
```

First load downloads Gemma 4 E2B (`gemma-4-E2B-it.litertlm`, ~2.58 GB). Use Wi-Fi.

**Kotlin engine model paths**

- In-app download → `Paths.document/models/gemma-4-E2B-it.litertlm`
- Or push: `adb push gemma-4-E2B-it.litertlm /sdcard/Download/` then copy into the app documents `models/` folder (or rely on in-app download)

```bash
npm run typecheck
npm test                      # domain / parse / analysis + Kotlin engine mocks
```

## Benchmark (the numbers for the talk)

1. In the app: Verify tab → load Gemma → **Bench** tab → Run (try 1 vs 2 reads, and image edge 1024/768/512).
2. **Export results**, send the JSON to your laptop.
3. `npm run benchmark -- path/to/results.json`

You get field accuracy, latency (median/p90, tokens/s), a threshold sweep (approve / retry / human rate, **wrong approvals**), and a confusion matrix. CSV/JSON land in `benchmark/out/`.

Repeat on a second, cheaper phone (Tecno/Infinix class). The gap is the story.

`npm run benchmark -- --demo` runs on **fabricated** readings to test the pipeline. Never quote those numbers.

Regenerate test documents: `npm run synthetic` (needs Python + Pillow).

## Not yet verified on a real device

- Kotlin path: GPU vs CPU init seconds, OOM behaviour on 4 GB phones.
- `ResponseFormat.json` with our schemas (`anyOf: [string, null]`) **and** image input together.
- Exact on-disk byte size of the HF `.litertlm` after download.
- RN path: LLGuidance nullable fields, `resetConversation` between passes, S22 GPU delegate.
- Real latency, accuracy and memory. **Nothing here has been measured on hardware yet.**
- The runtime scales images to 1024 px, so only smaller edges are a real benchmark knob.

## Honest tradeoffs

- 2.58 GB download and multi-GB free RAM exclude many budget phones and cost real data money.
- Two reads roughly double latency; the benchmark shows what that buys.
- Kotlin v1 tries **GPU then CPU only** (no NPU); the RN fallback still does NPU→GPU→CPU.

## Structure

`src/domain` rules, similarity, confidence gate (pure, tested) · `src/inference` engine interface, RN LiteRT + Kotlin adapters · `modules/litert-edge` Expo Android module · `src/benchmark` analysis · `src/screens` Verify / Bench · `scripts` synthetic data + benchmark CLI.

Expo Router is deliberately not used: three tabs don't need it.

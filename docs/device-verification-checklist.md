# Step 9 — Device verification checklist [HUMAN]

Stop LLM work here until results are reported. Do **not** flip the default engine to `litert-kotlin` or quote device numbers until this passes.

## Phones

1. **4 GB RAM** budget Android (primary crash risk)
2. **Galaxy S22** (or similar flagship) for GPU comparison

## Build

```bash
npm install
npx expo install --check
npx expo prebuild --clean
npm run android
```

## Kotlin engine (`litert-kotlin` chip)

For each phone, record:

| Check | CPU | GPU | Notes / logcat |
| --- | --- | --- | --- |
| Load succeeds | | | `adb logcat \| grep -i litert` |
| Init seconds (from logs / status) | | | |
| Memory verdict (safe / tight / critical) | | | |
| Crash / OOM? | | | |
| Structured JSON with null fields + image | | | If broken: drop `schemaJson`, rely on `parse.ts` defaults |
| Bench: 1 vs 2 reads | | | Export JSON |
| Bench: image edge default / 768 / 512 | | | |

Then on laptop:

```bash
npm run benchmark -- path/to/results.json
```

Optionally try E4B only if memory allows (out of scope for default).

## Report back to the agent

Paste: phone model, RAM, backend results table, whether `anyOf` nullables worked with images, path to exported JSON, and any logcat errors. Only then should the agent flip the default engine and update slides.

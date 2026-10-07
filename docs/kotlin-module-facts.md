# Kotlin LiteRT-LM module facts

Resolved for the local Expo module `modules/litert-edge`. Do not guess beyond this file.

## Baseline (Step 1)

- `npm run typecheck`: exit 0
- `npm test`: **37** passing, 0 failing
- Current [`src/inference/litertEngine.ts`](../src/inference/litertEngine.ts) per pass: `resetConversation(undefined, systemPrompt)` → `execute([image, text], { responseSchema, maxOutputTokens: 320 })` → `getStats()` (ttft / tokensPerSecond); image optionally resized via `expo-image-manipulator` when `maxImageEdge` is set

## Maven artifact

| Field | Value | Source |
| --- | --- | --- |
| Coordinates | `com.google.ai.edge.litertlm:litertlm-android` | [Kotlin getting started](https://raw.githubusercontent.com/google-ai-edge/LiteRT-LM/main/docs/api/kotlin/getting_started.md) |
| Latest stable | **0.18.0** | [maven-metadata.xml](https://dl.google.com/android/maven2/com/google/ai/edge/litertlm/litertlm-android/maven-metadata.xml) (`<latest>0.18.0</latest>`, `<release>0.18.0</release>`) |
| POM deps | gson 2.14.0, kotlin-reflect 2.4.0, kotlinx-coroutines-android 1.11.0 | [0.18.0.pom](https://dl.google.com/android/maven2/com/google/ai/edge/litertlm/litertlm-android/0.18.0/litertlm-android-0.18.0.pom) |
| AAR `minSdkVersion` | **24** | Extracted from AAR `AndroidManifest.xml` |
| Repo | Google Maven (`https://dl.google.com/android/maven2/`) | same metadata URL |

Pinned in Gradle: `0.18.0`.

## Model file (Gemma 4 E2B)

| Field | Value | Source |
| --- | --- | --- |
| HF repo | `litert-community/gemma-4-E2B-it-litert-lm` | [model page](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm) |
| Filename (generic CPU/GPU) | `gemma-4-E2B-it.litertlm` | HF siblings + [download_model.sh](https://github.com/google-gemma/gemma-translator/blob/3996c9fb/download_model.sh) |
| Size on disk | ~**2.58 GB** (`MODEL_FILE_BYTES = 2.58e9`) | HF file listing / model card |
| Exact byte count | **UNKNOWN** (HF reports “2.58 GB”; verify after download) | — |
| License / gating | HF API: `license:apache-2.0`, `gated: false` (no token required for download) | [HF API](https://huggingface.co/api/models/litert-community/gemma-4-E2B-it-litert-lm) |
| Download URL | `https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm` | HF resolve |

## Kotlin API (verified from source / AAR 0.18.0)

- Package: `com.google.ai.edge.litertlm`
- `Engine(EngineConfig(...))` → `initialize()` / `close()` / `createConversation(ConversationConfig)`
- `Backend.CPU()`, `Backend.GPU()` (NPU out of scope for v1)
- `ConversationConfig(..., maxOutputToken, enableResponseFormat = …)`
- `SamplerConfig(topK, topP, temperature, seed)`
- `ResponseFormat.json(schemaJsonString)` requires `enableResponseFormat = true`
- `Contents.of(Content.ImageFile(path), Content.Text(prompt))`
- `conversation.sendMessage(contents, …, responseFormat = …)`
- `Message.toString()` joins text contents (use for returned string)
- `getBenchmarkInfo()` needs `ExperimentalFlags.enableBenchmark = true` **before** `Engine` is created
- `@ExperimentalApi` / `@OptIn(ExperimentalApi::class)` required to touch `ExperimentalFlags` (RequiresOptIn ERROR level) — source: [ExperimentalFlags.kt](https://raw.githubusercontent.com/google-ai-edge/LiteRT-LM/main/kotlin/java/com/google/ai/edge/litertlm/ExperimentalFlags.kt)
- Android GPU needs `libOpenCL.so` + `libvndksupport.so` `uses-native-library` entries

## Still UNKNOWN (device checklist)

- Whether `ResponseFormat.json` accepts our schemas with `anyOf: [string, null]`
- Whether `ResponseFormat` works together with image input on Gemma 4 E2B
- Real peak RAM / init seconds on 4 GB phones (Google’s S26 Ultra figures are not representative)
- Exact on-disk byte size of `gemma-4-E2B-it.litertlm` after download (use size check with tolerance if needed)

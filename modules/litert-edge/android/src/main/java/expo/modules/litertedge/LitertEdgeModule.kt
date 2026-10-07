package expo.modules.litertedge

import android.app.ActivityManager
import android.content.Context
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.ExperimentalApi
import com.google.ai.edge.litertlm.ExperimentalFlags
import com.google.ai.edge.litertlm.ResponseFormat
import com.google.ai.edge.litertlm.SamplerConfig
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

@OptIn(ExperimentalApi::class)
class LitertEdgeModule : Module() {
  /** Serializes load/run/unload; AsyncFunction already runs off the JS thread. */
  private val lock = Any()
  private val runHeld = AtomicBoolean(false)
  private var engine: Engine? = null

  override fun definition() = ModuleDefinition {
    Name("LitertEdge")

    AsyncFunction("memoryInfo") {
      synchronized(lock) { readMemoryInfo() }
    }

    AsyncFunction("load") { opts: Map<String, Any?> ->
      synchronized(lock) { doLoad(opts) }
    }

    AsyncFunction("run") { opts: Map<String, Any?> ->
      if (!runHeld.compareAndSet(false, true)) {
        throw CodedException("ERR_BUSY", "Another inference is already running", null)
      }
      try {
        synchronized(lock) { doRun(opts) }
      } finally {
        runHeld.set(false)
      }
    }

    AsyncFunction("unload") {
      synchronized(lock) { doUnload() }
    }
  }

  private fun appContextOrThrow(): Context {
    return appContext.reactContext
      ?: throw CodedException("ERR_CONTEXT", "React context is not available", null)
  }

  private fun readMemoryInfo(): Map<String, Any> {
    val context = appContextOrThrow()
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val info = ActivityManager.MemoryInfo()
    am.getMemoryInfo(info)
    return mapOf(
      "totalBytes" to info.totalMem.toDouble(),
      "availableBytes" to info.availMem.toDouble(),
      "lowMemory" to info.lowMemory,
      "thresholdBytes" to info.threshold.toDouble(),
    )
  }

  private fun doLoad(opts: Map<String, Any?>): Map<String, Any> {
    val modelPath = opts["modelPath"] as? String
      ?: throw CodedException("ERR_LOAD", "modelPath is required", null)
    val backendName = (opts["backend"] as? String)?.lowercase() ?: "cpu"
    val maxNumTokens = (opts["maxNumTokens"] as? Number)?.toInt()
      ?: throw CodedException("ERR_LOAD", "maxNumTokens is required", null)
    val cacheDir = opts["cacheDir"] as? String
      ?: throw CodedException("ERR_LOAD", "cacheDir is required", null)

    val backend =
      when (backendName) {
        "gpu" -> Backend.GPU()
        "cpu" -> Backend.CPU()
        else -> throw CodedException("ERR_LOAD", "Unsupported backend: $backendName", null)
      }

    doUnload()

    val absModel = stripFileScheme(modelPath)
    if (!fileExists(absModel)) {
      throw CodedException(
        "ERR_LOAD",
        "Model file not found at $absModel — download again",
        null,
      )
    }

    try {
      ExperimentalFlags.enableBenchmark = true
      val config =
        EngineConfig(
          modelPath = absModel,
          backend = backend,
          visionBackend = backend,
          maxNumTokens = maxNumTokens,
          maxNumImages = 1,
          cacheDir = stripFileScheme(cacheDir),
        )
      val next = Engine(config)
      val t0 = System.currentTimeMillis()
      next.initialize()
      val initSeconds = (System.currentTimeMillis() - t0) / 1000.0
      engine = next
      return mapOf("initSeconds" to initSeconds)
    } catch (oom: OutOfMemoryError) {
      engine = null
      throw CodedException("ERR_LOAD", errorMessage(oom), oom)
    } catch (e: CodedException) {
      engine = null
      throw e
    } catch (e: Throwable) {
      engine = null
      throw CodedException("ERR_LOAD", errorMessage(e), e)
    }
  }

  private fun doRun(opts: Map<String, Any?>): Map<String, Any> {
    val eng =
      engine
        ?: throw CodedException("ERR_NOT_READY", "Model is not loaded", null)

    val imagePath = opts["imagePath"] as? String
      ?: throw CodedException("ERR_INFERENCE", "imagePath is required", null)
    val systemPrompt = opts["systemPrompt"] as? String ?: ""
    val prompt = opts["prompt"] as? String
      ?: throw CodedException("ERR_INFERENCE", "prompt is required", null)
    val schemaJson = opts["schemaJson"] as? String
    val maxOutputTokens = (opts["maxOutputTokens"] as? Number)?.toInt() ?: 320

    val path = stripFileScheme(imagePath)
    if (!fileExists(path)) {
      throw CodedException("ERR_INFERENCE", "Image file not found at $path", null)
    }
    // Vision executor re-opens the .litertlm at run time — fail clearly if it vanished.
    val modelPath = eng.engineConfig.modelPath
    if (!fileExists(modelPath)) {
      throw CodedException(
        "ERR_NOT_READY",
        "Model file missing at $modelPath — re-download and load",
        null,
      )
    }
    var conversation: com.google.ai.edge.litertlm.Conversation? = null
    try {
      val config =
        ConversationConfig(
          systemInstruction = if (systemPrompt.isNotEmpty()) Contents.of(systemPrompt) else null,
          samplerConfig = SamplerConfig(topK = 1, topP = 1.0, temperature = 0.0, seed = 0),
          maxOutputToken = maxOutputTokens,
          enableResponseFormat = schemaJson != null,
        )
      conversation = eng.createConversation(config)
      val contents =
        Contents.of(
          Content.ImageFile(path),
          Content.Text(prompt),
        )
      val responseFormat = schemaJson?.let { ResponseFormat.json(it) }
      val t0 = System.currentTimeMillis()
      val message =
        if (responseFormat != null) {
          conversation.sendMessage(contents, responseFormat = responseFormat)
        } else {
          conversation.sendMessage(contents)
        }
      val elapsedMs = (System.currentTimeMillis() - t0).toDouble()

      val bench = conversation.getBenchmarkInfo()
      return mapOf(
        "text" to message.toString(),
        "totalMs" to elapsedMs,
        "ttftSeconds" to bench.timeToFirstTokenInSecond,
        "prefillTps" to bench.lastPrefillTokensPerSecond,
        "decodeTps" to bench.lastDecodeTokensPerSecond,
      )
    } catch (oom: OutOfMemoryError) {
      throw CodedException("ERR_INFERENCE", errorMessage(oom), oom)
    } catch (e: CodedException) {
      throw e
    } catch (e: Throwable) {
      throw CodedException("ERR_INFERENCE", errorMessage(e), e)
    } finally {
      try {
        conversation?.close()
      } catch (_: Throwable) {
        /* ignore */
      }
    }
  }

  private fun doUnload() {
    val current = engine ?: return
    engine = null
    try {
      current.close()
    } catch (_: Throwable) {
      /* idempotent */
    }
  }
}

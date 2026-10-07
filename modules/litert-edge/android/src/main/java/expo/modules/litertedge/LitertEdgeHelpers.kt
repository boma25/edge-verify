package expo.modules.litertedge

import java.io.File
import java.net.URLDecoder

/**
 * Normalize Expo / RN file URIs to absolute filesystem paths for LiteRT open().
 * Handles `file://`, `file:///`, and percent-encoding.
 */
fun stripFileScheme(path: String): String {
  var p = path.trim()
  if (p.startsWith("file://")) {
    p = p.removePrefix("file://")
    // file:///data/... → keep leading / ; file://localhost/data → drop host
    if (p.startsWith("localhost/")) p = p.removePrefix("localhost")
  }
  return try {
    URLDecoder.decode(p, Charsets.UTF_8.name())
  } catch (_: Exception) {
    p
  }
}

/** True when the path exists as a regular file after URI normalization. */
fun fileExists(path: String): Boolean {
  val f = File(stripFileScheme(path))
  return f.isFile && f.exists()
}

/** Map a throwable to a short message suitable for EngineError / CodedException. */
fun errorMessage(error: Throwable): String {
  val msg = error.message?.trim().orEmpty()
  return if (msg.isNotEmpty()) msg else error.javaClass.simpleName
}

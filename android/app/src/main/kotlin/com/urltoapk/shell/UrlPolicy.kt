package com.urltoapk.shell

import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

enum class UrlAction {
    LOAD_IN_APP,
    OPEN_EXTERNAL,
    BLOCK,
}

data class UrlDecision(val action: UrlAction, val uri: URI? = null)

/**
 * Classifies a navigation request before it reaches the WebView.
 *
 * Web links stay inside the wrapper unless the user explicitly opted into
 * opening other sites externally. Known app schemes (mail, dial, maps, intents)
 * go to the system. Everything else, including `javascript:`, `data:`, `file:`
 * and `content:`, is blocked rather than handed to another app.
 */
class UrlPolicy(
    originHost: String,
    private val allowExternalLinks: Boolean,
) {
    private val origin = originHost.lowercase(Locale.ROOT)

    fun decide(raw: String): UrlDecision {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) {
            return UrlDecision(UrlAction.BLOCK)
        }
        val uri = try {
            URI(trimmed)
        } catch (e: URISyntaxException) {
            return UrlDecision(UrlAction.BLOCK)
        }
        val scheme = uri.scheme?.lowercase(Locale.ROOT)
            ?: return UrlDecision(UrlAction.BLOCK)

        return when {
            scheme == "http" || scheme == "https" -> decideWeb(uri)
            scheme == "about" -> decideAbout(uri)
            scheme in EXTERNAL_SCHEMES -> UrlDecision(UrlAction.OPEN_EXTERNAL, uri)
            else -> UrlDecision(UrlAction.BLOCK)
        }
    }

    private fun decideWeb(uri: URI): UrlDecision {
        val host = uri.host?.lowercase(Locale.ROOT)
            ?: return UrlDecision(UrlAction.BLOCK)
        if (!allowExternalLinks || isSameSite(host)) {
            return UrlDecision(UrlAction.LOAD_IN_APP, uri)
        }
        return UrlDecision(UrlAction.OPEN_EXTERNAL, uri)
    }

    private fun decideAbout(uri: URI): UrlDecision =
        if (uri.schemeSpecificPart == "blank") {
            UrlDecision(UrlAction.LOAD_IN_APP, uri)
        } else {
            UrlDecision(UrlAction.BLOCK)
        }

    private fun isSameSite(host: String): Boolean =
        host == origin || host.endsWith(".$origin")

    companion object {
        val EXTERNAL_SCHEMES = setOf(
            "mailto",
            "tel",
            "sms",
            "smsto",
            "mms",
            "market",
            "geo",
            "intent",
            "whatsapp",
            "tg",
        )
    }
}

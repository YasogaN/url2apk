package com.urltoapk.shell

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

object ExternalIntents {
    private val ALLOWED_SCHEMES = UrlPolicy.EXTERNAL_SCHEMES + setOf("http", "https")

    /**
     * Builds a safe external intent, or returns null when the URI must not leave
     * the app. `intent:` URIs are restricted to browsable VIEW intents without a
     * hard-coded component, so a page cannot target arbitrary app internals.
     */
    fun create(uri: URI): Intent? {
        val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return null
        if (scheme !in ALLOWED_SCHEMES) {
            return null
        }
        if (scheme == "intent") {
            return createFromString(uri.toString())
        }
        return Intent(Intent.ACTION_VIEW, Uri.parse(uri.toString()))
    }

    /** Parses a raw `intent:` URL, accepting only the two documented forms. */
    fun createFromString(raw: String): Intent? {
        if (!raw.startsWith("intent://") && !raw.startsWith("intent:#Intent;")) {
            return null
        }
        return parseIntentUri(raw)
    }

    private fun parseIntentUri(raw: String): Intent? {
        val intent = try {
            Intent.parseUri(raw, Intent.URI_INTENT_SCHEME)
        } catch (e: URISyntaxException) {
            return null
        }
        if (intent.component != null || intent.selector != null) {
            return null
        }
        if (intent.action != Intent.ACTION_VIEW) {
            return null
        }
        if (intent.data == null) {
            return null
        }
        intent.addCategory(Intent.CATEGORY_BROWSABLE)
        intent.flags = intent.flags and (Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return intent
    }
}

class ExternalLinkHandler(private val startIntent: (Intent) -> Unit) {
    fun open(uri: URI): Boolean {
        val intent = ExternalIntents.create(uri) ?: return false
        return try {
            startIntent(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }
}

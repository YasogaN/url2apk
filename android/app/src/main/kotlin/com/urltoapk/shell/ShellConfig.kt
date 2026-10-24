package com.urltoapk.shell

import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

class ConfigException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * The per-APK payload that the browser generator writes to `assets/config.json`.
 *
 * Anything that must appear in the launcher (label, icon, package, versionCode)
 * is compiled into the APK and patched separately. This file only carries the
 * runtime configuration, so it can change size freely without touching the
 * binary resource table.
 */
data class ShellConfig(
    val url: String,
    val name: String? = null,
    val allowExternalLinks: Boolean = false,
    val userAgentSuffix: String? = null,
    val themeColor: String? = null,
) {
    companion object {
        const val MAX_NAME_LENGTH = 80
        const val MAX_USER_AGENT_SUFFIX_LENGTH = 160

        private const val CONFIG_FILE = "config.json"
        private val THEME_COLOR = Regex("^#[0-9A-F]{6}$")
        private val ALLOWED_KEYS = setOf(
            "url",
            "name",
            "allowExternalLinks",
            "userAgentSuffix",
            "themeColor",
        )

        fun parse(text: String): ShellConfig {
            val parsed = try {
                Json.parse(text)
            } catch (e: JsonException) {
                throw ConfigException("$CONFIG_FILE is not valid JSON: ${e.message}", e)
            }
            val root = parsed as? JsonObject
                ?: throw ConfigException("$CONFIG_FILE must contain a JSON object")

            val unknownKeys = root.fields.keys - ALLOWED_KEYS
            if (unknownKeys.isNotEmpty()) {
                throw ConfigException(
                    "Unknown config key(s): ${unknownKeys.sorted().joinToString(", ")}",
                )
            }

            val url = requireString(root, "url").trim()
            parseWebUri(url)

            val name = optionalString(root, "name")?.trim()?.ifEmpty { null }
            if (name != null && name.length > MAX_NAME_LENGTH) {
                throw ConfigException("'name' must be at most $MAX_NAME_LENGTH characters")
            }

            val allowExternalLinks = optionalBoolean(root, "allowExternalLinks") ?: false

            val userAgentSuffix = optionalString(root, "userAgentSuffix")?.trim()?.ifEmpty { null }
            if (userAgentSuffix != null) {
                if (userAgentSuffix.length > MAX_USER_AGENT_SUFFIX_LENGTH) {
                    throw ConfigException(
                        "'userAgentSuffix' must be at most $MAX_USER_AGENT_SUFFIX_LENGTH characters",
                    )
                }
                if (userAgentSuffix.any { it == '\n' || it == '\r' }) {
                    throw ConfigException("'userAgentSuffix' must not contain line breaks")
                }
            }

            val themeColorValue = optionalString(root, "themeColor")?.trim()
            val themeColor = if (themeColorValue.isNullOrEmpty()) {
                null
            } else {
                themeColorValue.uppercase(Locale.ROOT)
            }
            if (themeColor != null && !THEME_COLOR.matches(themeColor)) {
                throw ConfigException("'themeColor' must be a #RRGGBB value")
            }

            return ShellConfig(
                url = url,
                name = name,
                allowExternalLinks = allowExternalLinks,
                userAgentSuffix = userAgentSuffix,
                themeColor = themeColor,
            )
        }

        private fun parseWebUri(raw: String): URI {
            if (raw.isEmpty()) {
                throw ConfigException("'url' must not be empty")
            }
            val uri = try {
                URI(raw)
            } catch (e: URISyntaxException) {
                throw ConfigException("'url' is not a valid URI", e)
            }
            if (!"https".equals(uri.scheme, ignoreCase = true)) {
                throw ConfigException("'url' must use https")
            }
            if (uri.host == null) {
                throw ConfigException("'url' must include a host")
            }
            if (uri.userInfo != null) {
                throw ConfigException("'url' must not include credentials")
            }
            return uri
        }

        private fun requireString(root: JsonObject, key: String): String =
            when (val value = root.fields[key]) {
                null -> throw ConfigException("Missing required key '$key'")
                is JsonString -> value.value
                else -> throw ConfigException("'$key' must be a string")
            }

        private fun optionalString(root: JsonObject, key: String): String? =
            when (val value = root.fields[key]) {
                null, JsonNull -> null
                is JsonString -> value.value
                else -> throw ConfigException("'$key' must be a string or null")
            }

        private fun optionalBoolean(root: JsonObject, key: String): Boolean? =
            when (val value = root.fields[key]) {
                null, JsonNull -> null
                is JsonBoolean -> value.value
                else -> throw ConfigException("'$key' must be a boolean")
            }
    }
}

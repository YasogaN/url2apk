package com.urltoapk.shell

import java.net.URISyntaxException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ShellConfigTest {
    private fun parse(json: String): ShellConfig = ShellConfig.parse(json)

    private fun assertInvalid(json: String, fragment: String): ConfigException {
        val error = assertThrows(ConfigException::class.java) { ShellConfig.parse(json) }
        assertTrue(
            "expected message to contain <$fragment> but was <${error.message}>",
            error.message.orEmpty().contains(fragment),
        )
        return error
    }

    @Test
    fun `minimal config uses defaults`() {
        assertEquals(
            ShellConfig(url = "https://example.com"),
            parse("""{"url":"https://example.com"}"""),
        )
    }

    @Test
    fun `full config is trimmed and normalised`() {
        val config = parse(
            """{"url":" https://example.com/path?q=1#frag ","name":" Example ","allowExternalLinks":true,"userAgentSuffix":" MyApp/1.0 ","themeColor":"#a1b2c3"}""",
        )
        assertEquals("https://example.com/path?q=1#frag", config.url)
        assertEquals("Example", config.name)
        assertEquals(true, config.allowExternalLinks)
        assertEquals("MyApp/1.0", config.userAgentSuffix)
        assertEquals("#A1B2C3", config.themeColor)
    }

    @Test
    fun `explicit nulls use defaults`() {
        val config = parse(
            """{"url":"https://example.com","name":null,"allowExternalLinks":null,"userAgentSuffix":null,"themeColor":null}""",
        )
        assertNull(config.name)
        assertEquals(false, config.allowExternalLinks)
        assertNull(config.userAgentSuffix)
        assertNull(config.themeColor)
    }

    @Test
    fun `blank optional strings become null`() {
        val config = parse(
            """{"url":"https://example.com","name":"   ","userAgentSuffix":"  ","themeColor":"  "}""",
        )
        assertNull(config.name)
        assertNull(config.userAgentSuffix)
        assertNull(config.themeColor)
    }

    @Test
    fun `uppercase scheme and explicit port are accepted`() {
        val config = parse("""{"url":"HTTPS://EXAMPLE.COM:8443/path?q=1#f"}""")
        assertEquals("HTTPS://EXAMPLE.COM:8443/path?q=1#f", config.url)
    }

    @Test
    fun `name accepts the maximum length`() {
        val name = "a".repeat(ShellConfig.MAX_NAME_LENGTH)
        assertEquals(name, parse("""{"url":"https://example.com","name":"$name"}""").name)
    }

    @Test
    fun `user agent suffix accepts the maximum length`() {
        val suffix = "u".repeat(ShellConfig.MAX_USER_AGENT_SUFFIX_LENGTH)
        assertEquals(
            suffix,
            parse("""{"url":"https://example.com","userAgentSuffix":"$suffix"}""").userAgentSuffix,
        )
    }

    @Test
    fun `rejects malformed json`() {
        assertTrue(assertInvalid("{", "not valid JSON").cause is JsonException)
        assertInvalid("", "not valid JSON")
        assertInvalid("[]", "not valid JSON")
    }

    @Test
    fun `rejects non-object roots`() {
        assertInvalid("\"text\"", "must contain a JSON object")
        assertInvalid("1", "must contain a JSON object")
        assertInvalid("null", "must contain a JSON object")
    }

    @Test
    fun `rejects unknown keys`() {
        assertInvalid(
            """{"url":"https://example.com","z":1,"a":2}""",
            "Unknown config key(s): a, z",
        )
    }

    @Test
    fun `rejects a missing url`() {
        assertInvalid("{}", "Missing required key 'url'")
    }

    @Test
    fun `rejects a non-string url`() {
        assertInvalid("""{"url":1}""", "'url' must be a string")
        assertInvalid("""{"url":null}""", "'url' must be a string")
    }

    @Test
    fun `rejects empty urls`() {
        assertInvalid("""{"url":""}""", "'url' must not be empty")
        assertInvalid("""{"url":"   "}""", "'url' must not be empty")
    }

    @Test
    fun `rejects malformed uris`() {
        assertInvalid("""{"url":"https://exa mple.com"}""", "'url' is not a valid URI")
        assertTrue(
            assertInvalid("""{"url":"https://exa%mple.com"}""", "not a valid URI").cause
                is URISyntaxException,
        )
    }

    @Test
    fun `rejects non-https urls`() {
        assertInvalid("""{"url":"http://example.com"}""", "'url' must use https")
        assertInvalid("""{"url":"ftp://example.com"}""", "'url' must use https")
        assertInvalid("""{"url":"javascript:alert(1)"}""", "'url' must use https")
    }

    @Test
    fun `rejects urls without a host`() {
        assertInvalid("""{"url":"https:///path"}""", "'url' must include a host")
        assertInvalid("""{"url":"https://:8080/"}""", "'url' must include a host")
    }

    @Test
    fun `rejects urls with credentials`() {
        assertInvalid(
            """{"url":"https://user:pass@example.com"}""",
            "'url' must not include credentials",
        )
    }

    @Test
    fun `rejects a non-string name`() {
        assertInvalid("""{"url":"https://example.com","name":1}""", "'name' must be a string or null")
    }

    @Test
    fun `rejects an overlong name`() {
        val name = "a".repeat(ShellConfig.MAX_NAME_LENGTH + 1)
        assertInvalid("""{"url":"https://example.com","name":"$name"}""", "at most 80 characters")
    }

    @Test
    fun `rejects a non-boolean allowExternalLinks`() {
        assertInvalid(
            """{"url":"https://example.com","allowExternalLinks":"true"}""",
            "'allowExternalLinks' must be a boolean",
        )
    }

    @Test
    fun `rejects a non-string user agent suffix`() {
        assertInvalid(
            """{"url":"https://example.com","userAgentSuffix":1}""",
            "'userAgentSuffix' must be a string or null",
        )
    }

    @Test
    fun `rejects an overlong user agent suffix`() {
        val suffix = "u".repeat(ShellConfig.MAX_USER_AGENT_SUFFIX_LENGTH + 1)
        assertInvalid(
            """{"url":"https://example.com","userAgentSuffix":"$suffix"}""",
            "at most 160 characters",
        )
    }

    @Test
    fun `rejects line breaks in the user agent suffix`() {
        assertInvalid(
            """{"url":"https://example.com","userAgentSuffix":"a\nb"}""",
            "must not contain line breaks",
        )
        assertInvalid(
            """{"url":"https://example.com","userAgentSuffix":"a\rb"}""",
            "must not contain line breaks",
        )
    }

    @Test
    fun `rejects a non-string theme colour`() {
        assertInvalid(
            """{"url":"https://example.com","themeColor":1}""",
            "'themeColor' must be a string or null",
        )
    }

    @Test
    fun `rejects malformed theme colours`() {
        assertInvalid("""{"url":"https://example.com","themeColor":"red"}""", "#RRGGBB")
        assertInvalid("""{"url":"https://example.com","themeColor":"#12345"}""", "#RRGGBB")
        assertInvalid("""{"url":"https://example.com","themeColor":"#GGGGGG"}""", "#RRGGBB")
    }

    @Test
    fun `config exception keeps the original cause`() {
        val jsonError = assertInvalid("{", "not valid JSON")
        assertSame(JsonException::class.java, jsonError.cause!!.javaClass)
    }
}

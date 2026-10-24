package com.urltoapk.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class JsonTest {
    private fun parse(text: String): JsonValue = Json.parse(text)

    private fun assertFails(text: String, fragment: String) {
        val error = assertThrows(JsonException::class.java) { Json.parse(text) }
        assertTrue(
            "expected message to contain <$fragment> but was <${error.message}>",
            error.message.orEmpty().contains(fragment),
        )
    }

    @Test
    fun `parses an empty object`() {
        assertEquals(JsonObject(emptyMap()), parse("{}"))
    }

    @Test
    fun `parses every scalar type`() {
        val value = parse("""{"s":"hello","n":-12.5e1,"t":true,"f":false,"z":null}""")
        assertEquals(
            JsonObject(
                mapOf(
                    "s" to JsonString("hello"),
                    "n" to JsonNumber(-125.0),
                    "t" to JsonBoolean(true),
                    "f" to JsonBoolean(false),
                    "z" to JsonNull,
                ),
            ),
            value,
        )
    }

    @Test
    fun `ignores whitespace around tokens`() {
        assertEquals(
            JsonObject(mapOf("a" to JsonNumber(1.0))),
            parse(" \n\t { \"a\" : 1 } \r\n"),
        )
    }

    @Test
    fun `parses nested objects`() {
        assertEquals(
            JsonObject(mapOf("a" to JsonObject(mapOf("b" to JsonString("c"))))),
            parse("""{"a":{"b":"c"}}"""),
        )
    }

    @Test
    fun `parses empty keys and values`() {
        assertEquals(
            JsonObject(mapOf("" to JsonString(""))),
            parse("""{"":""}"""),
        )
    }

    @Test
    fun `parses every short escape`() {
        assertEquals(JsonString("\""), (parse("""{"s":"\""}""") as JsonObject).fields["s"])
        assertEquals(JsonString("\\"), (parse("""{"s":"\\"}""") as JsonObject).fields["s"])
        assertEquals(JsonString("/"), (parse("""{"s":"\/"}""") as JsonObject).fields["s"])
        assertEquals(JsonString("\b"), (parse("""{"s":"\b"}""") as JsonObject).fields["s"])
        assertEquals(JsonString("\u000C"), (parse("""{"s":"\f"}""") as JsonObject).fields["s"])
        assertEquals(JsonString("\n"), (parse("""{"s":"\n"}""") as JsonObject).fields["s"])
        assertEquals(JsonString("\r"), (parse("""{"s":"\r"}""") as JsonObject).fields["s"])
        assertEquals(JsonString("\t"), (parse("""{"s":"\t"}""") as JsonObject).fields["s"])
    }

    @Test
    fun `parses unicode escapes with lower and upper hex digits`() {
        assertEquals(
            JsonString("A\u00e9\u00C9"),
            (parse("""{"s":"\u0041\u00e9\u00C9"}""") as JsonObject).fields["s"],
        )
    }

    @Test
    fun `parses surrogate pairs`() {
        assertEquals(
            JsonString("\uD83D\uDE00"),
            (parse("""{"s":"\uD83D\uDE00"}""") as JsonObject).fields["s"],
        )
    }

    @Test
    fun `parses escaped NUL and literal non-ascii`() {
        assertEquals(
            JsonString("\u0000é\u007F"),
            (parse("""{"s":"\u0000é\u007F"}""") as JsonObject).fields["s"],
        )
    }

    @Test
    fun `parses every legal number shape`() {
        val cases = mapOf(
            "0" to 0.0,
            "-0" to 0.0,
            "10" to 10.0,
            "-10" to -10.0,
            "0.5" to 0.5,
            "-0.5" to -0.5,
            "1e2" to 100.0,
            "1E+2" to 100.0,
            "1e-2" to 0.01,
            "0.0e0" to 0.0,
        )
        for ((raw, expected) in cases) {
            assertEquals(raw, expected, (parse(raw) as JsonNumber).value, 0.0)
        }
    }

    @Test
    fun `rejects arrays`() {
        assertFails("[]", "Arrays are not supported")
        assertFails("[1]", "Arrays are not supported")
    }

    @Test
    fun `rejects empty and whitespace-only input`() {
        assertFails("", "Unexpected end of input")
        assertFails(" \n\t ", "Unexpected end of input")
    }

    @Test
    fun `rejects unexpected characters`() {
        assertFails("x", "Unexpected character 'x'")
        assertFails("+1", "Unexpected character '+'")
        assertFails(".5", "Unexpected character '.'")
        assertFails("NaN", "Unexpected character 'N'")
    }

    @Test
    fun `rejects trailing content`() {
        assertFails("{} {}", "Unexpected trailing content")
        assertFails("01", "Unexpected trailing content")
        assertFails("falsey", "Unexpected trailing content")
    }

    @Test
    fun `rejects malformed literals`() {
        assertFails("tru", "Expected 'true'")
        assertFails("nul", "Expected 'null'")
        assertFails("fals", "Expected 'false'")
    }

    @Test
    fun `rejects missing or malformed object syntax`() {
        assertFails("{1:2}", "Expected object key")
        assertFails("""{"a":1,}""", "Expected object key")
        assertFails("""{"a" 1}""", "Expected ':' after object key")
        assertFails("""{"a":1 "b":2}""", "Expected ',' or '}' in object")
        assertFails("""{"a":1""", "Unexpected end of input")
        assertFails("{", "Unexpected end of input")
        assertFails("""{"a":}""", "Unexpected character '}'")
        assertFails("""{"a":""", "Unexpected end of input")
    }

    @Test
    fun `rejects duplicate keys`() {
        assertFails("""{"a":1,"a":2}""", "Duplicate object key 'a'")
    }

    @Test
    fun `rejects broken strings`() {
        assertFails("""{"a":"x}""", "Unterminated string")
        assertFails("{\"a\":\"" + 0x01.toChar() + "\"}", "Unescaped control character")
        assertFails("""{"a":"\q"}""", "Invalid escape '\\q'")
        assertFails("{\"a\":\"\\", "Unterminated escape")
        assertFails("{\"a\":\"\\u1", "Incomplete unicode escape")
        assertFails("""{"a":"\u12G4"}""", "Invalid unicode escape")
    }

    @Test
    fun `rejects broken numbers`() {
        assertFails("-", "Invalid number")
        assertFails("-x", "Invalid number")
        assertFails("1.", "Invalid number fraction")
        assertFails("1e", "Invalid number exponent")
        assertFails("1e+", "Invalid number exponent")
        assertFails("1e400", "Number out of range")
    }

    @Test
    fun `parses hex digits in every unicode range`() {
        assertEquals(
            JsonString("0aA9fF"),
            (parse("""{"s":"\u0030\u0061\u0041\u0039\u0066\u0046"}""") as JsonObject).fields["s"],
        )
    }

    @Test
    fun `rejects unicode escapes outside every hex range`() {
        val cases = listOf(
            """{"s":"\u0/0A"}""",
            """{"s":"\u0:0A"}""",
            """{"s":"\u0`0A"}""",
            """{"s":"\u0g0A"}""",
            """{"s":"\u0@0A"}""",
            """{"s":"\u0G0A"}""",
        )
        for (text in cases) {
            assertFails(text, "Invalid unicode escape")
        }
    }

    @Test
    fun `covers number scanner boundaries`() {
        assertFails("1.x", "Invalid number fraction")
        assertFails("1e+x", "Invalid number exponent")
        assertFails("101x", "Unexpected trailing content")
        assertFails("1e2x", "Unexpected trailing content")
        assertFails("0.5x", "Unexpected trailing content")
        assertEquals(JsonNumber(101.0), parse("101"))
        assertEquals(JsonNumber(0.5), parse("0.5"))
        assertEquals(JsonNumber(1e20), parse("1e20"))
    }

    @Test
    fun `covers number range boundaries`() {
        assertFails("-/", "Invalid number")
        assertFails("-:", "Invalid number")
        assertFails("1./", "Invalid number fraction")
        assertFails("0.5/", "Unexpected trailing content")
        assertFails("1e+/", "Invalid number exponent")
        assertFails("1e+:", "Invalid number exponent")
    }
}

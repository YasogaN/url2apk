package com.urltoapk.shell

/**
 * A deliberately small, strict JSON reader for `assets/config.json`.
 *
 * The shell only needs a flat object of strings, booleans, numbers and null, so
 * this avoids pulling in a serialization plugin that would fight AGP's built-in
 * Kotlin support. It is strict on purpose: duplicate keys, trailing content,
 * arrays and non-finite numbers are rejected instead of silently guessed.
 */
sealed interface JsonValue

data class JsonObject(val fields: Map<String, JsonValue>) : JsonValue

data class JsonString(val value: String) : JsonValue

data class JsonNumber(val value: Double) : JsonValue

data class JsonBoolean(val value: Boolean) : JsonValue

data object JsonNull : JsonValue

class JsonException(message: String) : Exception(message)

object Json {
    fun parse(text: String): JsonValue = Parser(text).parse()
}

private class Parser(private val text: String) {
    private var index = 0

    fun parse(): JsonValue {
        skipWhitespace()
        val value = parseValue()
        skipWhitespace()
        if (index != text.length) {
            throw error("Unexpected trailing content")
        }
        return value
    }

    private fun parseValue(): JsonValue {
        if (index >= text.length) {
            throw error("Unexpected end of input")
        }
        return when (text[index]) {
            '{' -> parseObject()
            '"' -> JsonString(parseString())
            't' -> {
                expect("true")
                JsonBoolean(true)
            }
            'f' -> {
                expect("false")
                JsonBoolean(false)
            }
            'n' -> {
                expect("null")
                JsonNull
            }
            '[' -> throw error("Arrays are not supported")
            else -> {
                val c = text[index]
                if (c == '-' || c in '0'..'9') parseNumber() else throw error("Unexpected character '$c'")
            }
        }
    }

    private fun parseObject(): JsonObject {
        index++
        skipWhitespace()
        val fields = LinkedHashMap<String, JsonValue>()
        if (peek() == '}') {
            index++
            return JsonObject(fields)
        }
        while (true) {
            skipWhitespace()
            if (peek() != '"') {
                throw error("Expected object key")
            }
            val key = parseString()
            skipWhitespace()
            if (peek() != ':') {
                throw error("Expected ':' after object key")
            }
            index++
            skipWhitespace()
            val value = parseValue()
            if (fields.containsKey(key)) {
                throw error("Duplicate object key '$key'")
            }
            fields[key] = value
            skipWhitespace()
            when (peek()) {
                ',' -> index++
                '}' -> {
                    index++
                    return JsonObject(fields)
                }
                else -> throw error("Expected ',' or '}' in object")
            }
        }
    }

    private fun parseString(): String {
        index++
        val builder = StringBuilder()
        while (index < text.length) {
            val c = text[index]
            index++
            when {
                c == '"' -> return builder.toString()
                c == '\\' -> builder.append(parseEscape())
                c.code < 0x20 -> throw error("Unescaped control character")
                else -> builder.append(c)
            }
        }
        throw error("Unterminated string")
    }

    private fun parseEscape(): Char {
        if (index >= text.length) {
            throw error("Unterminated escape")
        }
        val c = text[index]
        index++
        return when (c) {
            '"' -> '"'
            '\\' -> '\\'
            '/' -> '/'
            'b' -> '\b'
            'f' -> '\u000C'
            'n' -> '\n'
            'r' -> '\r'
            't' -> '\t'
            'u' -> parseUnicodeEscape()
            else -> throw error("Invalid escape '\\$c'")
        }
    }

    private fun parseUnicodeEscape(): Char {
        if (index + 4 > text.length) {
            throw error("Incomplete unicode escape")
        }
        var value = 0
        repeat(4) {
            val digit = when (val c = text[index]) {
                in '0'..'9' -> c - '0'
                in 'a'..'f' -> c - 'a' + 10
                in 'A'..'F' -> c - 'A' + 10
                else -> throw error("Invalid unicode escape")
            }
            value = value * 16 + digit
            index++
        }
        return value.toChar()
    }

    private fun parseNumber(): JsonNumber {
        val start = index
        if (peek() == '-') {
            index++
        }
        if (index >= text.length) {
            throw error("Invalid number")
        }
        when {
            text[index] == '0' -> index++
            text[index] in '1'..'9' -> while (index < text.length && text[index] in '0'..'9') index++
            else -> throw error("Invalid number")
        }
        if (index < text.length && text[index] == '.') {
            index++
            if (index >= text.length || text[index] !in '0'..'9') {
                throw error("Invalid number fraction")
            }
            while (index < text.length && text[index] in '0'..'9') index++
        }
        if (index < text.length && (text[index] == 'e' || text[index] == 'E')) {
            index++
            if (index < text.length && (text[index] == '+' || text[index] == '-')) {
                index++
            }
            if (index >= text.length || text[index] !in '0'..'9') {
                throw error("Invalid number exponent")
            }
            while (index < text.length && text[index] in '0'..'9') index++
        }
        val raw = text.substring(start, index)
        val value = raw.toDouble()
        if (!value.isFinite()) {
            throw error("Number out of range")
        }
        return JsonNumber(value)
    }

    private fun skipWhitespace() {
        while (index < text.length) {
            when (text[index]) {
                ' ', '\t', '\n', '\r' -> index++
                else -> return
            }
        }
    }

    private fun expect(literal: String) {
        if (!text.startsWith(literal, index)) {
            throw error("Expected '$literal'")
        }
        index += literal.length
    }

    private fun peek(): Char {
        if (index >= text.length) {
            throw error("Unexpected end of input")
        }
        return text[index]
    }

    private fun error(message: String): JsonException = JsonException("$message at index $index")
}

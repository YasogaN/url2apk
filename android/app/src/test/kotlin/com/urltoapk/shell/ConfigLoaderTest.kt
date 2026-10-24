package com.urltoapk.shell

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

class ConfigLoaderTest {
    @Test
    fun `loads and parses a valid source`() {
        val config = ConfigLoader {
            """{"url":"https://example.com","name":"Example"}"""
        }.load()
        assertEquals("https://example.com", config.url)
        assertEquals("Example", config.name)
    }

    @Test
    fun `wraps io failures`() {
        val cause = IOException("boom")
        val error = assertThrows(ConfigException::class.java) {
            ConfigLoader { throw cause }.load()
        }
        assertSame(cause, error.cause)
        assertTrue(error.message.orEmpty().contains("could not be read"))
    }

    @Test
    fun `propagates config failures`() {
        assertThrows(ConfigException::class.java) {
            ConfigLoader { "{" }.load()
        }
    }
}

@RunWith(RobolectricTestRunner::class)
class AssetConfigSourceTest {
    @Test
    fun `reads the bundled config json`() {
        val text = AssetConfigSource(RuntimeEnvironment.getApplication().assets).read()
        assertTrue(text.contains("\"url\""))
        assertTrue(text.contains("https://example.com/"))
    }
}

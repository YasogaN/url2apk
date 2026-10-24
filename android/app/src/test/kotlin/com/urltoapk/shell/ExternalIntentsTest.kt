package com.urltoapk.shell

import android.content.ActivityNotFoundException
import android.content.Intent
import java.net.URI
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ExternalIntentsTest {
    @Test
    fun `builds a view intent for web and app links`() {
        for (raw in listOf(
            "http://example.com/a",
            "https://example.com/a",
            "mailto:someone@example.com",
            "tel:+123",
            "sms:+123",
            "smsto:+123",
            "mms:+123",
            "market://details?id=test",
            "geo:1,2",
            "whatsapp://send?text=hi",
            "tg://resolve?domain=test",
        )) {
            val intent = ExternalIntents.create(URI(raw))
            assertEquals("action for $raw", Intent.ACTION_VIEW, intent?.action)
            assertEquals("data for $raw", raw, intent?.dataString)
        }
    }

    @Test
    fun `rejects schemes that must never leave the app`() {
        for (raw in listOf(
            "javascript:alert(1)",
            "data:text/html,x",
            "file:///etc/passwd",
            "content://com.example/x",
            "blob:https://example.com/id",
            "ftp://example.com/x",
            "about:blank",
            "unknown:payload",
        )) {
            assertNull("expected null for $raw", ExternalIntents.create(URI(raw)))
        }
    }

    @Test
    fun `accepts a browsable view intent`() {
        val intent = ExternalIntents.create(
            URI("intent://example.com/path#Intent;scheme=https;package=com.example;end"),
        )
        assertEquals(Intent.ACTION_VIEW, intent?.action)
        assertEquals("example.com", intent?.data?.host)
        assertEquals("com.example", intent?.`package`)
        assertTrue(intent?.categories?.contains(Intent.CATEGORY_BROWSABLE) == true)
    }

    @Test
    fun `strips non-navigation flags from intent uris`() {
        val intent = ExternalIntents.create(
            URI("intent://example.com/#Intent;scheme=https;launchFlags=0x1;end"),
        )
        assertEquals(0, intent?.flags)
    }

    @Test
    fun `rejects intent uris with a component`() {
        assertNull(ExternalIntents.createFromString("intent:#Intent;component=com.evil/.Main;end"))
    }

    @Test
    fun `rejects intent uris with a non-view action`() {
        assertNull(
            ExternalIntents.createFromString(
                "intent:#Intent;action=android.intent.action.SEND;end",
            ),
        )
    }

    @Test
    fun `rejects intent uris without data`() {
        assertNull(
            ExternalIntents.createFromString(
                "intent:#Intent;action=android.intent.action.VIEW;end",
            ),
        )
    }

    @Test
    fun `rejects malformed intent uris`() {
        assertNull(ExternalIntents.createFromString("intent://example.com/#Intent;scheme=https"))
        assertNull(ExternalIntents.createFromString("intent:not-an-intent"))
        assertNull(ExternalIntents.createFromString("https://example.com"))
        assertNull(ExternalIntents.create(URI("intent:not-an-intent")))
    }
}

@RunWith(RobolectricTestRunner::class)
class ExternalLinkHandlerTest {
    @Test
    fun `starts an allowed intent`() {
        var captured: Intent? = null
        val handler = ExternalLinkHandler { captured = it }
        assertTrue(handler.open(URI("mailto:someone@example.com")))
        assertEquals(Intent.ACTION_VIEW, captured?.action)
        assertEquals("mailto:someone@example.com", captured?.dataString)
    }

    @Test
    fun `does not start a disallowed intent`() {
        var called = false
        val handler = ExternalLinkHandler { called = true }
        assertFalse(handler.open(URI("ftp://example.com/x")))
        assertFalse(called)
    }

    @Test
    fun `reports a missing handler`() {
        val handler = ExternalLinkHandler { throw ActivityNotFoundException() }
        assertFalse(handler.open(URI("mailto:someone@example.com")))
    }
}

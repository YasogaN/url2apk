package com.urltoapk.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class UrlPolicyTest {
    private fun assertAction(policy: UrlPolicy, url: String, action: UrlAction) {
        val decision = policy.decide(url)
        assertEquals("action for <$url>", action, decision.action)
        if (action == UrlAction.BLOCK) {
            assertNull("blocked decision must not carry a URI", decision.uri)
        } else {
            assertNotNull("non-blocked decision must carry a URI", decision.uri)
        }
    }

    @Test
    fun `keeps web links in the app by default`() {
        val policy = UrlPolicy("example.com", allowExternalLinks = false)
        assertAction(policy, "https://example.com/", UrlAction.LOAD_IN_APP)
        assertAction(policy, "https://example.com:8443/a?b=c#d", UrlAction.LOAD_IN_APP)
        assertAction(policy, "http://example.com/a", UrlAction.LOAD_IN_APP)
        assertAction(policy, "HTTPS://EXAMPLE.COM/a", UrlAction.LOAD_IN_APP)
        assertAction(policy, "https://www.example.com/a", UrlAction.LOAD_IN_APP)
        assertAction(policy, "https://a.b.example.com/a", UrlAction.LOAD_IN_APP)
        assertAction(policy, "https://elsewhere.test/a", UrlAction.LOAD_IN_APP)
        assertAction(policy, " https://example.com/a ", UrlAction.LOAD_IN_APP)
    }

    @Test
    fun `same-site comparison does not match suffix lookalikes`() {
        val policy = UrlPolicy("example.com", allowExternalLinks = true)
        assertAction(policy, "https://example.com/", UrlAction.LOAD_IN_APP)
        assertAction(policy, "https://www.example.com/", UrlAction.LOAD_IN_APP)
        assertAction(policy, "https://a.b.example.com/", UrlAction.LOAD_IN_APP)
        assertAction(policy, "https://notexample.com/", UrlAction.OPEN_EXTERNAL)
        assertAction(policy, "https://example.com.evil.test/", UrlAction.OPEN_EXTERNAL)
        assertAction(policy, "https://EXAMPLE.COM/", UrlAction.LOAD_IN_APP)
        assertAction(policy, "https://example.com@evil.test/", UrlAction.OPEN_EXTERNAL)
    }

    @Test
    fun `opens other sites externally only when asked`() {
        val policy = UrlPolicy("example.com", allowExternalLinks = true)
        assertAction(policy, "https://elsewhere.test/a", UrlAction.OPEN_EXTERNAL)
        assertAction(policy, "http://elsewhere.test/a", UrlAction.OPEN_EXTERNAL)
    }

    @Test
    fun `opens known external schemes`() {
        val policy = UrlPolicy("example.com", allowExternalLinks = false)
        for (scheme in UrlPolicy.EXTERNAL_SCHEMES) {
            assertAction(policy, "$scheme:payload", UrlAction.OPEN_EXTERNAL)
        }
        assertAction(policy, "MAILTO:someone@example.com", UrlAction.OPEN_EXTERNAL)
    }

    @Test
    fun `allows about blank only`() {
        val policy = UrlPolicy("example.com", allowExternalLinks = false)
        assertAction(policy, "about:blank", UrlAction.LOAD_IN_APP)
        assertAction(policy, "about:blank#fragment", UrlAction.LOAD_IN_APP)
        assertAction(policy, "about:config", UrlAction.BLOCK)
        assertAction(policy, "about:", UrlAction.BLOCK)
    }

    @Test
    fun `blocks dangerous and unknown schemes`() {
        val policy = UrlPolicy("example.com", allowExternalLinks = false)
        for (url in listOf(
            "javascript:alert(1)",
            "data:text/html,<b>x</b>",
            "file:///etc/passwd",
            "content://com.example/x",
            "blob:https://example.com/id",
            "ftp://example.com/file",
            "chrome://settings",
            "unknown:payload",
        )) {
            assertAction(policy, url, UrlAction.BLOCK)
        }
    }

    @Test
    fun `blocks empty malformed and hostless values`() {
        val policy = UrlPolicy("example.com", allowExternalLinks = false)
        assertAction(policy, "", UrlAction.BLOCK)
        assertAction(policy, "   ", UrlAction.BLOCK)
        assertAction(policy, "not a url", UrlAction.BLOCK)
        assertAction(policy, "https://", UrlAction.BLOCK)
        assertAction(policy, "https:///path", UrlAction.BLOCK)
        assertAction(policy, "example.com", UrlAction.BLOCK)
        assertAction(policy, "//example.com", UrlAction.BLOCK)
    }
}

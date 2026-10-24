package com.urltoapk.shell

import android.content.ActivityNotFoundException
import android.content.Context
import android.net.Uri
import android.net.http.SslCertificate
import android.net.http.SslError
import android.webkit.RenderProcessGoneDetail
import android.webkit.SafeBrowsingResponse
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class ShellWebViewClientTest {
    private val context: Context = RuntimeEnvironment.getApplication()
    private val webView = FakeWebView(context, back = false, forward = false)

    private class FakeEvents : PageEvents {
        val started = mutableListOf<String>()
        val finished = mutableListOf<String>()
        val errors = mutableListOf<Pair<String, String>>()
        var blocked = 0
        val history = mutableListOf<Pair<Boolean, Boolean>>()
        val renderer = mutableListOf<Boolean>()

        override fun onPageStarted(url: String) {
            started += url
        }

        override fun onPageFinished(url: String) {
            finished += url
        }

        override fun onMainFrameError(description: String, failingUrl: String) {
            errors += description to failingUrl
        }

        override fun onExternalLinkBlocked() {
            blocked++
        }

        override fun onHistoryChanged(canGoBack: Boolean, canGoForward: Boolean) {
            history += canGoBack to canGoForward
        }

        override fun onRendererGone(didCrash: Boolean) {
            renderer += didCrash
        }
    }

    private class FakeRequest(
        private val url: String,
        private val mainFrame: Boolean,
    ) : WebResourceRequest {
        override fun getUrl(): Uri = Uri.parse(url)
        override fun isForMainFrame(): Boolean = mainFrame
        override fun isRedirect(): Boolean = false
        override fun hasGesture(): Boolean = false
        override fun getMethod(): String = "GET"
        override fun getRequestHeaders(): Map<String, String> = emptyMap()
    }

    private class FakeWebView(
        context: Context,
        private val back: Boolean,
        private val forward: Boolean,
    ) : WebView(context) {
        override fun canGoBack(): Boolean = back
        override fun canGoForward(): Boolean = forward
    }

    private class FakeSslError(
        private val code: Int,
        private val url: String?,
    ) : SslError(
        code,
        SslCertificate("dummy", "dummy", "2020-01-01", "2030-01-01"),
    ) {
        override fun getPrimaryError(): Int = code
        override fun getUrl(): String? = url
    }

    private class FakeSafeBrowsing : SafeBrowsingResponse() {
        var backedOff = false
        override fun backToSafety(report: Boolean) {
            backedOff = true
        }

        override fun proceed(report: Boolean) = Unit
        override fun showInterstitial(report: Boolean) = Unit
    }

    private class FakeRenderGone(private val crashed: Boolean) : RenderProcessGoneDetail() {
        override fun didCrash(): Boolean = crashed
        override fun rendererPriorityAtExit(): Int = 0
    }

    private fun client(
        policy: UrlPolicy = UrlPolicy("example.com", allowExternalLinks = false),
        handler: ExternalLinkHandler = ExternalLinkHandler { },
        events: FakeEvents = FakeEvents(),
    ) = ShellWebViewClient(policy, handler, events)

    @Test
    fun `keeps same-site navigation in the webview`() {
        val events = FakeEvents()
        val client = client(events = events)
        assertFalse(
            client.shouldOverrideUrlLoading(
                webView,
                FakeRequest("https://example.com/path", mainFrame = true),
            ),
        )
        assertFalse(client.shouldOverrideUrlLoading(webView, "https://example.com/legacy"))
        assertEquals(0, events.blocked)
    }

    @Test
    fun `opens external navigation and records it`() {
        var opened: android.content.Intent? = null
        val events = FakeEvents()
        val client = client(
            policy = UrlPolicy("example.com", allowExternalLinks = true),
            handler = ExternalLinkHandler { opened = it },
            events = events,
        )
        assertTrue(
            client.shouldOverrideUrlLoading(
                webView,
                FakeRequest("https://elsewhere.test/a", mainFrame = true),
            ),
        )
        assertNotNull(opened)
        assertEquals("https://elsewhere.test/a", opened?.dataString)
        assertEquals(0, events.blocked)
    }

    @Test
    fun `reports an external link with no handler`() {
        val events = FakeEvents()
        val client = client(
            policy = UrlPolicy("example.com", allowExternalLinks = true),
            handler = ExternalLinkHandler { throw ActivityNotFoundException() },
            events = events,
        )
        assertTrue(
            client.shouldOverrideUrlLoading(
                webView,
                FakeRequest("https://elsewhere.test/a", mainFrame = true),
            ),
        )
        assertEquals(1, events.blocked)
    }

    @Test
    fun `blocks dangerous navigation`() {
        val events = FakeEvents()
        val client = client(events = events)
        assertTrue(client.shouldOverrideUrlLoading(webView, "javascript:alert(1)"))
        assertEquals(1, events.blocked)
    }

    @Test
    fun `forwards page lifecycle and history`() {
        val events = FakeEvents()
        val client = client(events = events)
        client.onPageStarted(webView, "https://example.com", null)
        client.onPageFinished(webView, "https://example.com")
        client.doUpdateVisitedHistory(webView, "https://example.com", false)
        assertEquals(listOf("https://example.com"), events.started)
        assertEquals(listOf("https://example.com"), events.finished)
        assertEquals(listOf(false to false, false to false), events.history)
    }

    @Test
    fun `reports only main-frame resource errors`() {
        val events = FakeEvents()
        val client = client(events = events)
        val mainFrameError = Mockito.mock(WebResourceError::class.java)
        Mockito.`when`(mainFrameError.description).thenReturn("boom")
        val subresourceError = Mockito.mock(WebResourceError::class.java)
        Mockito.`when`(subresourceError.description).thenReturn("ignored")
        client.onReceivedError(
            webView,
            FakeRequest("https://example.com", mainFrame = true),
            mainFrameError,
        )
        client.onReceivedError(
            webView,
            FakeRequest("https://example.com/asset", mainFrame = false),
            subresourceError,
        )
        client.onReceivedError(webView, -1, "legacy", "https://example.com/legacy")
        assertEquals(
            listOf("boom" to "https://example.com", "legacy" to "https://example.com/legacy"),
            events.errors,
        )
    }

    @Test
    fun `cancels ssl errors and reports them`() {
        val events = FakeEvents()
        val client = client(events = events)
        val handler = Mockito.mock(SslErrorHandler::class.java)
        client.onReceivedSslError(webView, handler, FakeSslError(SslError.SSL_UNTRUSTED, "https://bad.test"))
        Mockito.verify(handler).cancel()
        assertEquals(1, events.errors.size)
        client.onReceivedSslError(webView, handler, FakeSslError(SslError.SSL_EXPIRED, null))
        Mockito.verify(handler, Mockito.times(2)).cancel()
        assertEquals(2, events.errors.size)
    }

    @Test
    fun `backs out of a safe browsing hit`() {
        val events = FakeEvents()
        val client = client(events = events)
        val callback = FakeSafeBrowsing()
        client.onSafeBrowsingHit(webView, FakeRequest("https://bad.test", mainFrame = true), 0, callback)
        assertTrue(callback.backedOff)
        assertEquals(listOf("Unsafe site blocked" to "https://bad.test"), events.errors)
    }

    @Test
    fun `handles a dead renderer`() {
        val events = FakeEvents()
        val client = client(events = events)
        val detail = FakeRenderGone(crashed = true)
        assertTrue(client.onRenderProcessGone(webView, detail))
        assertEquals(listOf(true), events.renderer)
        assertTrue(client.rendererCrashed(26, detail))
        assertFalse(client.rendererCrashed(24, detail))
    }
}

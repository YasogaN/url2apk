package com.urltoapk.shell

import android.net.http.SslError
import android.webkit.RenderProcessGoneDetail
import android.webkit.SafeBrowsingResponse
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

interface PageEvents {
    fun onPageStarted(url: String)
    fun onPageFinished(url: String)
    fun onMainFrameError(description: String, failingUrl: String)
    fun onExternalLinkBlocked()
    fun onHistoryChanged(canGoBack: Boolean, canGoForward: Boolean)
    fun onRendererGone(didCrash: Boolean)
}

class ShellWebViewClient(
    private val policy: UrlPolicy,
    private val externalHandler: ExternalLinkHandler,
    private val events: PageEvents,
) : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        decide(request.url.toString())

    @Deprecated("Deprecated in Java")
    override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = decide(url)

    private fun decide(rawUrl: String): Boolean {
        val decision = policy.decide(rawUrl)
        return when (decision.action) {
            UrlAction.LOAD_IN_APP -> false
            UrlAction.OPEN_EXTERNAL -> {
                val opened = decision.uri?.let(externalHandler::open) ?: false
                if (!opened) {
                    events.onExternalLinkBlocked()
                }
                true
            }
            UrlAction.BLOCK -> {
                events.onExternalLinkBlocked()
                true
            }
        }
    }

    override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
        events.onPageStarted(url)
    }

    override fun onPageFinished(view: WebView, url: String) {
        events.onPageFinished(url)
        events.onHistoryChanged(view.canGoBack(), view.canGoForward())
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
        events.onHistoryChanged(view.canGoBack(), view.canGoForward())
    }

    override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: WebResourceError,
    ) {
        if (request.isForMainFrame) {
            events.onMainFrameError(error.description.toString(), request.url.toString())
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onReceivedError(
        view: WebView,
        errorCode: Int,
        description: String,
        failingUrl: String,
    ) {
        events.onMainFrameError(description, failingUrl)
    }

    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
        events.onMainFrameError("SSL error ${error.primaryError}", error.url ?: "")
    }

    override fun onSafeBrowsingHit(
        view: WebView,
        request: WebResourceRequest,
        threatType: Int,
        callback: SafeBrowsingResponse,
    ) {
        callback.backToSafety(true)
        events.onMainFrameError("Unsafe site blocked", request.url.toString())
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        events.onRendererGone(detail.didCrash())
        return true
    }
}

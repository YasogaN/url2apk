package com.urltoapk.shell

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class ShellWebChromeClientTest {
    private val context: Context = RuntimeEnvironment.getApplication()
    private val webView = WebView(context)

    private class FakeHost : ChromeHost {
        var progress = -1
        var chooserCallback: ValueCallback<Array<Uri>>? = null
        var chooserParams: WebChromeClient.FileChooserParams? = null
        var permission: PermissionRequest? = null
        var geoOrigin: String? = null
        var geoCallback: GeolocationPermissions.Callback? = null
        var fullscreenView: View? = null
        var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
        var hidden = 0
        var console: String? = null

        override fun onProgress(progress: Int) {
            this.progress = progress
        }

        override fun onFileChooser(
            callback: ValueCallback<Array<Uri>>,
            params: WebChromeClient.FileChooserParams,
        ): Boolean {
            chooserCallback = callback
            chooserParams = params
            return true
        }

        override fun onPermissionRequest(request: PermissionRequest) {
            permission = request
        }

        override fun onGeolocationPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            geoOrigin = origin
            geoCallback = callback
        }

        override fun onShowFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
            fullscreenView = view
            fullscreenCallback = callback
        }

        override fun onHideFullscreen() {
            hidden++
        }

        override fun onConsoleMessage(message: String) {
            console = message
        }
    }

    private class FakeFileChooserParams : WebChromeClient.FileChooserParams() {
        override fun getMode(): Int = MODE_OPEN
        override fun getAcceptTypes(): Array<String> = arrayOf("*/*")
        override fun isCaptureEnabled(): Boolean = false
        override fun getTitle(): CharSequence = "Pick a file"
        override fun getFilenameHint(): String = "upload"
        override fun createIntent(): Intent = Intent(Intent.ACTION_GET_CONTENT)
    }

    private class FakePermissionRequest : PermissionRequest() {
        override fun getOrigin(): Uri = Uri.parse("https://example.com")
        override fun getResources(): Array<String> = arrayOf(RESOURCE_VIDEO_CAPTURE)
        override fun grant(requestedResources: Array<String>) = Unit
        override fun deny() = Unit
    }

    private class FakeGeoCallback : GeolocationPermissions.Callback {
        var invoked = false
        override fun invoke(origin: String?, allow: Boolean, retain: Boolean) {
            invoked = true
        }
    }

    private class FakeCustomView : WebChromeClient.CustomViewCallback {
        var hidden = false
        override fun onCustomViewHidden() {
            hidden = true
        }
    }

    @Test
    fun `forwards progress`() {
        val host = FakeHost()
        ShellWebChromeClient(host).onProgressChanged(webView, 42)
        assertEquals(42, host.progress)
    }

    @Test
    fun `forwards file chooser`() {
        val host = FakeHost()
        val callback: ValueCallback<Array<Uri>> = ValueCallback { }
        val params = FakeFileChooserParams()
        assertTrue(ShellWebChromeClient(host).onShowFileChooser(webView, callback, params))
        assertSame(callback, host.chooserCallback)
        assertSame(params, host.chooserParams)
    }

    @Test
    fun `forwards permission requests`() {
        val host = FakeHost()
        val request = FakePermissionRequest()
        ShellWebChromeClient(host).onPermissionRequest(request)
        assertSame(request, host.permission)
    }

    @Test
    fun `forwards geolocation prompts`() {
        val host = FakeHost()
        val callback = FakeGeoCallback()
        ShellWebChromeClient(host).onGeolocationPermissionsShowPrompt("https://example.com", callback)
        assertEquals("https://example.com", host.geoOrigin)
        assertSame(callback, host.geoCallback)
    }

    @Test
    fun `forwards fullscreen transitions`() {
        val host = FakeHost()
        val view = View(context)
        val callback = FakeCustomView()
        val client = ShellWebChromeClient(host)
        client.onShowCustomView(view, callback)
        assertSame(view, host.fullscreenView)
        assertSame(callback, host.fullscreenCallback)
        client.onHideCustomView()
        assertEquals(1, host.hidden)
    }

    @Test
    fun `forwards console messages and suppresses the default logger`() {
        val host = FakeHost()
        val client = ShellWebChromeClient(host)
        val handled = client.onConsoleMessage(
            ConsoleMessage("hello", "source.js", 7, ConsoleMessage.MessageLevel.LOG),
        )
        assertTrue(handled)
        assertEquals("hello", host.console)
    }
}

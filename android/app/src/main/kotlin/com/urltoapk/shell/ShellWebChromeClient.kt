package com.urltoapk.shell

import android.net.Uri
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView

interface ChromeHost {
    fun onProgress(progress: Int)
    fun onFileChooser(
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams,
    ): Boolean
    fun onPermissionRequest(request: PermissionRequest)
    fun onGeolocationPrompt(origin: String, callback: GeolocationPermissions.Callback)
    fun onShowFullscreen(view: View, callback: WebChromeClient.CustomViewCallback)
    fun onHideFullscreen()
    fun onConsoleMessage(message: String)
}

class ShellWebChromeClient(private val host: ChromeHost) : WebChromeClient() {
    override fun onProgressChanged(view: WebView, newProgress: Int) {
        host.onProgress(newProgress)
    }

    override fun onShowFileChooser(
        webView: WebView,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: FileChooserParams,
    ): Boolean = host.onFileChooser(filePathCallback, fileChooserParams)

    override fun onPermissionRequest(request: PermissionRequest) {
        host.onPermissionRequest(request)
    }

    override fun onGeolocationPermissionsShowPrompt(
        origin: String,
        callback: GeolocationPermissions.Callback,
    ) {
        host.onGeolocationPrompt(origin, callback)
    }

    override fun onShowCustomView(view: View, callback: CustomViewCallback) {
        host.onShowFullscreen(view, callback)
    }

    override fun onHideCustomView() {
        host.onHideFullscreen()
    }

    override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
        host.onConsoleMessage(consoleMessage.message())
        return true
    }
}

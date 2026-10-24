package com.urltoapk.shell

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import java.net.URI
import kotlin.math.roundToInt

open class MainActivity : Activity(), PageEvents, ChromeHost {
    internal companion object {
        const val REQUEST_FILE_CHOOSER = 1001
        const val REQUEST_MEDIA_PERMISSIONS = 1002
        const val REQUEST_LOCATION = 1003
    }

    private lateinit var config: ShellConfig
    private lateinit var policy: UrlPolicy
    private lateinit var externalHandler: ExternalLinkHandler
    private lateinit var downloader: Downloader
    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    private var errorView: View? = null
    private var errorDetail: TextView? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null
    private var pendingGeolocation: Pair<String, GeolocationPermissions.Callback>? = null
    private var rendererGone = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        config = try {
            loadConfig()
        } catch (e: ConfigException) {
            showFatalError(e.message.orEmpty())
            return
        }

        policy = UrlPolicy(URI(config.url).host.orEmpty(), config.allowExternalLinks)
        externalHandler = ExternalLinkHandler { startActivity(it) }
        downloader = createDownloader()

        root = FrameLayout(this)
        progressBar = createProgressBar()
        webView = createWebView()

        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(
            progressBar,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP),
        )
        setContentView(root)
        configureEdgeToEdge()
        registerBackCallback()
        webView.loadUrl(config.url)
    }

    protected open fun loadConfig(): ShellConfig =
        ConfigLoader(AssetConfigSource(assets)).load()

    internal open fun createDownloader(): Downloader =
        DownloadHandler(checkNotNull(getSystemService(DownloadManager::class.java)))

    private fun createProgressBar(): ProgressBar =
        ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            visibility = View.GONE
        }

    private fun createWebView(): WebView {
        val view = WebView(this)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = false
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            builtInZoomControls = false
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = ShellEnvironment.userAgent(userAgentString, config.userAgentSuffix)
        }
        view.isVerticalScrollBarEnabled = true
        view.overScrollMode = View.OVER_SCROLL_NEVER
        view.setBackgroundColor(Color.TRANSPARENT)
        view.webViewClient = ShellWebViewClient(policy, externalHandler, this)
        view.webChromeClient = ShellWebChromeClient(this)
        view.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            handleDownload(url, userAgent, contentDisposition, mimeType)
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(view, true)
        }
        WebView.setWebContentsDebuggingEnabled(
            ShellEnvironment.isDebuggable(applicationInfo.flags),
        )
        return view
    }

    private fun configureEdgeToEdge() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return
        }
        window.setDecorFitsSystemWindows(false)
        root.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        root.requestApplyInsets()
    }

    private fun registerBackCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return
        }
        onBackInvokedDispatcher.registerOnBackInvokedCallback(
            android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
            this::handleBack,
        )
    }

    // API 33+ uses the platform OnBackInvokedDispatcher registered above. This
    // override remains for API 24-32, where the system still routes back here.
    @SuppressLint("GestureBackNavigation")
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        handleBack()
    }

    private fun handleBack() {
        if (fullscreenView != null) {
            onHideFullscreen()
            return
        }
        if (webView.canGoBack()) {
            webView.goBack()
            return
        }
        finish()
    }

    public override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) {
            webView.onResume()
        }
    }

    public override fun onPause() {
        if (::webView.isInitialized) {
            webView.onPause()
            CookieManager.getInstance().flush()
        }
        super.onPause()
    }

    public override fun onDestroy() {
        pendingFileChooser?.onReceiveValue(null)
        pendingFileChooser = null
        pendingPermission?.deny()
        pendingPermission = null
        pendingGeolocation?.let { (origin, callback) -> callback.invoke(origin, false, false) }
        pendingGeolocation = null
        if (::webView.isInitialized && ::root.isInitialized) {
            root.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }

    override fun onPageStarted(url: String) {
        clearError()
        progressBar.visibility = View.VISIBLE
        webView.visibility = View.VISIBLE
        rendererGone = false
    }

    override fun onPageFinished(url: String) {
        progressBar.visibility = View.GONE
        if (!rendererGone) {
            webView.visibility = View.VISIBLE
        }
    }

    override fun onMainFrameError(description: String, failingUrl: String) {
        val detail = if (failingUrl.isBlank()) description else "$description\n$failingUrl"
        showError(detail)
    }

    override fun onExternalLinkBlocked() {
        toast("No app can open that link")
    }

    override fun onHistoryChanged(canGoBack: Boolean, canGoForward: Boolean) {
        // The shell intentionally has no visible chrome to update.
    }

    override fun onRendererGone(didCrash: Boolean) {
        rendererGone = true
        showError("The page stopped responding.")
    }

    override fun onProgress(progress: Int) {
        progressBar.progress = progress
        progressBar.visibility = if (progress >= 100) View.GONE else View.VISIBLE
    }

    override fun onConsoleMessage(message: String) {
        Log.d("UrlToApk", message)
    }

    override fun onFileChooser(
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams,
    ): Boolean {
        pendingFileChooser?.onReceiveValue(null)
        pendingFileChooser = callback
        val intent = params.createIntent()
        if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        return try {
            @Suppress("DEPRECATION")
            startActivityForResult(Intent.createChooser(intent, "Choose a file"), REQUEST_FILE_CHOOSER)
            true
        } catch (e: ActivityNotFoundException) {
            pendingFileChooser = null
            callback.onReceiveValue(null)
            true
        }
    }

    @Deprecated("Deprecated in Java")
    public override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_FILE_CHOOSER) {
            return
        }
        val callback = pendingFileChooser ?: return
        pendingFileChooser = null
        callback.onReceiveValue(parseChooserResult(resultCode, data))
    }

    internal fun parseChooserResult(resultCode: Int, data: Intent?): Array<Uri>? {
        if (resultCode != RESULT_OK) {
            return null
        }
        val clip = data?.clipData
        if (clip != null && clip.itemCount > 0) {
            return Array(clip.itemCount) { clip.getItemAt(it).uri }
        }
        val uri = data?.data ?: return null
        return arrayOf(uri)
    }

    override fun onPermissionRequest(request: PermissionRequest) {
        pendingPermission?.deny()
        pendingPermission = null

        val runtime = mutableListOf<String>()
        var unsupported = false
        for (resource in request.resources) {
            when (resource) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> runtime += Manifest.permission.CAMERA
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> runtime += Manifest.permission.RECORD_AUDIO
                PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID -> Unit
                else -> unsupported = true
            }
        }
        if (unsupported) {
            request.deny()
            return
        }
        if (runtime.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) {
            request.grant(request.resources)
            return
        }
        pendingPermission = request
        requestPermissions(runtime.toTypedArray(), REQUEST_MEDIA_PERMISSIONS)
    }

    override fun onGeolocationPrompt(origin: String, callback: GeolocationPermissions.Callback) {
        pendingGeolocation?.let { (previousOrigin, previousCallback) ->
            previousCallback.invoke(previousOrigin, false, false)
        }
        if (hasLocationPermission()) {
            callback.invoke(origin, true, false)
            return
        }
        pendingGeolocation = origin to callback
        requestPermissions(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
            REQUEST_LOCATION,
        )
    }

    private fun hasLocationPermission(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            REQUEST_MEDIA_PERMISSIONS -> {
                val request = pendingPermission ?: return
                pendingPermission = null
                if (grantResults.isNotEmpty() &&
                    grantResults.all { it == PackageManager.PERMISSION_GRANTED }
                ) {
                    request.grant(request.resources)
                } else {
                    request.deny()
                }
            }
            REQUEST_LOCATION -> {
                val pending = pendingGeolocation ?: return
                pendingGeolocation = null
                val granted = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
                pending.second.invoke(pending.first, granted, false)
            }
            else -> Unit
        }
    }

    override fun onShowFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (fullscreenView != null) {
            callback.onCustomViewHidden()
            return
        }
        fullscreenView = view
        fullscreenCallback = callback
        root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        webView.visibility = View.GONE
        progressBar.visibility = View.GONE
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setSystemBarsHidden(true)
    }

    override fun onHideFullscreen() {
        val view = fullscreenView ?: return
        val callback = requireNotNull(fullscreenCallback)
        fullscreenView = null
        fullscreenCallback = null
        root.removeView(view)
        webView.visibility = View.VISIBLE
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setSystemBarsHidden(false)
        callback.onCustomViewHidden()
    }

    @Suppress("DEPRECATION")
    private fun setSystemBarsHidden(hidden: Boolean) {
        window.decorView.systemUiVisibility = if (hidden) {
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        } else {
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }

    internal fun handleDownload(
        url: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?,
    ) {
        if (downloader.enqueue(url, userAgent, contentDisposition, mimeType) == null) {
            toast("Download failed")
        }
    }

    private fun showError(description: String) {
        progressBar.visibility = View.GONE
        val existing = errorView
        if (existing != null) {
            errorDetail?.text = description
            existing.visibility = View.VISIBLE
            webView.visibility = View.INVISIBLE
            return
        }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
            setBackgroundColor(Color.TRANSPARENT)
        }
        val title = TextView(this).apply {
            text = "Couldn't load this page"
            textSize = 20f
            gravity = Gravity.CENTER
        }
        val detail = TextView(this).apply {
            text = description
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(20))
        }
        val retryButton = Button(this).apply {
            text = "Retry"
            setOnClickListener { retry() }
        }
        layout.addView(title)
        layout.addView(detail)
        layout.addView(retryButton)
        root.addView(layout, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        errorView = layout
        errorDetail = detail
        webView.visibility = View.INVISIBLE
    }

    private fun clearError() {
        val existing = errorView ?: return
        root.removeView(existing)
        errorView = null
        errorDetail = null
        webView.visibility = View.VISIBLE
    }

    private fun retry() {
        clearError()
        rendererGone = false
        webView.visibility = View.VISIBLE
        webView.loadUrl(config.url)
    }

    private fun showFatalError(message: String) {
        val text = TextView(this).apply {
            text = message
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        setContentView(text)
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).roundToInt()
}

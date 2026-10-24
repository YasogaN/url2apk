package com.urltoapk.shell

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Insets
import android.net.Uri
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowToast

@RunWith(RobolectricTestRunner::class)
class MainActivityTest {
    private val application = RuntimeEnvironment.getApplication()

    class SuffixActivity : MainActivity() {
        override fun loadConfig(): ShellConfig =
            ShellConfig(url = "https://example.com/", userAgentSuffix = "Test/1.0")
    }

    class FatalActivity : MainActivity() {
        override fun loadConfig(): ShellConfig = throw ConfigException("broken config")
    }

    class ThrowingFileChooserActivity : MainActivity() {
        @Deprecated("Deprecated in Java")
        override fun startActivityForResult(intent: Intent?, requestCode: Int) {
            throw ActivityNotFoundException()
        }
    }

    class NoDownloadActivity : MainActivity() {
        override fun createDownloader(): Downloader = Downloader { _, _, _, _ -> null }
    }

    private class RecordingCallback : ValueCallback<Array<Uri>> {
        val values = mutableListOf<Array<Uri>?>()
        override fun onReceiveValue(value: Array<Uri>?) {
            values += value
        }
    }

    private class FakeChooserParams(
        private val mode: Int = WebChromeClient.FileChooserParams.MODE_OPEN,
    ) : WebChromeClient.FileChooserParams() {
        override fun getMode(): Int = mode
        override fun getAcceptTypes(): Array<String> = arrayOf("*/*")
        override fun isCaptureEnabled(): Boolean = false
        override fun getTitle(): CharSequence = "Pick a file"
        override fun getFilenameHint(): String = "upload"
        override fun createIntent(): Intent = Intent(Intent.ACTION_GET_CONTENT)
    }

    private class FakePermissionRequest(
        private val resources: Array<String>,
    ) : PermissionRequest() {
        var granted: Array<String>? = null
        var denied = false
        override fun getOrigin(): Uri = Uri.parse("https://example.com")
        override fun getResources(): Array<String> = resources
        override fun grant(requestedResources: Array<String>) {
            granted = requestedResources
        }

        override fun deny() {
            denied = true
        }
    }

    private class FakeGeoCallback : GeolocationPermissions.Callback {
        val calls = mutableListOf<Triple<String?, Boolean, Boolean>>()
        override fun invoke(origin: String?, allow: Boolean, retain: Boolean) {
            calls += Triple(origin, allow, retain)
        }
    }

    private class FakeCustomView : WebChromeClient.CustomViewCallback {
        var hidden = 0
        override fun onCustomViewHidden() {
            hidden++
        }
    }

    @Before
    fun resetToasts() {
        ShadowToast.reset()
    }

    private fun launch(clazz: Class<out MainActivity> = MainActivity::class.java): MainActivity =
        Robolectric.buildActivity(clazz).setup().get()

    private inline fun <reified T : View> View.findView(): T? = findViewByType(T::class.java)

    private fun <T : View> View.findViewByType(type: Class<T>): T? {
        if (type.isInstance(this)) {
            return type.cast(this)
        }
        if (this is ViewGroup) {
            for (index in 0 until childCount) {
                getChildAt(index).findViewByType(type)?.let { return it }
            }
        }
        return null
    }

    private inline fun <reified T : View> View.findViews(): List<T> = findViewsByType(T::class.java)

    private fun <T : View> View.findViewsByType(type: Class<T>): List<T> {
        val found = mutableListOf<T>()
        if (type.isInstance(this)) {
            found += type.cast(this)!!
        }
        if (this is ViewGroup) {
            for (index in 0 until childCount) {
                found += getChildAt(index).findViewsByType(type)
            }
        }
        return found
    }

    private inline fun <reified T : View> Activity.findView(): T? = window.decorView.findView<T>()
    private inline fun <reified T : View> Activity.findViews(): List<T> = window.decorView.findViews<T>()

    private fun MainActivity.webView(): WebView = findView<WebView>()!!
    private fun MainActivity.progress(): ProgressBar = findView<ProgressBar>()!!
    private fun MainActivity.contentRoot(): FrameLayout =
        findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as FrameLayout

    private fun grant(vararg permissions: String) {
        Shadows.shadowOf(application).grantPermissions(*permissions)
    }

    private fun deny(vararg permissions: String) {
        Shadows.shadowOf(application).denyPermissions(*permissions)
    }

    @Test
    fun `loads the configured url and configures the webview`() {
        val activity = launch()
        val webView = activity.webView()

        assertEquals("https://example.com/", Shadows.shadowOf(webView).lastLoadedUrl)
        assertTrue(webView.settings.javaScriptEnabled)
        assertTrue(webView.settings.domStorageEnabled)
        assertFalse(webView.settings.allowFileAccess)
        assertFalse(webView.settings.allowContentAccess)
        assertNotNull(webView.webViewClient)
        assertNotNull(webView.webChromeClient)
        assertTrue(webView.webViewClient is ShellWebViewClient)
        assertTrue(webView.webChromeClient is ShellWebChromeClient)
        assertNotNull(Shadows.shadowOf(webView).downloadListener)
        assertTrue(android.webkit.CookieManager.getInstance().acceptCookie())
        assertEquals(View.VISIBLE, webView.visibility)
    }

    @Test
    fun `appends the configured user agent suffix`() {
        val activity = launch(SuffixActivity::class.java)
        assertTrue(activity.webView().settings.userAgentString.endsWith(" Test/1.0"))
    }

    @Test
    fun `shows a fatal error for invalid config`() {
        val activity = launch(FatalActivity::class.java)
        val text = activity.findView<TextView>()
        assertNotNull(text)
        assertEquals("broken config", text!!.text.toString())
        assertNull(activity.findView<WebView>())
        activity.onPause()
        activity.onResume()
        activity.onDestroy()
    }

    @Test
    fun `updates progress and clears it on finish`() {
        val activity = launch()
        val progress = activity.progress()
        activity.onPageStarted("https://example.com/")
        assertEquals(View.VISIBLE, progress.visibility)
        activity.onProgress(0)
        assertEquals(0, progress.progress)
        assertEquals(View.VISIBLE, progress.visibility)
        activity.onProgress(40)
        assertEquals(40, progress.progress)
        assertEquals(View.VISIBLE, progress.visibility)
        activity.onProgress(100)
        assertEquals(View.GONE, progress.visibility)
        activity.onPageFinished("https://example.com/")
        assertEquals(View.GONE, progress.visibility)
        activity.onConsoleMessage("hello")
        activity.onHistoryChanged(true, false)
    }

    @Test
    fun `shows and retries a main frame error`() {
        val activity = launch()
        val webView = activity.webView()
        activity.onMainFrameError("boom", "https://example.com/")

        val button = activity.findView<Button>()
        assertNotNull(button)
        assertEquals(View.INVISIBLE, webView.visibility)
        assertEquals(View.GONE, activity.progress().visibility)
        assertTrue(activity.findViews<TextView>().any { it.text.contains("boom") })
        assertTrue(activity.findViews<TextView>().any { it.text.contains("https://example.com/") })

        activity.onMainFrameError("second", "")
        assertTrue(activity.findViews<TextView>().any { it.text.contains("second") })
        assertEquals(1, activity.findViews<Button>().size)

        button!!.performClick()
        assertEquals("https://example.com/", Shadows.shadowOf(webView).lastLoadedUrl)
        assertEquals(View.VISIBLE, webView.visibility)
        assertNull(activity.findView<Button>())
    }

    @Test
    fun `page start clears an existing error`() {
        val activity = launch()
        activity.onMainFrameError("boom", "https://example.com/")
        assertNotNull(activity.findView<Button>())
        activity.onPageStarted("https://example.com/")
        assertNull(activity.findView<Button>())
        assertEquals(View.VISIBLE, activity.webView().visibility)
    }

    @Test
    fun `renderer failure shows an error and retry recovers`() {
        val activity = launch()
        val webView = activity.webView()
        activity.onRendererGone(true)
        assertNotNull(activity.findView<Button>())
        activity.onPageFinished("https://example.com/")
        assertEquals(View.INVISIBLE, webView.visibility)

        activity.findView<Button>()!!.performClick()
        activity.onPageFinished("https://example.com/")
        assertEquals(View.VISIBLE, webView.visibility)
    }

    @Test
    fun `toasts when an external link has no handler`() {
        val activity = launch()
        activity.onExternalLinkBlocked()
        assertEquals("No app can open that link", ShadowToast.getTextOfLatestToast())
    }

    @Test
    fun `goes back in history before finishing`() {
        val activity = launch()
        val webView = activity.webView()
        Shadows.shadowOf(webView).setCanGoBack(true)
        activity.onBackPressed()
        assertEquals(1, Shadows.shadowOf(webView).goBackInvocations)
        assertFalse(activity.isFinishing)
    }

    @Test
    fun `finishes at the root of history`() {
        val activity = launch()
        Shadows.shadowOf(activity.webView()).setCanGoBack(false)
        activity.onBackPressed()
        assertTrue(activity.isFinishing)
    }

    @Test
    fun `hides fullscreen before navigating back`() {
        val activity = launch()
        val view = View(activity)
        val callback = FakeCustomView()
        activity.onShowFullscreen(view, callback)
        activity.onBackPressed()
        assertNull(view.parent)
        assertEquals(1, callback.hidden)
        assertFalse(activity.isFinishing)
    }

    @Test
    fun `shows and hides a fullscreen view`() {
        val activity = launch()
        val webView = activity.webView()
        val view = View(activity)
        val callback = FakeCustomView()

        activity.onShowFullscreen(view, callback)
        assertNotNull(view.parent)
        assertEquals(View.GONE, webView.visibility)
        assertEquals(View.GONE, activity.progress().visibility)
        assertTrue(
            activity.window.decorView.systemUiVisibility and View.SYSTEM_UI_FLAG_FULLSCREEN != 0,
        )

        val duplicate = FakeCustomView()
        activity.onShowFullscreen(View(activity), duplicate)
        assertEquals(1, duplicate.hidden)

        activity.onHideFullscreen()
        assertNull(view.parent)
        assertEquals(View.VISIBLE, webView.visibility)
        assertEquals(1, callback.hidden)
        assertEquals(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE,
            activity.window.decorView.systemUiVisibility,
        )

        activity.onHideFullscreen()
    }

    @Test
    fun `parses multiple chooser results`() {
        val activity = launch()
        val clip = android.content.ClipData.newUri(
            activity.contentResolver,
            "files",
            Uri.parse("content://example/1"),
        )
        clip.addItem(android.content.ClipData.Item(Uri.parse("content://example/2")))
        val data = Intent()
        data.clipData = clip
        val result = activity.parseChooserResult(Activity.RESULT_OK, data)
        assertEquals(2, result!!.size)
        assertEquals("content://example/2", result[1].toString())
    }

    @Test
    fun `ignores empty chooser results`() {
        val activity = launch()
        assertNull(activity.parseChooserResult(Activity.RESULT_CANCELED, null))
        assertNull(activity.parseChooserResult(Activity.RESULT_OK, null))
        assertNull(activity.parseChooserResult(Activity.RESULT_OK, Intent()))
    }

    @Test
    fun `returns file chooser results to the webview`() {
        val activity = launch()
        val callback = RecordingCallback()
        assertTrue(activity.onFileChooser(callback, FakeChooserParams()))

        val started = Shadows.shadowOf(activity).nextStartedActivityForResult
        assertEquals(MainActivity.REQUEST_FILE_CHOOSER, started.requestCode)
        val chooser = started.intent
        assertNotNull(chooser)
        @Suppress("DEPRECATION")
        val target = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
        assertNotNull(target)
        assertEquals(Intent.ACTION_GET_CONTENT, target!!.action)
        assertFalse(target.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false))

        @Suppress("DEPRECATION")
        activity.onActivityResult(
            MainActivity.REQUEST_FILE_CHOOSER,
            Activity.RESULT_OK,
            Intent().setData(Uri.parse("content://example/file")),
        )
        assertEquals(1, callback.values.size)
        assertEquals("content://example/file", callback.values[0]!![0].toString())
    }

    @Test
    fun `passes multiple selection through the chooser`() {
        val activity = launch()
        val callback = RecordingCallback()
        activity.onFileChooser(
            callback,
            FakeChooserParams(WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE),
        )
        val chooser = Shadows.shadowOf(activity).nextStartedActivityForResult.intent
        @Suppress("DEPRECATION")
        val target = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
        assertTrue(target!!.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false))
    }

    @Test
    fun `cancels a previous file chooser and handles cancellation`() {
        val activity = launch()
        val first = RecordingCallback()
        val second = RecordingCallback()
        activity.onFileChooser(first, FakeChooserParams())
        activity.onFileChooser(second, FakeChooserParams())
        assertNull(first.values[0])

        @Suppress("DEPRECATION")
        activity.onActivityResult(
            MainActivity.REQUEST_FILE_CHOOSER,
            Activity.RESULT_CANCELED,
            null,
        )
        assertNull(second.values.last())
    }

    @Test
    fun `ignores activity results without a pending chooser`() {
        val activity = launch()
        @Suppress("DEPRECATION")
        activity.onActivityResult(MainActivity.REQUEST_FILE_CHOOSER, Activity.RESULT_OK, null)
        @Suppress("DEPRECATION")
        activity.onActivityResult(999, Activity.RESULT_OK, null)
    }

    @Test
    fun `cancels the chooser when it cannot be started`() {
        val activity = launch(ThrowingFileChooserActivity::class.java)
        val callback = RecordingCallback()
        assertTrue(activity.onFileChooser(callback, FakeChooserParams()))
        assertNull(callback.values[0])
    }

    @Test
    fun `cancels a pending chooser on destroy`() {
        val activity = launch()
        val callback = RecordingCallback()
        activity.onFileChooser(callback, FakeChooserParams())
        activity.onDestroy()
        assertNull(callback.values[0])
    }

    @Test
    fun `grants already granted media permissions`() {
        grant(Manifest.permission.CAMERA)
        val activity = launch()
        val request = FakePermissionRequest(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        activity.onPermissionRequest(request)
        assertArrayEquals(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE), request.granted)
        assertFalse(request.denied)
    }

    @Test
    fun `requests missing media permissions and grants on approval`() {
        deny(Manifest.permission.CAMERA)
        val activity = launch()
        val request = FakePermissionRequest(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        activity.onPermissionRequest(request)

        val pending = Shadows.shadowOf(activity).lastRequestedPermission
        assertEquals(MainActivity.REQUEST_MEDIA_PERMISSIONS, pending.requestCode)
        assertTrue(pending.requestedPermissions.contains(Manifest.permission.CAMERA))

        activity.onRequestPermissionsResult(
            MainActivity.REQUEST_MEDIA_PERMISSIONS,
            arrayOf(Manifest.permission.CAMERA),
            intArrayOf(PackageManager.PERMISSION_GRANTED),
        )
        assertNotNull(request.granted)
    }

    @Test
    fun `denies media permissions on rejection or empty results`() {
        deny(Manifest.permission.CAMERA)
        val activity = launch()

        val rejected = FakePermissionRequest(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        activity.onPermissionRequest(rejected)
        activity.onRequestPermissionsResult(
            MainActivity.REQUEST_MEDIA_PERMISSIONS,
            arrayOf(Manifest.permission.CAMERA),
            intArrayOf(PackageManager.PERMISSION_DENIED),
        )
        assertTrue(rejected.denied)

        val empty = FakePermissionRequest(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        activity.onPermissionRequest(empty)
        activity.onRequestPermissionsResult(
            MainActivity.REQUEST_MEDIA_PERMISSIONS,
            emptyArray(),
            intArrayOf(),
        )
        assertTrue(empty.denied)
    }

    @Test
    fun `handles protected media and unsupported resources`() {
        deny(Manifest.permission.CAMERA)
        val activity = launch()

        val protectedMedia = FakePermissionRequest(
            arrayOf(PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID),
        )
        activity.onPermissionRequest(protectedMedia)
        assertNotNull(protectedMedia.granted)

        val unsupported = FakePermissionRequest(arrayOf("unsupported"))
        activity.onPermissionRequest(unsupported)
        assertTrue(unsupported.denied)
    }

    @Test
    fun `requests audio capture`() {
        deny(Manifest.permission.RECORD_AUDIO)
        val activity = launch()
        val request = FakePermissionRequest(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        activity.onPermissionRequest(request)
        assertTrue(
            Shadows.shadowOf(activity).lastRequestedPermission.requestedPermissions
                .contains(Manifest.permission.RECORD_AUDIO),
        )
        activity.onRequestPermissionsResult(
            MainActivity.REQUEST_MEDIA_PERMISSIONS,
            arrayOf(Manifest.permission.RECORD_AUDIO),
            intArrayOf(PackageManager.PERMISSION_GRANTED),
        )
        assertNotNull(request.granted)
    }

    @Test
    fun `replaces a pending permission request`() {
        deny(Manifest.permission.CAMERA)
        val activity = launch()
        val first = FakePermissionRequest(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        activity.onPermissionRequest(first)
        val second = FakePermissionRequest(arrayOf(PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID))
        activity.onPermissionRequest(second)
        assertTrue(first.denied)
        assertNotNull(second.granted)
    }

    @Test
    fun `ignores media results without a pending request`() {
        val activity = launch()
        activity.onRequestPermissionsResult(
            MainActivity.REQUEST_MEDIA_PERMISSIONS,
            emptyArray(),
            intArrayOf(),
        )
        activity.onRequestPermissionsResult(999, emptyArray(), intArrayOf())
    }

    @Test
    fun `grants geolocation when permission is already present`() {
        grant(Manifest.permission.ACCESS_FINE_LOCATION)
        val activity = launch()
        val callback = FakeGeoCallback()
        activity.onGeolocationPrompt("https://example.com", callback)
        assertEquals(Triple("https://example.com", true, false), callback.calls.single())
    }

    @Test
    fun `grants geolocation with coarse permission`() {
        grant(Manifest.permission.ACCESS_COARSE_LOCATION)
        val activity = launch()
        val callback = FakeGeoCallback()
        activity.onGeolocationPrompt("https://example.com", callback)
        assertEquals(true, callback.calls.single().second)
    }

    @Test
    fun `requests geolocation and forwards the result`() {
        deny(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        val activity = launch()
        val callback = FakeGeoCallback()
        activity.onGeolocationPrompt("https://example.com", callback)

        val pending = Shadows.shadowOf(activity).lastRequestedPermission
        assertEquals(MainActivity.REQUEST_LOCATION, pending.requestCode)
        assertTrue(pending.requestedPermissions.contains(Manifest.permission.ACCESS_FINE_LOCATION))

        activity.onRequestPermissionsResult(
            MainActivity.REQUEST_LOCATION,
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION),
            intArrayOf(PackageManager.PERMISSION_GRANTED),
        )
        assertEquals(true, callback.calls.single().second)
    }

    @Test
    fun `denies geolocation when the request is rejected`() {
        deny(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        val activity = launch()
        val callback = FakeGeoCallback()
        activity.onGeolocationPrompt("https://example.com", callback)
        activity.onRequestPermissionsResult(
            MainActivity.REQUEST_LOCATION,
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION),
            intArrayOf(PackageManager.PERMISSION_DENIED),
        )
        assertEquals(false, callback.calls.single().second)
    }

    @Test
    fun `denies geolocation for empty results and replaces a pending prompt`() {
        deny(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        val activity = launch()
        val first = FakeGeoCallback()
        val second = FakeGeoCallback()
        activity.onGeolocationPrompt("https://first.example", first)
        activity.onGeolocationPrompt("https://second.example", second)
        assertEquals(false, first.calls.single().second)

        activity.onRequestPermissionsResult(
            MainActivity.REQUEST_LOCATION,
            emptyArray(),
            intArrayOf(),
        )
        assertEquals(false, second.calls.single().second)
    }

    @Test
    fun `ignores location results without a pending prompt`() {
        val activity = launch()
        activity.onRequestPermissionsResult(
            MainActivity.REQUEST_LOCATION,
            emptyArray(),
            intArrayOf(),
        )
    }

    @Test
    fun `toasts when a download cannot be enqueued`() {
        val activity = launch(NoDownloadActivity::class.java)
        activity.handleDownload("https://example.com/file.pdf", null, null, null)
        assertEquals("Download failed", ShadowToast.getTextOfLatestToast())
    }

    @Test
    fun `enqueues a download from the webview listener`() {
        val activity = launch()
        activity.handleDownload(
            "https://example.com/file.pdf",
            "Agent",
            "attachment; filename=\"file.pdf\"",
            "application/pdf",
        )
        assertNull(ShadowToast.getTextOfLatestToast())
    }

    @Test
    fun `uses the download listener on the webview`() {
        val activity = launch(NoDownloadActivity::class.java)
        Shadows.shadowOf(activity.webView()).downloadListener.onDownloadStart(
            "https://example.com/file.pdf",
            "Agent",
            "attachment",
            "application/pdf",
            1L,
        )
        assertEquals("Download failed", ShadowToast.getTextOfLatestToast())
    }

    @Test
    fun `applies system bar insets`() {
        val activity = launch()
        val root = activity.contentRoot()
        val insets = WindowInsets.Builder()
            .setInsets(WindowInsets.Type.systemBars(), Insets.of(1, 2, 3, 4))
            .build()
        root.dispatchApplyWindowInsets(insets)
        assertEquals(1, root.paddingLeft)
        assertEquals(2, root.paddingTop)
        assertEquals(3, root.paddingRight)
        assertEquals(4, root.paddingBottom)
    }

    @Test
    fun `pads the root for the ime`() {
        val activity = launch()
        val root = activity.contentRoot()
        val insets = WindowInsets.Builder()
            .setInsets(WindowInsets.Type.systemBars(), Insets.of(1, 2, 3, 4))
            .setInsets(WindowInsets.Type.ime(), Insets.of(0, 0, 0, 600))
            .build()
        val result = root.dispatchApplyWindowInsets(insets)
        assertEquals(1, root.paddingLeft)
        assertEquals(2, root.paddingTop)
        assertEquals(3, root.paddingRight)
        assertEquals(600, root.paddingBottom)
        assertTrue(result.isConsumed)
    }

    @Test
    @Config(sdk = [29])
    fun `does not use edge to edge before api 30`() {
        val activity = launch()
        assertEquals(0, activity.contentRoot().paddingTop)
    }

    @Test
    fun `cancels pending work on destroy`() {
        deny(Manifest.permission.CAMERA)
        deny(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        val activity = launch()
        val permission = FakePermissionRequest(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        activity.onPermissionRequest(permission)
        val geo = FakeGeoCallback()
        activity.onGeolocationPrompt("https://example.com", geo)

        activity.onDestroy()
        assertTrue(permission.denied)
        assertEquals(false, geo.calls.single().second)
    }

    @Test
    fun `pauses and resumes the webview`() {
        val activity = launch()
        activity.onPause()
        activity.onResume()
        activity.onDestroy()
    }
}

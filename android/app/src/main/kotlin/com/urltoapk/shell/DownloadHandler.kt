package com.urltoapk.shell

import android.app.DownloadManager
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.URLUtil

fun interface Downloader {
    fun enqueue(
        url: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?,
    ): Long?
}

class DownloadHandler(
    private val manager: DownloadManager,
    private val cookieProvider: (String) -> String? = { CookieManager.getInstance().getCookie(it) },
) : Downloader {
    override fun enqueue(
        url: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?,
    ): Long? {
        val name = fileName(url, contentDisposition, mimeType)
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle(name)
            .setDescription(url)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)

        userAgent?.let { request.addRequestHeader("User-Agent", it) }
        cookieProvider(url)?.let { request.addRequestHeader("Cookie", it) }

        return try {
            manager.enqueue(request)
        } catch (e: SecurityException) {
            null
        } catch (e: IllegalArgumentException) {
            null
        }
    }

    internal fun fileName(
        url: String,
        contentDisposition: String?,
        mimeType: String?,
    ): String = URLUtil.guessFileName(url, contentDisposition, mimeType)
}

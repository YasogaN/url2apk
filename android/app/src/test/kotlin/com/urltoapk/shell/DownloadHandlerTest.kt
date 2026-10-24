package com.urltoapk.shell

import android.app.DownloadManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows

@RunWith(RobolectricTestRunner::class)
class DownloadHandlerTest {
    private val manager = RuntimeEnvironment.getApplication()
        .getSystemService(DownloadManager::class.java)

    @Test
    fun `guesses a filename from the disposition`() {
        val handler = DownloadHandler(manager)
        assertEquals(
            "report.pdf",
            handler.fileName(
                "https://example.com/download",
                "attachment; filename=\"report.pdf\"",
                "application/pdf",
            ),
        )
    }

    @Test
    fun `guesses a filename from the url`() {
        val handler = DownloadHandler(manager)
        assertEquals(
            "file.pdf",
            handler.fileName("https://example.com/file.pdf", null, "application/pdf"),
        )
    }

    @Test
    fun `enqueues a download with a cookie and user agent`() {
        val handler = DownloadHandler(manager) { "session=1" }
        val id = handler.enqueue(
            "https://example.com/report.pdf",
            "TestAgent",
            "attachment; filename=\"report.pdf\"",
            "application/pdf",
        )
        assertNotNull(id)
        assertEquals(1, Shadows.shadowOf(manager).requestCount)
    }

    @Test
    fun `enqueues a download without a cookie or user agent`() {
        val handler = DownloadHandler(manager) { null }
        val id = handler.enqueue("https://example.com/report.pdf", null, null, null)
        assertNotNull(id)
        assertEquals(1, Shadows.shadowOf(manager).requestCount)
    }

    @Test
    fun `returns null when storage is unavailable`() {
        val mock = Mockito.mock(DownloadManager::class.java)
        Mockito.`when`(mock.enqueue(Mockito.any(DownloadManager.Request::class.java)))
            .thenThrow(SecurityException("no storage"))
        assertNull(
            DownloadHandler(mock) { null }.enqueue(
                "https://example.com/report.pdf",
                null,
                null,
                null,
            ),
        )
    }

    @Test
    fun `returns null for an invalid request`() {
        val mock = Mockito.mock(DownloadManager::class.java)
        Mockito.`when`(mock.enqueue(Mockito.any(DownloadManager.Request::class.java)))
            .thenThrow(IllegalArgumentException("bad uri"))
        assertNull(
            DownloadHandler(mock) { null }.enqueue(
                "https://example.com/report.pdf",
                null,
                null,
                null,
            ),
        )
    }
}

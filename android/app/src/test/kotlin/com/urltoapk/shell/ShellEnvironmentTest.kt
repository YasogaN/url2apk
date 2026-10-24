package com.urltoapk.shell

import android.content.pm.ApplicationInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShellEnvironmentTest {
    @Test
    fun `leaves the user agent alone without a suffix`() {
        assertEquals("original", ShellEnvironment.userAgent("original", null))
    }

    @Test
    fun `appends the user agent suffix`() {
        assertEquals("original Custom/1.0", ShellEnvironment.userAgent("original", "Custom/1.0"))
    }

    @Test
    fun `detects a debuggable application`() {
        assertTrue(ShellEnvironment.isDebuggable(ApplicationInfo.FLAG_DEBUGGABLE))
        assertFalse(ShellEnvironment.isDebuggable(0))
    }
}

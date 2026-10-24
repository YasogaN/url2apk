package com.urltoapk.shell

import android.content.pm.ApplicationInfo

object ShellEnvironment {
    fun userAgent(original: String, suffix: String?): String =
        if (suffix == null) original else "$original $suffix"

    fun isDebuggable(flags: Int): Boolean =
        (flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
}

package com.urltoapk.shell

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

/**
 * Placeholder until the WebView host lands; this exists so the toolchain can be
 * validated independently of the shell implementation.
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply { text = "URL to APK" })
    }
}

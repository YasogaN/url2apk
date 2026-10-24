package com.urltoapk.shell

import android.content.res.AssetManager
import java.io.IOException

/** Injectable so the loader can be tested without an Android runtime. */
fun interface ConfigSource {
    fun read(): String
}

class AssetConfigSource(private val assets: AssetManager) : ConfigSource {
    override fun read(): String {
        val reader = assets.open("config.json").bufferedReader(Charsets.UTF_8)
        try {
            return reader.readText()
        } finally {
            reader.close()
        }
    }
}

class ConfigLoader(private val source: ConfigSource) {
    fun load(): ShellConfig {
        val text = try {
            source.read()
        } catch (e: IOException) {
            throw ConfigException("assets/config.json could not be read", e)
        }
        return ShellConfig.parse(text)
    }
}

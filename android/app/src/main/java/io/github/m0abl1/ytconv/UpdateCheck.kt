package io.github.m0abl1.ytconv

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * ytconv is only distributed through GitHub Releases, so the app looks there
 * for a newer version when it opens and offers the APK.
 */
object UpdateCheck {
    private const val LATEST = "https://api.github.com/repos/M0abl1/youtube_converter/releases/latest"
    const val APK = "https://github.com/M0abl1/youtube_converter/releases/latest/download/ytconv-android.apk"

    private var done = false

    fun run(activity: Activity) {
        val current = BuildConfig.VERSION_NAME
        if (done || current.contains("dev")) return
        done = true
        Thread {
            val latest = runCatching { fetchLatestTag() }.getOrNull() ?: return@Thread
            if (!isNewer(latest, current)) return@Thread
            activity.runOnUiThread {
                if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
                AlertDialog.Builder(activity)
                    .setTitle(R.string.update_title)
                    .setMessage(activity.getString(R.string.update_message, latest, current))
                    .setPositiveButton(R.string.update_download) { _, _ ->
                        runCatching { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(APK))) }
                    }
                    .setNegativeButton(R.string.update_later, null)
                    .show()
            }
        }.start()
    }

    private fun fetchLatestTag(): String? {
        val conn = URL(LATEST).openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        conn.setRequestProperty("User-Agent", "ytconv-android")
        try {
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val release = JSONObject(body)
            val assets = release.getJSONArray("assets")
            for (i in 0 until assets.length()) {
                if (assets.getJSONObject(i).optString("name") == "ytconv-android.apk") {
                    return release.getString("tag_name").removePrefix("v")
                }
            }
            return null
        } finally {
            conn.disconnect()
        }
    }

    /** Compares dotted versions numerically: 1.10.0 is newer than 1.9.2. */
    fun isNewer(latest: String, current: String): Boolean {
        val a = latest.split('.', '-').mapNotNull { it.toIntOrNull() }
        val b = current.split('.', '-').mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }
}

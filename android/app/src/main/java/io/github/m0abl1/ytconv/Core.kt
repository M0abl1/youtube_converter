package io.github.m0abl1.ytconv

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import android.webkit.MimeTypeMap
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import io.github.m0abl1.ytcore.Host
import io.github.m0abl1.ytcore.Ytcore
import java.io.File

/**
 * Starts the Go core and does for it what a phone does differently from a
 * desktop. The Go side calls these methods from its own threads.
 */
object Core : Host {
    private lateinit var app: Context
    private val main = Handler(Looper.getMainLooper())

    /** Starts the server once per process and returns the page address. */
    fun start(context: Context): String {
        app = context.applicationContext
        val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val out = File(downloads, "ytconv")
        return Ytcore.start(app.filesDir.path, app.cacheDir.path, out.path, BuildConfig.VERSION_NAME, this)
    }

    /** Opens a saved file in an app that plays it. */
    override fun reveal(path: String) {
        val file = File(path)
        val uri = FileProvider.getUriForFile(app, "${app.packageName}.files", file)
        val view = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, mimeType(file))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            app.startActivity(
                Intent.createChooser(view, null)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            )
        } catch (e: ActivityNotFoundException) {
            throw Exception("no app can open this file")
        }
    }

    /** Opens a folder in the Files app, or the Downloads screen as a fallback. */
    override fun openFolder(dir: String) {
        val root = Environment.getExternalStorageDirectory().path
        val tries = mutableListOf<Intent>()
        if (dir.startsWith(root)) {
            val rel = dir.removePrefix(root).trim('/')
            val uri = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:$rel")
            tries += Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        tries += Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)
        for (intent in tries) {
            try {
                app.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            } catch (_: ActivityNotFoundException) {
            } catch (_: SecurityException) {
            }
        }
        throw Exception("could not open the folder")
    }

    /** Makes a new file show up in the gallery and music apps. */
    override fun saved(path: String) {
        MediaScannerConnection.scanFile(app, arrayOf(path), null, null)
    }

    /** Keeps the process alive with a notification while downloads run. */
    override fun busy(busy: Boolean) {
        main.post {
            val service = Intent(app, DownloadService::class.java)
            try {
                if (busy) ContextCompat.startForegroundService(app, service) else app.stopService(service)
            } catch (_: Exception) {
                // Started from the background (Android 12+ refuses): the
                // download still runs while the process lives.
            }
        }
    }

    private fun mimeType(file: File): String {
        val ext = file.extension.lowercase()
        return when (ext) {
            "opus" -> "audio/ogg"
            "webm" -> "video/webm"
            "mkv" -> "video/x-matroska"
            else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
        }
    }
}

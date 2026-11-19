package io.github.m0abl1.ytconv

import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import io.github.m0abl1.ytcore.Host
import io.github.m0abl1.ytcore.Transfer
import io.github.m0abl1.ytcore.Ytcore
import java.io.File
import java.util.concurrent.ExecutionException
import java.util.concurrent.FutureTask

/**
 * Starts the Go core and does for it what a phone does differently from a
 * desktop. The Go side calls these methods from its own threads.
 */
object Core : Host {
    private lateinit var app: Context
    private lateinit var downloads: File
    private val main = Handler(Looper.getMainLooper())
    // Accessed only on the main thread.
    private var activity: Activity? = null
    private var downloadsActive = false
    private var serviceRequested = false
    private var downloadService: DownloadService? = null

    /** Starts the server once per process and returns the page address. */
    fun start(context: Context): String {
        if (!::app.isInitialized) {
            app = context.applicationContext
            downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        }
        val out = File(downloads, "ytconv")
        return Ytcore.start(app.filesDir.path, app.cacheDir.path, out.path, BuildConfig.VERSION_NAME, this)
    }

    /** Opens a saved file in an app that plays it. */
    override fun reveal(path: String) {
        val file = File(path)
        val uri = if (Build.VERSION.SDK_INT >= 29) {
            SharedDownloads(app.contentResolver, downloads).find(file) ?: throw Exception("the download is gone")
        } else {
            FileProvider.getUriForFile(app, "${app.packageName}.files", file)
        }
        val view = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, downloadMimeType(file))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        onActivity { owner ->
            try {
                owner.startActivity(Intent.createChooser(view, null))
            } catch (_: ActivityNotFoundException) {
                throw Exception("no app can open this file")
            }
        }
    }

    /** Opens a folder in the Files app, or the Downloads screen as a fallback. */
    override fun openFolder(dir: String) {
        val root = Environment.getExternalStorageDirectory().path
        val tries = mutableListOf<Intent>()
        if (dir.startsWith("$root/")) {
            val rel = dir.removePrefix("$root/")
            val uri = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:$rel")
            tries += Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        tries += Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)
        onActivity { owner ->
            for (intent in tries) {
                try {
                    owner.startActivity(intent)
                    return@onActivity
                } catch (_: ActivityNotFoundException) {
                } catch (_: SecurityException) {
                }
            }
            throw Exception("could not open the folder")
        }
    }

    /** Makes a new file show up in the gallery and music apps. */
    override fun saved(path: String) {
        if (Build.VERSION.SDK_INT < 29) {
            MediaScannerConnection.scanFile(app, arrayOf(path), null, null)
        }
    }

    override fun scopedStorage(): Boolean = Build.VERSION.SDK_INT >= 29

    override fun publish(stagedPath: String, dir: String, transfer: Transfer): String {
        if (Build.VERSION.SDK_INT < 29) throw IllegalStateException("MediaStore downloads require Android 10")
        return SharedDownloads(app.contentResolver, downloads).publish(File(stagedPath), File(dir), transfer).path
    }

    override fun fileExists(path: String): Boolean {
        if (Build.VERSION.SDK_INT < 29) return File(path).isFile
        return SharedDownloads(app.contentResolver, downloads).find(File(path)) != null
    }

    /** Keeps the process alive with a notification while downloads run. */
    override fun busy(busy: Boolean) {
        main.post {
            downloadsActive = busy
            if (busy) {
                ensureDownloadService()
            } else if (downloadService != null) {
                downloadService?.stopSelf()
                serviceRequested = false
            }
        }
    }

    fun resumed(owner: Activity) {
        activity = owner
        ensureDownloadService()
    }

    fun paused(owner: Activity) {
        if (activity === owner) activity = null
    }

    fun foreground(service: DownloadService, startId: Int) {
        downloadService = service
        if (!downloadsActive) {
            service.stopSelf(startId)
            serviceRequested = false
        }
    }

    fun serviceDestroyed(service: DownloadService) {
        if (downloadService === service) downloadService = null
    }

    private fun ensureDownloadService() {
        if (!downloadsActive || serviceRequested || activity == null) return
        try {
            ContextCompat.startForegroundService(app, Intent(app, DownloadService::class.java))
            serviceRequested = true
        } catch (_: IllegalStateException) {
            // The activity may have just lost foreground eligibility. Retry
            // when it next resumes while downloads are active.
        }
    }

    private fun onActivity(action: (Activity) -> Unit) {
        val task = FutureTask {
            action(activity ?: throw IllegalStateException("ytconv is not in the foreground"))
        }
        if (Looper.myLooper() == main.looper) task.run() else main.post(task)
        try {
            task.get()
        } catch (e: ExecutionException) {
            throw (e.cause as? Exception ?: e)
        }
    }
}

package io.github.m0abl1.ytconv

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * The whole interface is ytconv's web page, served by the Go core on
 * 127.0.0.1 inside this process and shown in a WebView.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var baseUrl: String? = null
    private var localOrigin: Uri? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this).apply {
            setBackgroundColor(getColor(R.color.page))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // language and last folder
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webChromeClient = WebChromeClient() // confirm() and alert()
            webViewClient = object : WebViewClient() {
                // Only the local page stays inside the app; any other link
                // opens in the browser.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url
                    val origin = localOrigin
                    if (origin != null && url.scheme == origin.scheme && url.encodedAuthority == origin.encodedAuthority) {
                        return false
                    }
                    if (request.isForMainFrame && url.scheme == "https") {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                    }
                    return true
                }
            }
        }
        setContentView(web)

        askPermissions()

        baseUrl = try {
            Core.start(this)
        } catch (e: Exception) {
            AlertDialog.Builder(this)
                .setMessage(getString(R.string.start_failed, e.message ?: e.toString()))
                .setPositiveButton(android.R.string.ok) { _, _ -> finish() }
                .setCancelable(false)
                .show()
            return
        }
        localOrigin = baseUrl?.let(Uri::parse)
        load(intent)
        UpdateCheck.run(this)
    }

    override fun onResume() {
        super.onResume()
        Core.resumed(this)
    }

    override fun onPause() {
        Core.paused(this)
        super.onPause()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Only a shared link reloads the page; reopening the app keeps it as is.
        if (sharedLink(intent) != null) load(intent)
    }

    private fun load(intent: Intent?) {
        val base = baseUrl ?: return
        val shared = sharedLink(intent)
        web.loadUrl(if (shared != null) "$base&share=${Uri.encode(shared)}" else base)
    }

    /** The first http(s) link in text shared to the app (YouTube adds a title around it). */
    private fun sharedLink(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_SEND) return null
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return null
        return Regex("""https?://\S+""").find(text)?.value
    }

    private fun askPermissions() {
        val wanted = buildList {
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
            if (Build.VERSION.SDK_INT <= 28) add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (wanted.isNotEmpty()) requestPermissions(wanted.toTypedArray(), 1)
    }

    // Back leaves the app without stopping it, so downloads keep going.
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}

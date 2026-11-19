package io.github.m0abl1.ytconv

import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.net.Uri
import android.provider.MediaStore
import android.provider.MediaStore.Downloads
import android.webkit.MimeTypeMap
import androidx.annotation.RequiresApi
import io.github.m0abl1.ytcore.Transfer
import java.io.File
import java.io.IOException

@RequiresApi(29)
internal class SharedDownloads(
    private val resolver: ContentResolver,
    private val downloadsDir: File,
) {
    private val collection = Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

    fun publish(source: File, dir: File, transfer: Transfer): File {
        val values = ContentValues().apply {
            put(Downloads.DISPLAY_NAME, source.name)
            put(Downloads.MIME_TYPE, downloadMimeType(source))
            put(Downloads.RELATIVE_PATH, relativePath(dir))
            put(Downloads.IS_PENDING, 1)
        }
        checkTransfer(transfer)
        val uri = resolver.insert(collection, values) ?: throw IOException("could not create the download")
        try {
            val output = resolver.openOutputStream(uri) ?: throw IOException("could not open the download for writing")
            output.use { dest ->
                source.inputStream().use { input ->
                    val buffer = ByteArray(256 * 1024)
                    while (true) {
                        checkTransfer(transfer)
                        val count = input.read(buffer)
                        if (count == -1) break
                        dest.write(buffer, 0, count)
                    }
                }
            }
            val name = resolver.query(uri, arrayOf(Downloads.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            } ?: throw IOException("could not find the download name")
            checkTransfer(transfer)
            val published = resolver.update(uri, ContentValues().apply { put(Downloads.IS_PENDING, 0) }, null, null)
            if (published != 1) throw IOException("could not publish the download")
            return File(dir, name)
        } catch (e: Exception) {
            runCatching { resolver.delete(uri, null, null) }
            throw e
        }
    }

    fun find(file: File): Uri? {
        val dir = file.parentFile ?: return null
        val selection = "${Downloads.RELATIVE_PATH} = ? AND ${Downloads.DISPLAY_NAME} = ? AND ${Downloads.IS_PENDING} = 0"
        val args = arrayOf(relativePath(dir), file.name)
        return resolver.query(collection, arrayOf(Downloads._ID), selection, args, null)?.use { cursor ->
            if (cursor.moveToFirst()) ContentUris.withAppendedId(collection, cursor.getLong(0)) else null
        }
    }

    private fun relativePath(dir: File): String {
        val path = dir.toRelativeString(downloadsDir)
        require(path == "ytconv" || path.startsWith("ytconv/"))
        return "${downloadsDir.name}/$path/"
    }

    private fun checkTransfer(transfer: Transfer) {
        if (transfer.cancelled()) throw IOException("download cancelled")
    }
}

internal fun downloadMimeType(file: File): String =
    MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase()) ?: when (file.extension) {
        "opus" -> "audio/ogg"
        "webm" -> "video/webm"
        "mkv" -> "video/x-matroska"
        else -> "application/octet-stream"
    }

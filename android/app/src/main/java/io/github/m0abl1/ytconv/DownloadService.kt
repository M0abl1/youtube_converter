package io.github.m0abl1.ytconv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * A foreground service with no work of its own: while it runs, Android keeps
 * the process (and so the Go downloads) alive when the app is in the
 * background. Core starts it when a download begins and stops it when the
 * queue is empty.
 */
class DownloadService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW)
            .apply { description = getString(R.string.channel_desc) }
        manager.createNotificationChannel(channel)

        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_download)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.downloading))
            .setColor(getColor(R.color.teal))
            .setContentIntent(open)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(ID, notification)
        }
        Core.foreground(this, startId)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        Core.serviceDestroyed(this)
        super.onDestroy()
    }

    private companion object {
        const val CHANNEL = "downloads"
        const val ID = 1
    }
}

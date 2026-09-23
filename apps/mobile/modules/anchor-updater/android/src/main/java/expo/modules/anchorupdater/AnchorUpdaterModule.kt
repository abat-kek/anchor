package expo.modules.anchorupdater

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Nativer Teil der Selbstaktualisierung: Version lesen, JSON holen, APK laden und
 * pruefen, Installer starten. Portiert aus der Pumpen-App (`UpdateApi.kt`,
 * `UpdateInstaller.kt`); die Bewertung und der Zustand liegen in
 * `packages/shared/src/domain/app-update.ts`.
 */
class AnchorUpdaterModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React-Kontext fehlt" }

  private val apkFile: File
    get() = File(File(context.cacheDir, "updates"), "anchor-update.apk")

  override fun definition() = ModuleDefinition {
    Name("AnchorUpdater")

    Events("onDownloadProgress")

    // Der versionCode, mit dem build.sh dieses APK gebaut hat.
    Function("getInstalledVersionCode") {
      context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode.toInt()
    }

    // Rohtext der JSON, null bei Netz- oder HTTP-Fehler. Gelesen und geprueft wird
    // sie in packages/shared - kein Update ist dort der sichere Ausgang.
    AsyncFunction("fetchText") { url: String ->
      try {
        open(url).let { connection ->
          try {
            if (connection.responseCode !in 200..299) null
            else connection.inputStream.bufferedReader().use { it.readText() }
          } finally {
            connection.disconnect()
          }
        }
      } catch (e: IOException) {
        null
      } catch (e: IllegalArgumentException) {
        null
      }
    }

    // Laedt das APK und prueft dabei die SHA256. Rueckgabe ist der Dateipfad, null bei
    // jedem Fehler; die Datei ist dann geloescht, damit nie ein halbes oder fremdes APK
    // zur Installation liegen bleibt.
    AsyncFunction("downloadApk") { url: String, sha256: String ->
      val target = apkFile
      val isVerified = try {
        downloadAndVerify(url, sha256, target)
      } catch (e: IOException) {
        false
      } catch (e: IllegalArgumentException) {
        false
      }
      if (!isVerified) target.delete()
      if (isVerified) target.absolutePath else null
    }

    Function("canRequestPackageInstalls") {
      context.packageManager.canRequestPackageInstalls()
    }

    // Die Erlaubnis "Unbekannte Apps installieren" fehlt: in die Einstellungen schicken.
    // Der Aufrufer versucht es nach der Rueckkehr in den Vordergrund erneut.
    Function("openInstallPermissionSettings") {
      context.startActivity(
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
          .setData(Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }

    // Startet den Android-Installer. false heisst: die Erlaubnis fehlt noch.
    Function("installApk") { path: String ->
      if (!context.packageManager.canRequestPackageInstalls()) {
        false
      } else {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", File(path))
        context.startActivity(
          Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        true
      }
    }
  }

  private fun open(url: String): HttpURLConnection =
    (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = CONNECT_TIMEOUT_MS
      // Lesezeitlimit je Block, nicht fuer den ganzen Download - ein grosses APK ueber
      // Mobilfunk darf laenger dauern, ein haengender Server nicht ewig.
      readTimeout = READ_TIMEOUT_MS
    }

  // Die Pruefsumme laeuft waehrend des Streamens mit, statt die Datei danach noch einmal zu
  // lesen. Sie schuetzt vor einem kaputten Download; die Signaturpruefung von Android schuetzt
  // nur davor, dass ein fremder Schluessel die App ersetzt.
  private fun downloadAndVerify(url: String, sha256: String, target: File): Boolean {
    target.parentFile?.mkdirs()
    val connection = open(url)
    try {
      if (connection.responseCode !in 200..299) return false
      val total = connection.contentLengthLong
      val digest = MessageDigest.getInstance("SHA-256")
      var received = 0L
      var lastPercent = -1
      connection.inputStream.use { input ->
        target.outputStream().use { output ->
          val buffer = ByteArray(BUFFER_SIZE)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            digest.update(buffer, 0, count)
            received += count
            if (total > 0) {
              val percent = ((received * 100) / total).toInt()
              // Nur bei Aenderung melden - sonst flutet jeder 8-KB-Block die JS-Bruecke.
              if (percent != lastPercent) {
                lastPercent = percent
                sendEvent("onDownloadProgress", mapOf("percent" to percent))
              }
            }
          }
        }
      }
      val hex = digest.digest().joinToString("") { "%02x".format(it) }
      return hex.equals(sha256, ignoreCase = true)
    } finally {
      connection.disconnect()
    }
  }

  private companion object {
    const val BUFFER_SIZE = 8 * 1024
    const val CONNECT_TIMEOUT_MS = 15_000
    const val READ_TIMEOUT_MS = 30_000
  }
}

package com.pogsmac.terminal

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.DocumentsContract
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import android.view.HapticFeedbackConstants
import com.termux.terminal.LocalPtySession
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var termBridge: TermBridge
    private val folderPicker = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            val flags = android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
            runCatching { contentResolver.takePersistableUriPermission(uri, flags) }
            getSharedPreferences("macterm", Context.MODE_PRIVATE).edit()
                .putString("home_tree_uri", uri.toString())
                .apply()
            val detail = JSONObject().put("selected", true)
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('macterm-home-folder-selected',{detail:${JSONObject.quote(detail.toString())}}))",
                null
            )
        }
    }

    fun chooseHomeFolder() {
        runOnUiThread { folderPicker.launch(null) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.parseColor("#072A31")
        window.navigationBarColor = Color.parseColor("#072A31")

        webView = WebView(this)
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
        }

        webView.setBackgroundColor(Color.parseColor("#06252C"))
        termBridge = TermBridge(this, webView)
        webView.addJavascriptInterface(termBridge, "AndroidBridge")
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return request.url.scheme != "https" ||
                    request.url.host != "appassets.androidplatform.net" ||
                    !request.url.path.orEmpty().startsWith("/assets/")
            }

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    override fun onDestroy() {
        if (::termBridge.isInitialized) termBridge.stopAll()
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    private class TermBridge(
        private val context: Context,
        private val webView: WebView
    ) {
        private fun selectedTreeUri(): Uri? {
            val raw = context.getSharedPreferences("macterm", Context.MODE_PRIVATE)
                .getString("home_tree_uri", null) ?: return null
            return runCatching { Uri.parse(raw) }.getOrNull()
        }

        @JavascriptInterface
        fun pickHomeDirectory() {
            (context as? MainActivity)?.chooseHomeFolder()
        }

        @JavascriptInterface
        fun getHomeDirectoryName(): String {
            val tree = selectedTreeUri() ?: return ""
            return runCatching {
                val documentId = DocumentsContract.getTreeDocumentId(tree)
                val documentUri = DocumentsContract.buildDocumentUriUsingTree(tree, documentId)
                context.contentResolver.query(
                    documentUri,
                    arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),
                    null, null, null
                )?.use { cursor ->
                    if (cursor.moveToFirst()) cursor.getString(0).orEmpty() else ""
                }.orEmpty()
            }.getOrDefault("")
        }

        @JavascriptInterface
        fun getHomeDirectorySnapshot(): String {
            val tree = selectedTreeUri() ?: return ""
            return runCatching {
                val documentId = DocumentsContract.getTreeDocumentId(tree)
                val rootName = getHomeDirectoryName().ifBlank { "AndroidHome" }
                val budget = SnapshotBudget()
                snapshotDirectory(tree, documentId, rootName, 0, budget).toString()
            }.getOrDefault("")
        }

        private data class SnapshotBudget(var entries: Int = 0, var bytes: Int = 0)

        private fun snapshotDirectory(
            tree: Uri,
            documentId: String,
            name: String,
            depth: Int,
            budget: SnapshotBudget
        ): JSONObject {
            val result = JSONObject().put("name", name).put("type", "dir")
            val children = JSONArray()
            if (depth < 12 && budget.entries < 1000) {
                val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, documentId)
                val columns = arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE
                )
                context.contentResolver.query(childrenUri, columns, null, null, null)?.use { cursor ->
                    val idIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                    val nameIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                    val mimeIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
                    while (cursor.moveToNext() && budget.entries < 1000) {
                        val childId = cursor.getString(idIndex) ?: continue
                        val childName = cursor.getString(nameIndex)?.takeIf { it.isNotBlank() } ?: continue
                        val mime = cursor.getString(mimeIndex).orEmpty()
                        budget.entries++
                        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                            children.put(snapshotDirectory(tree, childId, childName, depth + 1, budget))
                        } else {
                            val fileUri = DocumentsContract.buildDocumentUriUsingTree(tree, childId)
                            val text = readTextFile(fileUri, budget)
                            if (text != null) children.put(JSONObject().put("name", childName).put("type", "file").put("content", text))
                        }
                    }
                }
            }
            return result.put("children", children)
        }

        private fun readTextFile(uri: Uri, budget: SnapshotBudget): String? {
            val remaining = (2 * 1024 * 1024 - budget.bytes).coerceAtMost(256 * 1024)
            if (remaining <= 0) return null
            val bytes = ByteArrayOutputStream()
            context.contentResolver.openInputStream(uri)?.use { input ->
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (bytes.size() + count > remaining) return null
                    bytes.write(buffer, 0, count)
                }
            } ?: return null
            return try {
                val decoder = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                val content = decoder.decode(java.nio.ByteBuffer.wrap(bytes.toByteArray())).toString()
                budget.bytes += bytes.size()
                content
            } catch (_: Exception) {
                null
            }
        }

        @JavascriptInterface
        fun getLocalHomePath(): String {
            val home = File(context.filesDir, "terminal-home")
            home.mkdirs()
            return home.canonicalPath
        }

        @JavascriptInterface
        fun resolveLocalDirectory(path: String, currentDirectory: String): String {
            val home = File(context.filesDir, "terminal-home").apply { mkdirs() }.canonicalFile
            val requested = path.trim().removeSurrounding("\"").removeSurrounding("'")
            val target = when {
                requested.isBlank() || requested == "~" -> home
                requested.startsWith("~/") -> File(home, requested.drop(2))
                requested.startsWith("/") -> File(requested)
                else -> File(currentDirectory, requested)
            }
            return runCatching {
                target.canonicalFile.takeIf { it.isDirectory && it.canRead() }?.path.orEmpty()
            }.getOrDefault("")
        }

        @JavascriptInterface
        fun startLocalShell(sessionId: String, cwd: String, envJson: String, columns: Int, rows: Int) {
            if (sessionId.isBlank() || sessionId.length > 160) {
                postLocalShellError(sessionId, "Invalid terminal session")
                return
            }
            val directory = runCatching { File(cwd).canonicalFile }.getOrNull()
            if (directory == null || !directory.isDirectory || !directory.canRead()) {
                postLocalShellError(sessionId, "Invalid working directory: $cwd")
                return
            }

            try {
                val environment = linkedMapOf(
                    "HOME" to getLocalHomePath(),
                    "USER" to "android",
                    "LOGNAME" to "android",
                    "SHELL" to "/system/bin/sh",
                    "TERM" to "xterm-256color",
                    "COLORTERM" to "truecolor",
                    "LANG" to "en_US.UTF-8",
                    "PATH" to "/system/bin:/system/xbin:/vendor/bin"
                )
                runCatching { JSONObject(envJson) }.getOrNull()?.let { suppliedEnv ->
                    val keys = suppliedEnv.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        val value = suppliedEnv.optString(key)
                        if (key.matches(Regex("[A-Za-z_][A-Za-z0-9_]*")) && value.length <= 8192) {
                            environment[key] = value
                        }
                    }
                }

                val session = LocalPtySession(
                    "/system/bin/sh",
                    directory.path,
                    arrayOf("/system/bin/sh", "-i"),
                    environment.map { (key, value) -> "$key=$value" }.toTypedArray(),
                    rows.coerceIn(5, 200),
                    columns.coerceIn(20, 300),
                    object : LocalPtySession.Listener {
                        override fun onOutput(text: String) = postLocalShellOutput(sessionId, text)
                        override fun onExit(exitCode: Int) {
                            localShells.remove(sessionId)
                            postLocalShellExit(sessionId, exitCode)
                        }
                    }
                )
                localShells.put(sessionId, session)?.stop()
                session.start()
            } catch (error: Throwable) {
                postLocalShellError(sessionId, error.message ?: "Unable to start the local shell")
            }
        }

        @JavascriptInterface
        fun writeLocalShellInput(sessionId: String, text: String) {
            if (text.length > 16_384) return
            runCatching { localShells[sessionId]?.write(text) }
                .onFailure { postLocalShellError(sessionId, it.message ?: "Unable to write to the local shell") }
        }

        @JavascriptInterface
        fun resizeLocalShell(sessionId: String, columns: Int, rows: Int) {
            localShells[sessionId]?.resize(columns.coerceIn(20, 300), rows.coerceIn(5, 200))
        }

        @JavascriptInterface
        fun stopLocalShell(sessionId: String) {
            localShells.remove(sessionId)?.stop()
        }

        fun stopAll() {
            localShells.values.forEach { it.stop() }
            localShells.clear()
        }

        private val localShells = java.util.concurrent.ConcurrentHashMap<String, LocalPtySession>()

        private fun postLocalShellOutput(sessionId: String, text: String) {
            val detail = JSONObject().put("sessionId", sessionId).put("text", text)
            webView.post {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('macterm-local-shell-output',{detail:${JSONObject.quote(detail.toString())}}))",
                    null
                )
            }
        }

        private fun postLocalShellError(sessionId: String, message: String) {
            val detail = JSONObject().put("sessionId", sessionId).put("message", message)
            webView.post {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('macterm-local-shell-error',{detail:${JSONObject.quote(detail.toString())}}))",
                    null
                )
            }
        }

        private fun postLocalShellExit(sessionId: String, exitCode: Int) {
            val detail = JSONObject().put("sessionId", sessionId).put("exitCode", exitCode)
            webView.post {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('macterm-local-shell-exit',{detail:${JSONObject.quote(detail.toString())}}))",
                    null
                )
            }
        }

        @JavascriptInterface
        fun copyText(text: String) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("terminal", text))
        }

        @JavascriptInterface
        fun hapticTap() {
            hapticFeedback("tap")
        }

        @JavascriptInterface
        fun hapticFeedback(kind: String) {
            webView.post {
                val flag = when (kind) {
                    "error" -> if (android.os.Build.VERSION.SDK_INT >= 30) {
                        HapticFeedbackConstants.REJECT
                    } else {
                        HapticFeedbackConstants.LONG_PRESS
                    }
                    "split", "tab", "copy" -> if (android.os.Build.VERSION.SDK_INT >= 30) {
                        HapticFeedbackConstants.CONFIRM
                    } else {
                        HapticFeedbackConstants.CONTEXT_CLICK
                    }
                    else -> HapticFeedbackConstants.KEYBOARD_TAP
                }
                webView.performHapticFeedback(flag)
            }
        }

        @JavascriptInterface
        fun isRootAvailable(): Boolean {
            return try {
                val p = Runtime.getRuntime().exec(arrayOf("sh", "-c", "which su"))
                p.waitFor() == 0
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun isShizukuAvailable(): Boolean {
            return try {
                context.packageManager.getPackageInfo("moe.shizuku.privileged.api", 0)
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun execPrivilegedCommand(cmd: String, mode: String): String {
            return try {
                val bin = if (mode == "root") "su" else "sh"
                val proc = Runtime.getRuntime().exec(arrayOf(bin, "-c", cmd))
                val out = proc.inputStream.bufferedReader().readText()
                val err = proc.errorStream.bufferedReader().readText()
                proc.waitFor()
                if (err.isNotBlank()) "$out\n$err".trim() else out
            } catch (e: Exception) {
                "Privileged exec failed ($mode): ${e.message}"
            }
        }
    }
}

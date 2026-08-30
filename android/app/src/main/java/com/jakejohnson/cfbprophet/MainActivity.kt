package com.jakejohnson.cfbprophet

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowInsetsController
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Configure Dark Edge-to-Edge Display
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.parseColor("#0A0E17")
        window.navigationBarColor = Color.parseColor("#0A0E17")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                // Ensure dark status and navigation icons (light text on dark background)
                controller.setSystemBarsAppearance(
                    0,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                )
            }
        }

        // 2. Initialize AssetLoader for high-performance secure local assets
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // 3. Initialize WebView
        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0A0E17"))
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
        }

        setContentView(webView)

        // Handle System Insets (Status bar / Navigation bar padding)
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val statusBarInset = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            val navBarInset = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            view.setPadding(0, statusBarInset, 0, navBarInset)
            insets
        }

        configureWebView()

        // 4. Handle System Back Navigation
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Check if a modal is open in CFB Prophet first
                webView.evaluateJavascript(
                    """
                    (function() {
                        const openModals = document.querySelectorAll('.modal.open, .vault-modal.open, .auth-modal.open');
                        if (openModals.length > 0) {
                            openModals.forEach(m => m.classList.remove('open'));
                            document.body.classList.remove('modal-open');
                            return true;
                        }
                        return false;
                    })();
                    """.trimIndent()
                ) { result ->
                    val modalClosed = result == "true"
                    if (!modalClosed) {
                        if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                        }
                    }
                }
            }
        })

        // 5. Load App
        handleIncomingIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        val appUrl = "https://appassets.androidplatform.net/assets/www/index.html"
        val data: Uri? = intent?.data

        if (data != null && (data.scheme == "https" || data.scheme == "http")) {
            val fragment = data.fragment
            val targetUrl = if (!fragment.isNullOrEmpty()) {
                "$appUrl#$fragment"
            } else {
                appUrl
            }
            webView.loadUrl(targetUrl)
        } else {
            webView.loadUrl(appUrl)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            loadsImagesAutomatically = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            userAgentString = "${userAgentString} CFBProphetAndroid/1.0.0"
        }

        // Native Android Bridge for JS interactions (Haptics, Share, Toast)
        webView.addJavascriptInterface(AndroidNativeBridge(this), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                
                // Keep local appassets internal
                if (url.startsWith("https://appassets.androidplatform.net/")) {
                    return false
                }

                // Open external links (ESPN, NCAA, App links) in external browser
                return try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                    true
                } catch (e: Exception) {
                    false
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                consoleMessage?.let {
                    android.util.Log.d("CFBProphetWeb", "${it.message()} -- From line ${it.lineNumber()} of ${it.sourceId()}")
                }
                return true
            }
        }
    }

    /**
     * Native Javascript Interface accessible in web app via window.AndroidBridge
     */
    inner class AndroidNativeBridge(private val context: Context) {

        @JavascriptInterface
        fun triggerHapticFeedback(type: String?) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                    val vibrator = vibratorManager?.defaultVibrator
                    when (type) {
                        "success" -> vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
                        "heavy" -> vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK))
                        else -> vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
                    }
                } else {
                    @Suppress("DEPRECATION")
                    val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    vibrator?.vibrate(25)
                }
            } catch (e: Exception) {
                // Ignore vibration errors on devices without vibrators
            }
        }

        @JavascriptInterface
        fun shareContent(title: String, text: String, url: String?) {
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, title)
                val fullText = if (!url.isNullOrEmpty()) "$text\n$url" else text
                putExtra(Intent.EXTRA_TEXT, fullText)
            }
            context.startActivity(Intent.createChooser(shareIntent, "Share CFB Prophet Prediction"))
        }

        @JavascriptInterface
        fun copyToClipboard(label: String, text: String) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clip = ClipData.newPlainText(label, text)
            clipboard?.setPrimaryClip(clip)
            Toast.makeText(context, "Copied to clipboard!", Toast.LENGTH_SHORT).show()
        }

        @JavascriptInterface
        fun showNativeToast(message: String) {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }
}

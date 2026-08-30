package com.jakejohnson.cfbprophet;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.WindowInsetsController;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private WebViewAssetLoader assetLoader;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Initialize WebView & Set Content View
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0A0E17"));
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        setContentView(webView);

        // 2. Configure Dark System Bars
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.parseColor("#0A0E17"));
        getWindow().setNavigationBarColor(Color.parseColor("#0A0E17"));

        try {
            androidx.core.view.WindowInsetsControllerCompat controller = 
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (controller != null) {
                controller.setAppearanceLightStatusBars(false);
                controller.setAppearanceLightNavigationBars(false);
            }
        } catch (Exception ignored) {}

        // 3. Initialize AssetLoader for secure local assets
        assetLoader = new WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        configureWebView();

        // 4. Handle System Back Navigation
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // Check if an in-app modal is open first
                webView.evaluateJavascript(
                    "(function() {" +
                    "    const openModals = document.querySelectorAll('.modal.open, .vault-modal.open, .auth-modal.open');" +
                    "    if (openModals.length > 0) {" +
                    "        openModals.forEach(m => m.classList.remove('open'));" +
                    "        document.body.classList.remove('modal-open');" +
                    "        return true;" +
                    "    }" +
                    "    return false;" +
                    "})();",
                    result -> {
                        boolean modalClosed = "true".equals(result);
                        if (!modalClosed) {
                            if (webView.canGoBack()) {
                                webView.goBack();
                            } else {
                                setEnabled(false);
                                getOnBackPressedDispatcher().onBackPressed();
                            }
                        }
                    }
                );
            }
        });

        // 5. Load App
        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        String appUrl = "https://appassets.androidplatform.net/assets/www/index.html";
        Uri data = intent != null ? intent.getData() : null;

        if (data != null && ("https".equals(data.getScheme()) || "http".equals(data.getScheme()))) {
            String fragment = data.getFragment();
            String targetUrl = (fragment != null && !fragment.isEmpty()) ? (appUrl + "#" + fragment) : appUrl;
            webView.loadUrl(targetUrl);
        } else {
            webView.loadUrl(appUrl);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUserAgentString(settings.getUserAgentString() + " CFBProphetAndroid/1.0.0");

        // Native Android Bridge for JS interactions (Haptics, Share, Toast)
        webView.addJavascriptInterface(new AndroidNativeBridge(this), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://appassets.androidplatform.net/")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                if (consoleMessage != null) {
                    android.util.Log.d("CFBProphetWeb", consoleMessage.message() + " -- From line " + consoleMessage.lineNumber());
                }
                return true;
            }
        });
    }

    public static class AndroidNativeBridge {
        private final Context context;

        public AndroidNativeBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void triggerHapticFeedback(String type) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                    if (vm != null) {
                        Vibrator vibrator = vm.getDefaultVibrator();
                        if ("success".equals(type)) {
                            vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK));
                        } else if ("heavy".equals(type)) {
                            vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK));
                        } else {
                            vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK));
                        }
                    }
                } else {
                    Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                    if (v != null) {
                        v.vibrate(25);
                    }
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void shareContent(String title, String text, String url) {
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("text/plain");
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            String fullText = (url != null && !url.isEmpty()) ? (text + "\n" + url) : text;
            shareIntent.putExtra(Intent.EXTRA_TEXT, fullText);
            context.startActivity(Intent.createChooser(shareIntent, "Share CFB Prophet Prediction"));
        }

        @JavascriptInterface
        public void copyToClipboard(String label, String text) {
            ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = ClipData.newPlainText(label, text);
            if (clipboard != null) {
                clipboard.setPrimaryClip(clip);
            }
            Toast.makeText(context, "Copied to clipboard!", Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public void showNativeToast(String message) {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
        }
    }
}

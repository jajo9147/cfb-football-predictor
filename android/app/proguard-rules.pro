# CFB Prophet ProGuard / R8 Rules
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebKit and Native JS Interfaces
-keep class androidx.webkit.** { *; }

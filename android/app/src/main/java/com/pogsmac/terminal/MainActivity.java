package com.pogsmac.terminal;

import android.app.Activity;
import android.os.Bundle;
import android.content.Context;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.graphics.Color;
import android.view.HapticFeedbackConstants;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.BufferedReader;
import java.io.InputStreamReader;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);

        webView.setBackgroundColor(Color.parseColor("#0B252E"));
        webView.addJavascriptInterface(new TermBridge(this, webView), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient());

        webView.loadUrl("file:///android_asset/public/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public static class TermBridge {
        private final Context context;
        private final WebView webView;

        public TermBridge(Context context, WebView webView) {
            this.context = context;
            this.webView = webView;
        }

        @JavascriptInterface
        public void copyText(String text) {
            ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null) {
                clipboard.setPrimaryClip(ClipData.newPlainText("terminal", text));
            }
        }

        @JavascriptInterface
        public void hapticTap() {
            hapticFeedback("tap");
        }

        @JavascriptInterface
        public void hapticFeedback(final String kind) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    int flag = HapticFeedbackConstants.KEYBOARD_TAP;
                    if ("error".equals(kind)) {
                        flag = HapticFeedbackConstants.LONG_PRESS;
                    } else if ("split".equals(kind) || "tab".equals(kind) || "copy".equals(kind)) {
                        flag = HapticFeedbackConstants.VIRTUAL_KEY;
                    }
                    webView.performHapticFeedback(flag);
                }
            });
        }

        @JavascriptInterface
        public boolean isRootAvailable() {
            try {
                Process p = Runtime.getRuntime().exec(new String[]{"sh", "-c", "which su"});
                return p.waitFor() == 0;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean isShizukuAvailable() {
            try {
                context.getPackageManager().getPackageInfo("moe.shizuku.privileged.api", 0);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String execPrivilegedCommand(String cmd, String mode) {
            try {
                String bin = "root".equals(mode) ? "su" : "sh";
                Process proc = Runtime.getRuntime().exec(new String[]{bin, "-c", cmd});
                BufferedReader reader = new BufferedReader(new InputStreamReader(proc.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
                BufferedReader errReader = new BufferedReader(new InputStreamReader(proc.getErrorStream()));
                StringBuilder errSb = new StringBuilder();
                while ((line = errReader.readLine()) != null) {
                    errSb.append(line).append("\n");
                }
                proc.waitFor();
                if (errSb.length() > 0) {
                    sb.append("\n").append(errSb);
                }
                return sb.toString().trim();
            } catch (Exception e) {
                return "Privileged exec failed (" + mode + "): " + e.getMessage();
            }
        }
    }
}

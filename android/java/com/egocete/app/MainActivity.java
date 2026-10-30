package com.egocete.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/**
 * EGO Cepte — single-file Android shell.
 *
 * Loads public/ from the APK's assets/public directory using the Android SDK
 * WebView.
 */
public class MainActivity extends Activity {

    private static final int LOCATION_REQUEST = 1;
    private static final long LOCATION_TIMEOUT_MS = 20_000;
    private static final String START_URL = "file:///android_asset/public/index.html";

    private WebView webView;
    private LocationManager locationManager;
    private LocationListener locationListener;
    private Runnable locationTimeout;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pendingLocationRequest;

    /** Small bridge that tells the JS side this is the Android app. */
    private class Bridge {
        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public void requestLocation() {
            runOnUiThread(MainActivity.this::requestLocation);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0a0f1c"));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        // Allow the page under file:///android_asset to call EGO APIs directly
        // (no CORS).
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.addJavascriptInterface(new Bridge(), "EGOBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        webView.loadUrl(START_URL);
    }

    private boolean handleUrl(Uri uri) {
        if ("file".equals(uri.getScheme())) {
            return false;
        }
        // Open external links in the system browser.
        startActivity(new Intent(Intent.ACTION_VIEW, uri));
        return true;
    }

    // ---------------------------------------------------------------------
    // Location: use Android's location service directly instead of the WebView
    // geolocation API, avoiding file:// origin and WebView permission issues.
    // ---------------------------------------------------------------------

    private void requestLocation() {
        boolean fineGranted =
                checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted =
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;

        if (!fineGranted && !coarseGranted) {
            pendingLocationRequest = true;
            requestPermissions(
                    new String[] {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    },
                    LOCATION_REQUEST);
            return;
        }
        startLocation();
    }

    private void startLocation() {
        if (locationManager == null) {
            locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        }
        if (locationManager == null) {
            sendLocationError("Konum servisi bulunamadı.");
            return;
        }

        // Use the last known location if it is fresh.
        Location best = null;
        for (String provider : new String[] {
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
        }) {
            try {
                Location candidate = locationManager.getLastKnownLocation(provider);
                if (candidate != null && (best == null || candidate.getTime() > best.getTime())) {
                    best = candidate;
                }
            } catch (Exception ignored) {
                // Try the next provider if this one is unavailable or not permitted.
            }
        }

        if (best != null && System.currentTimeMillis() - best.getTime() < 10 * 60 * 1000) {
            sendLocation(best);
            return;
        }

        stopLocationUpdates();
        locationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                finishLocation(location);
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {}

            @Override
            public void onProviderEnabled(String provider) {}

            @Override
            public void onProviderDisabled(String provider) {}
        };

        boolean fineGranted =
                checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
        boolean requested = false;
        for (String provider : new String[] {
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER
        }) {
            // GPS requires precise location permission; the network provider is
            // enough for coarse location.
            if (LocationManager.GPS_PROVIDER.equals(provider) && !fineGranted) continue;

            try {
                if (locationManager.isProviderEnabled(provider)) {
                    locationManager.requestLocationUpdates(
                            provider, 0, 0, locationListener, Looper.getMainLooper());
                    requested = true;
                }
            } catch (Exception ignored) {
                // Try the next provider if this one is unavailable.
            }
        }

        if (!requested) {
            sendLocationError("Konum servisleri kapalı. Lütfen GPS'i açın.");
            return;
        }

        locationTimeout = () -> {
            locationTimeout = null;
            stopLocationUpdates();
            sendLocationError("Konum alınamadı. GPS'in açık olduğundan emin olun.");
        };
        handler.postDelayed(locationTimeout, LOCATION_TIMEOUT_MS);
    }

    private void finishLocation(Location location) {
        stopLocationUpdates();
        sendLocation(location);
    }

    private void stopLocationUpdates() {
        if (locationManager != null && locationListener != null) {
            try {
                locationManager.removeUpdates(locationListener);
            } catch (Exception ignored) {
            }
        }
        locationListener = null;

        if (locationTimeout != null) {
            handler.removeCallbacks(locationTimeout);
            locationTimeout = null;
        }
    }

    private void sendLocation(Location location) {
        if (webView == null) return;
        try {
            JSONObject json = new JSONObject();
            json.put("latitude", location.getLatitude());
            json.put("longitude", location.getLongitude());
            json.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : 0);
            String script =
                    "window.onNativeLocation&&window.onNativeLocation(" + json + ");";
            webView.post(() -> webView.evaluateJavascript(script, null));
        } catch (Exception e) {
            sendLocationError("Konum bilgisi işlenemedi.");
        }
    }

    private void sendLocationError(String message) {
        stopLocationUpdates();
        if (webView == null) return;
        String script =
                "window.onNativeLocationError&&window.onNativeLocationError("
                        + JSONObject.quote(message)
                        + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCATION_REQUEST || !pendingLocationRequest) return;

        pendingLocationRequest = false;
        boolean granted = false;
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) {
                granted = true;
                break;
            }
        }

        if (granted) {
            startLocation();
        } else {
            sendLocationError("Konum izni verilmedi. Ayarlardan izin verin.");
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        stopLocationUpdates();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

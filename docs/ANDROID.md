# Raksha Android

Raksha Web and Raksha Android share **one backend**. The Android app adds what browsers cannot do:
hardware-button triggers, lock-screen access and background detection.

## What the web app can and cannot do

| Capability | Web / PWA | Android app |
| --- | --- | --- |
| On-screen hold / triple tap / keyboard | ✅ | ✅ |
| Live location while the app is open | ✅ | ✅ |
| Live location in the background | ❌ (stops when the tab closes) | ✅ foreground service |
| Volume-button pattern | ❌ browsers cannot observe it | ✅ (see below) |
| Power-button pattern | ❌ | ⚠️ best effort |
| Lock-screen shortcut / widget / Quick Settings tile | ❌ | ✅ |

The web UI states this plainly: *"Hardware button emergency activation requires the Raksha Android app."*

## Trigger abstraction

`src/lib/emergency/triggers/` defines `EmergencyTriggerProvider`:

- `WebEmergencyTriggerProvider`: on-screen and keyboard triggers; reports hardware capabilities as `false`.
- `AndroidEmergencyTriggerProvider`: used automatically when the page runs inside the Android
  WebView and `window.RakshaAndroid` exists. The native side exposes:
  ```kotlin
  class RakshaBridge(private val caps: Capabilities) {
      @JavascriptInterface fun getCapabilities(): String = Json.encodeToString(caps)
      @JavascriptInterface fun acknowledge(method: String) { /* UI is showing the emergency */ }
  }
  // when a hardware pattern fires:
  webView.evaluateJavascript("window.__rakshaNativeTrigger && window.__rakshaNativeTrigger('hardware_volume')", null)
  ```
  The emergency engine treats it exactly like an on-screen press.

**Important:** the native app must call the API itself (`POST /api/emergency/trigger`) from Kotlin
when it detects a hardware trigger, so the SOS goes out even if the WebView is not running. The
`clientEventId` makes it safe if the WebView also sends it.

## API usage from Android

```http
POST /api/auth/login            {"email": "...", "password": "...", "client": "android"}
→ {"success": true, "data": {"user": {...}, "token": "<bearer>", "expiresAt": "..."}}

POST /api/emergency/trigger     Authorization: Bearer <token>
{"clientEventId": "<uuid v4>", "method": "hardware_volume",
 "location": {"lat": 20.29, "lng": 85.82, "accuracy": 12}, "batteryLevel": 0.41,
 "triggeredAt": "2026-10-03T16:42:00Z"}

POST /api/emergency/location    {"eventId": "...", "locations": [{...}, ...]}   // batch ≤ 50
POST /api/emergency/cancel      {"eventId": "...", "reason": "safe"}
GET  /api/emergency/status
```

Store the token in `EncryptedSharedPreferences`. Bearer requests are exempt from CSRF checks. Use a
WorkManager queue with the same semantics as the web outbox (persist first, idempotent retries).

## Hardware triggers on Android (policy-aware)

- **Volume buttons:** while a foreground service is running, a `MediaSession` with a
  `VolumeProviderCompat` receives volume key events even with the screen off on most devices.
  Detect, for example, 5 alternating presses within 3 s. Avoid `AccessibilityService` for this: Google
  Play restricts its use to accessibility purposes.
- **Power button:** apps cannot intercept it. A foreground service can count `ACTION_SCREEN_OFF/ON`
  broadcasts (e.g. 5 within 4 s) as a best-effort pattern. Note that Android 12+ has a built-in
  *Emergency SOS* on 5 power presses, which may take precedence; document this to users.
- **Lock screen:** Quick Settings tile (`TileService`), home-screen widget, and an app shortcut.
- **Background location** during an active emergency: a foreground service of type `location`, with
  `ACCESS_BACKGROUND_LOCATION` requested with a clear rationale only when she enables background
  triggers.
- Respect battery: the detection service should be opt-in, with a persistent notification.

Never auto-dial emergency services without an explicit, documented user setting and the legal
review that requires.

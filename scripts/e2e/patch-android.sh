#!/usr/bin/env bash
# CI only, after `expo prebuild`: the E2E APK talks to the local stack over plain HTTP
# (http://10.0.2.2:54321, the emulator's address for the host) and never fetches an OTA update.
set -euo pipefail
manifest=apps/mobile/android/app/src/main/AndroidManifest.xml
sed -i 's|<application |<application android:usesCleartextTraffic="true" |' "$manifest"
sed -i 's|"expo.modules.updates.ENABLED" android:value="true"|"expo.modules.updates.ENABLED" android:value="false"|' "$manifest"
grep -q 'android:usesCleartextTraffic="true"' "$manifest"
grep -q '"expo.modules.updates.ENABLED" android:value="false"' "$manifest"

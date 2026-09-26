#!/usr/bin/env bash
# CI only, after `expo prebuild`: the E2E APK talks to the local stack over plain HTTP
# (http://10.0.2.2:54321, the emulator's address for the host) and never fetches an OTA update.
set -euo pipefail
manifest=apps/mobile/android/app/src/main/AndroidManifest.xml
sed -i 's|<application |<application android:usesCleartextTraffic="true" |' "$manifest"
sed -i 's|"expo.modules.updates.ENABLED" android:value="true"|"expo.modules.updates.ENABLED" android:value="false"|' "$manifest"
grep -q 'android:usesCleartextTraffic="true"' "$manifest"
grep -q '"expo.modules.updates.ENABLED" android:value="false"' "$manifest"

# Gradle next to the emulator and the local stack on one runner: the release build's default
# 512 MB metaspace runs out.
props=apps/mobile/android/gradle.properties
sed -i '/^org.gradle.jvmargs=/d' "$props"
printf '\norg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g\n' >> "$props"
grep -q '^org.gradle.jvmargs=-Xmx4g' "$props"
# No release lint for the E2E APK (it analyses every library and adds minutes).
gradle=apps/mobile/android/app/build.gradle
sed -i 's|^android {$|android {\n    lint { checkReleaseBuilds false }|' "$gradle"
grep -q 'checkReleaseBuilds false' "$gradle"

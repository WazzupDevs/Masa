#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner once the emulator has booted.
# Env: SCHEME (light|dark), OUT (output directory), APK (path),
# INSIDE_LAT/INSIDE_LNG, OUTSIDE_LAT/OUTSIDE_LNG.
set -euo pipefail
mkdir -p "$OUT/screenshots" "$OUT/maestro"

# The APK comes from the build job (download-artifact).
test -f "$APK"

adb install -r -g "$APK"
if [ "$SCHEME" = dark ]; then adb shell cmd uimode night yes; else adb shell cmd uimode night no; fi
# A slow emulator can raise "Pixel Launcher isn't responding" over the app; hide system ANR dialogs.
adb shell settings put global hide_error_dialogs 1 || true
adb logcat -c
adb logcat '*:W' > "$OUT/logcat.txt" 2>&1 &
adb emu screenrecord start --time-limit 1800 "$OUT/video.webm" || true

status=0
maestro test e2e/maestro/p0.yaml \
  --test-output-dir "$OUT/screenshots" \
  -e INSIDE_LAT="$INSIDE_LAT" -e INSIDE_LNG="$INSIDE_LNG" \
  -e OUTSIDE_LAT="$OUTSIDE_LAT" -e OUTSIDE_LNG="$OUTSIDE_LNG" \
  -e SCHEME="$SCHEME" \
  --format junit --output "$OUT/report.xml" \
  --debug-output "$OUT/maestro" || status=$?

adb emu screenrecord stop || true
exit "$status"

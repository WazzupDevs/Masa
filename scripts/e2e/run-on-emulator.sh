#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner once the emulator has booted.
# Env: SCHEME (light|dark), OUT (output directory), APK (path), INSIDE_LAT/INSIDE_LNG,
# OUTSIDE_LAT/OUTSIDE_LNG.
set -euo pipefail
mkdir -p "$OUT/screenshots" "$OUT/maestro"

# The APK builds in the background since the start of the job; wait for Gradle to finish.
timeout 1500 bash -c 'until [ -f "$OUT/gradle.exit" ]; do sleep 5; done'
if [ "$(cat "$OUT/gradle.exit")" != 0 ]; then
  tail -n 80 "$OUT/gradle.log"
  exit 1
fi
test -f "$APK"

adb install -r -g "$APK"
if [ "$SCHEME" = dark ]; then adb shell cmd uimode night yes; else adb shell cmd uimode night no; fi
adb logcat -c
adb logcat '*:W' > "$OUT/logcat.txt" 2>&1 &
adb emu screenrecord start --time-limit 1800 "$OUT/video.webm" || true

status=0
maestro test e2e/maestro/p0.yaml \
  --test-output-dir "$OUT/screenshots" \
  -e INSIDE_LAT="$INSIDE_LAT" -e INSIDE_LNG="$INSIDE_LNG" \
  -e OUTSIDE_LAT="$OUTSIDE_LAT" -e OUTSIDE_LNG="$OUTSIDE_LNG" \
  --format junit --output "$OUT/report.xml" \
  --debug-output "$OUT/maestro" || status=$?

adb emu screenrecord stop || true
exit "$status"

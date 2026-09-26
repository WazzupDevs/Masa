#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner once the emulator has booted.
# Env: SCHEME (light|dark), OUT (output directory), APK (path), GH_TOKEN, GITHUB_REPOSITORY,
# RUN_ID, INSIDE_LAT/INSIDE_LNG, OUTSIDE_LAT/OUTSIDE_LNG.
set -euo pipefail
mkdir -p "$OUT/screenshots" "$OUT/maestro" "$(dirname "$APK")"

# The apk job builds the APK while this job starts the stack and boots the emulator.
for _ in $(seq 1 90); do
  id=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$RUN_ID/artifacts" \
    --jq '.artifacts[] | select(.name == "e2e-apk") | .id' || true)
  if [ -n "$id" ]; then
    gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$id/zip" > /tmp/e2e-apk.zip
    unzip -o -q /tmp/e2e-apk.zip -d "$(dirname "$APK")"
    break
  fi
  sleep 10
done
test -f "$APK"

adb install -r -g "$APK"
if [ "$SCHEME" = dark ]; then adb shell cmd uimode night yes; else adb shell cmd uimode night no; fi
adb logcat -c
adb logcat '*:W' > "$OUT/logcat.txt" 2>&1 &
adb emu screenrecord start --time-limit 1800 "$OUT/video.webm" || true

status=0
maestro test e2e/maestro/p0.yaml \
  -e OUT_DIR="$OUT/screenshots" \
  -e INSIDE_LAT="$INSIDE_LAT" -e INSIDE_LNG="$INSIDE_LNG" \
  -e OUTSIDE_LAT="$OUTSIDE_LAT" -e OUTSIDE_LNG="$OUTSIDE_LNG" \
  --format junit --output "$OUT/report.xml" \
  --debug-output "$OUT/maestro" || status=$?

adb emu screenrecord stop || true
exit "$status"

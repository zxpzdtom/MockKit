#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="MockKit"
CONFIG="${1:-release}"
VERSION="${APP_VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || printf '0.1.0')}"
ARCH="$(uname -m)"
DIST_DIR="$ROOT/dist"
APP_DIR="$DIST_DIR/$APP_NAME.app"
DMG_PATH="$DIST_DIR/$APP_NAME-$VERSION-macos-$ARCH.dmg"
STAGING_DIR="$(mktemp -d)"
SIGNING_IDENTITY="${SIGNING_IDENTITY:-${APPLE_DEVELOPER_ID_APPLICATION:-}}"
NOTARY_APPLE_ID="${NOTARY_APPLE_ID:-${APPLE_ID:-}}"
NOTARY_PASSWORD="${NOTARY_PASSWORD:-${APPLE_APP_PASSWORD:-}}"
NOTARY_TEAM_ID="${NOTARY_TEAM_ID:-${APPLE_TEAM_ID:-}}"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

"$ROOT/scripts/build-app.sh" "$CONFIG"

rm -f "$DMG_PATH"
cp -R "$APP_DIR" "$STAGING_DIR/$APP_NAME.app"
ln -s /Applications "$STAGING_DIR/Applications"

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

if [[ -n "$SIGNING_IDENTITY" ]]; then
  echo "Signing $DMG_PATH with $SIGNING_IDENTITY"
  codesign --force --timestamp --sign "$SIGNING_IDENTITY" "$DMG_PATH"
  codesign --verify --verbose=2 "$DMG_PATH"
else
  echo "Skipping DMG signing because Developer ID signing is not configured. The app bundle is ad-hoc signed."
fi

if [[ -n "$NOTARY_APPLE_ID" && -n "$NOTARY_PASSWORD" && -n "$NOTARY_TEAM_ID" ]]; then
  echo "Submitting $DMG_PATH for notarization"
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$NOTARY_APPLE_ID" \
    --password "$NOTARY_PASSWORD" \
    --team-id "$NOTARY_TEAM_ID" \
    --wait
  xcrun stapler staple "$DMG_PATH"
  spctl --assess --type open --context context:primary-signature --verbose "$DMG_PATH"
else
  echo "Skipping notarization because NOTARY_APPLE_ID, NOTARY_PASSWORD, or NOTARY_TEAM_ID is not set."
fi

echo "Built $DMG_PATH"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="MockKit"
BUNDLE_ID="${BUNDLE_ID:-dev.codex.mockkit}"
CONFIG="${1:-debug}"
APP_VERSION="${APP_VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || printf '0.1.0')}"
APP_BUILD_NUMBER="${APP_BUILD_NUMBER:-${GITHUB_RUN_NUMBER:-1}}"
SIGNING_IDENTITY="${SIGNING_IDENTITY:-${APPLE_DEVELOPER_ID_APPLICATION:-}}"
CODE_SIGN_IDENTITY="${SIGNING_IDENTITY:--}"
CODE_SIGN_MODE="ad-hoc"
if [[ -n "$SIGNING_IDENTITY" ]]; then
  CODE_SIGN_MODE="Developer ID"
fi

cd "$ROOT"
if command -v pnpm >/dev/null 2>&1 && [[ -f "$ROOT/pnpm-lock.yaml" ]]; then
  pnpm --dir frontend run build
elif [[ "${npm_config_user_agent:-}" == yarn/* ]]; then
  yarn --cwd frontend build
else
  npm run build --prefix frontend
fi
if [[ "$CONFIG" == "release" ]]; then
  cargo build --release --bins
else
  cargo build --bins
fi

BUILD_DIR="$(swift build -c "$CONFIG" --show-bin-path)"
CARGO_DIR="$ROOT/target/$CONFIG"
APP_DIR="$ROOT/dist/$APP_NAME.app"
CONTENTS="$APP_DIR/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"

rm -rf "$BUILD_DIR/ChromeOverridesManager_ChromeOverridesManager.bundle"
swift build -c "$CONFIG"

rm -rf "$APP_DIR"
mkdir -p "$MACOS" "$RESOURCES"

cp "$BUILD_DIR/ChromeOverridesManager" "$MACOS/$APP_NAME"
cp "$CARGO_DIR/mockkit-core" "$MACOS/mockkit-core"
mkdir -p "$RESOURCES/CLI"
ln -s "../../MacOS/mockkit-core" "$RESOURCES/CLI/mockkit"
cp -R "$BUILD_DIR/ChromeOverridesManager_ChromeOverridesManager.bundle" "$RESOURCES/"
cp "$ROOT/assets/AppIcon.icns" "$RESOURCES/AppIcon.icns"

cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$APP_VERSION</string>
  <key>CFBundleVersion</key>
  <string>$APP_BUILD_NUMBER</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
PLIST

echo "Signing $APP_DIR with $CODE_SIGN_MODE identity ($CODE_SIGN_IDENTITY)"
if [[ "$CODE_SIGN_IDENTITY" == "-" ]]; then
  CODE_SIGN_FLAGS=(--force --sign "$CODE_SIGN_IDENTITY")
else
  CODE_SIGN_FLAGS=(--force --timestamp --options runtime --sign "$CODE_SIGN_IDENTITY")
fi
codesign "${CODE_SIGN_FLAGS[@]}" "$MACOS/mockkit-core"
codesign "${CODE_SIGN_FLAGS[@]}" "$MACOS/$APP_NAME"
codesign "${CODE_SIGN_FLAGS[@]}" "$APP_DIR"
codesign --verify --deep --strict --verbose=2 "$APP_DIR"

echo "Built $APP_DIR"

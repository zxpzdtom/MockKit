#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="MockKit"
BUNDLE_ID="dev.codex.mockkit"
CONFIG="${1:-debug}"

cd "$ROOT"
case "${npm_config_user_agent:-}" in
  pnpm/*)
    pnpm --dir frontend run build
    ;;
  yarn/*)
    yarn --cwd frontend build
    ;;
  *)
    npm run build --prefix frontend
    ;;
esac
rm -rf "$ROOT/.build/arm64-apple-macosx/$CONFIG/ChromeOverridesManager_ChromeOverridesManager.bundle"

if [[ "$CONFIG" == "release" ]]; then
  cargo build --release --bins
else
  cargo build --bins
fi

if [[ "$CONFIG" == "release" ]]; then
  swift build -c release
else
  swift build
fi

BUILD_DIR="$ROOT/.build/arm64-apple-macosx/$CONFIG"
CARGO_DIR="$ROOT/target/$CONFIG"
APP_DIR="$ROOT/dist/$APP_NAME.app"
CONTENTS="$APP_DIR/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"

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
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo "Built $APP_DIR"

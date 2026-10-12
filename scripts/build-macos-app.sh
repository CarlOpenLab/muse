#!/usr/bin/env bash
# build-macos-app.sh — 将 Go 二进制打包为 macOS .app bundle 并生成 DMG
#
# 用法（CI 中调用）：
#   scripts/build-macos-app.sh <binary> <icon.icns> <version>
#
# 输出：
#   dist/Muse.app          — 完整的 .app bundle
#   dist/Muse-<version>-macOS.dmg — 安装镜像

set -euo pipefail

BINARY="${1:?Usage: $0 <binary> <icon.icns> <version>}"
ICON="${2:?Usage: $0 <binary> <icon.icns> <version>}"
VERSION="${3:?Usage: $0 <binary> <icon.icns> <version>}"

APP_NAME="Muse"
BUNDLE_ID="com.muse.app"
DIST_DIR="$(cd "$(dirname "$0")/.." && pwd)/dist"
STAGE="$DIST_DIR/stage"
DMG_OUT="$DIST_DIR/Muse-${VERSION}-macOS.dmg"

rm -rf "$DIST_DIR"
mkdir -p "$STAGE"

# ── 1. 构建 .app bundle 结构 ──────────────────────────────────────────────

APP="$STAGE/${APP_NAME}.app"
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

# 复制二进制
cp "$BINARY" "$APP/Contents/MacOS/${APP_NAME}"
chmod +x "$APP/Contents/MacOS/${APP_NAME}"

# 复制图标
cp "$ICON" "$APP/Contents/Resources/icon.icns"

# ── 2. Info.plist ─────────────────────────────────────────────────────────

cat > "$APP/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>${APP_NAME}</string>
	<key>CFBundleIconFile</key>
	<string>icon</string>
	<key>CFBundleIdentifier</key>
	<string>${BUNDLE_ID}</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>${APP_NAME}</string>
	<key>CFBundleDisplayName</key>
	<string>${APP_NAME}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>${VERSION}</string>
	<key>CFBundleVersion</key>
	<string>${VERSION}</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSPrincipalClass</key>
	<string>NSApplication</string>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.productivity</string>
</dict>
</plist>
PLIST

echo "✅ .app bundle 创建完成: $APP"

# ── 3. Ad-hoc 签名（让 Gatekeeper 至少知道这是一个签名过的应用）──────────────

# 没有 Apple Developer ID 时做 ad-hoc 签名
# 有证书时可以在 CI 里用 Developer ID Application 证书替换这步
codesign --force --deep --sign - "$APP" 2>/dev/null || true

# ── 4. 生成 DMG ───────────────────────────────────────────────────────────

if command -v create-dmg &>/dev/null; then
  echo "使用 create-dmg 生成 DMG..."
  create-dmg \
    --volname "${APP_NAME}" \
    --volicon "$ICON" \
    --window-pos 200 120 \
    --window-size 600 400 \
    --icon-size 100 \
    --icon "${APP_NAME}.app" 180 185 \
    --hide-extension "${APP_NAME}.app" \
    --app-drop-link 420 185 \
    --background "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" \
    "$DMG_OUT" \
    "$STAGE"
else
  echo "使用 hdiutil 生成 DMG..."
  # hdiutil fallback — 创建一个简单的 DMG
  TMP_DMG="$DIST_DIR/tmp.dmg"
  MOUNT_POINT="/Volumes/${APP_NAME}"

  # 创建临时 DMG，足够放下 .app
  APP_SIZE=$(du -sh "$APP" | cut -f1)
  # 计算大小（MB），最少 50MB
  SIZE_MB=$(du -sm "$APP" | cut -f1)
  SIZE_MB=$((SIZE_MB < 50 ? 50 : SIZE_MB + 20))

  hdiutil create -size "${SIZE_MB}m" -fs HFS+ -volname "${APP_NAME}" "$TMP_DMG"
  hdiutil attach "$TMP_DMG" -nobrowse -mountpoint "$MOUNT_POINT"

  # 复制 .app 到 DMG
  cp -R "$APP" "$MOUNT_POINT/"

  # 创建 Applications 快捷方式
  ln -s /Applications "$MOUNT_POINT/Applications"

  # 设置 DMG 布局（AppleScript）
  osascript << APPLESCRIPT
tell application "Finder"
  tell disk "${APP_NAME}"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set bounds of container window to {400, 100, 1000, 500}
    set viewOptions to icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 100
    set position of item "${APP_NAME}.app" of container window to {150, 200}
    set position of item "Applications" of container window to {450, 200}
    close
  end tell
end tell
APPLESCRIPT

  hdiutil detach "$MOUNT_POINT"
  hdiutil convert "$TMP_DMG" -format UDZO -o "$DMG_OUT"
  rm -f "$TMP_DMG"
fi

echo "✅ DMG 创建完成: $DMG_OUT"
echo ""
echo "输出文件："
ls -lh "$DMG_OUT"

#!/bin/bash
# Fix Electron for macOS — re-extract from cache, sign, and create metadata files
# Run this whenever "electronapp一直被删除" happens
set -e

ELECTRON_DIR="$(cd "$(dirname "$0")/.." && pwd)/node_modules/electron"
CACHE_DIR="$HOME/Library/Caches/electron"
VERSION="31.7.7"
ZIP_FILE="$CACHE_DIR/electron-v$VERSION-darwin-arm64.zip"

echo "🔧 Fixing Electron..."

# 1. Extract the full Electron.app from cached zip (bypass broken extract-zip)
if [ -f "$ZIP_FILE" ]; then
    echo "  → Extracting Electron.app from cache..."
    rm -rf "$ELECTRON_DIR/dist/Electron.app"
    unzip -o "$ZIP_FILE" -d "$ELECTRON_DIR/dist/" > /dev/null
    echo "  ✓ Extracted ($(du -sh "$ELECTRON_DIR/dist/Electron.app" | cut -f1))"
else
    echo "  ⚠️  Cached zip not found, downloading..."
    cd "$(dirname "$0")/.."
    npm install electron@$VERSION --force
fi

# 2. Create path.txt (postinstall often fails to create this)
printf 'Electron.app/Contents/MacOS/Electron' > "$ELECTRON_DIR/path.txt"
echo "  ✓ Created path.txt"

# 3. Create version file
printf '%s' "$VERSION" > "$ELECTRON_DIR/dist/version"
echo "  ✓ Created dist/version"

# 4. Ad-hoc sign to prevent macOS Gatekeeper from killing the app
echo "  → Signing Electron.app (ad-hoc)..."
codesign --force --deep --sign - "$ELECTRON_DIR/dist/Electron.app" 2>/dev/null
echo "  ✓ Signed with ad-hoc signature"

echo "✅ Electron is ready. Run: npm run preview"

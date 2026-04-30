#!/usr/bin/env bash
# Build the release binary and wrap it into a double-clickable Teleprompter.app
# bundle. Output: dist/Teleprompter.app
#
# Usage: ./Scripts/build-app.sh [arch]
#   arch defaults to the host machine's arch. Use "x86_64" to cross-compile a
#   build for the older Intel Catalina target machine.

set -euo pipefail

cd "$(dirname "$0")/.."

ARCH="${1:-$(uname -m)}"
APP_NAME="Teleprompter"
BUNDLE_ID="com.connorbacon.teleprompter"
VERSION="2.0.0"
APP_BUNDLE="dist/${APP_NAME}.app"

echo "→ Building release binary (${ARCH})"
if [[ "${ARCH}" == "x86_64" ]]; then
    swift build -c release --arch x86_64
    BUILT_BIN=".build/x86_64-apple-macosx/release/${APP_NAME}"
elif [[ "${ARCH}" == "arm64" ]]; then
    swift build -c release --arch arm64
    BUILT_BIN=".build/arm64-apple-macosx/release/${APP_NAME}"
else
    swift build -c release
    BUILT_BIN=".build/release/${APP_NAME}"
fi

if [[ ! -f "${BUILT_BIN}" ]]; then
    echo "ERROR: built binary not found at ${BUILT_BIN}"
    exit 1
fi

echo "→ Wrapping into ${APP_BUNDLE}"
rm -rf "${APP_BUNDLE}"
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"

cp "${BUILT_BIN}" "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"
chmod +x "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"

cat > "${APP_BUNDLE}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
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
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
    <key>NSSupportsAutomaticTermination</key>
    <false/>
    <key>NSSupportsSuddenTermination</key>
    <false/>
</dict>
</plist>
EOF

echo "→ Ad-hoc codesigning (so Gatekeeper accepts it as a self-built app)"
codesign --force --deep --sign - "${APP_BUNDLE}"

echo
echo "✓ Built ${APP_BUNDLE}"
echo "  Drop into /Applications, or double-click in Finder to run."

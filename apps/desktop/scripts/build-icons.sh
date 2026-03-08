#!/bin/bash
# Generate platform-specific icons from a source PNG
# Usage: ./scripts/build-icons.sh source.png
#
# Requirements:
# - macOS: iconutil (built-in)
# - Windows: convert from ImageMagick
# - Linux: source PNG used directly

SOURCE="${1:-assets/icon-source.png}"
echo "Icon generation script placeholder"
echo "Place your 1024x1024 PNG at: $SOURCE"
echo "Then run this script to generate platform icons."
echo ""
echo "For macOS (.icns):"
echo "  mkdir -p icon.iconset"
echo "  sips -z 16 16 \$SOURCE --out icon.iconset/icon_16x16.png"
echo "  sips -z 512 512 \$SOURCE --out icon.iconset/icon_512x512.png"
echo "  iconutil -c icns icon.iconset -o assets/icon.icns"
echo ""
echo "For Windows (.ico):"
echo "  convert \$SOURCE -resize 256x256 assets/icon.ico"

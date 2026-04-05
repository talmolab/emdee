#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: '$VERSION' is not a valid semver version"
  exit 1
fi

echo "Bumping version to $VERSION..."

# package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/package.json"
rm -f "$ROOT/package.json.bak"

# src-tauri/tauri.conf.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/src-tauri/tauri.conf.json"
rm -f "$ROOT/src-tauri/tauri.conf.json.bak"

# src-tauri/Cargo.toml (only the first version = line, under [package])
awk -v ver="$VERSION" '!done && /^version = "/ { sub(/"[^"]*"/, "\"" ver "\""); done=1 } 1' "$ROOT/src-tauri/Cargo.toml" > "$ROOT/src-tauri/Cargo.toml.tmp"
mv "$ROOT/src-tauri/Cargo.toml.tmp" "$ROOT/src-tauri/Cargo.toml"

echo "Updated:"
echo "  package.json         -> $VERSION"
echo "  tauri.conf.json      -> $VERSION"
echo "  Cargo.toml           -> $VERSION"
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m \"Bump version to $VERSION\""
echo "  git push"
echo "  Create release v$VERSION on GitHub"

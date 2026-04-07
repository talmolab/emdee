#!/usr/bin/env sh
set -eu

REPO="talmolab/emdee"
APP_NAME="emdee"

main() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Darwin) platform="macos" ;;
    Linux)  platform="linux" ;;
    *)
      echo "Error: Unsupported operating system: $OS"
      echo "This installer supports macOS and Linux. For Windows, use install.ps1."
      exit 1
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64)  arch="x86_64" ;;
    arm64|aarch64)  arch="aarch64" ;;
    *)
      echo "Error: Unsupported architecture: $ARCH"
      exit 1
      ;;
  esac

  echo "Detected: $OS ($ARCH)"

  # Fetch latest release version
  echo "Fetching latest release..."
  if command -v curl >/dev/null 2>&1; then
    RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")"
  elif command -v wget >/dev/null 2>&1; then
    RELEASE_JSON="$(wget -qO- "https://api.github.com/repos/$REPO/releases/latest")"
  else
    echo "Error: curl or wget is required"
    exit 1
  fi

  VERSION="$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/')"

  if [ -z "$VERSION" ]; then
    echo "Error: Could not determine latest version"
    exit 1
  fi

  echo "Latest version: v$VERSION"

  case "$platform" in
    macos)
      install_macos "$VERSION"
      ;;
    linux)
      install_linux "$VERSION" "$arch"
      ;;
  esac
}

download() {
  url="$1"
  dest="$2"
  echo "Downloading: $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fSL -o "$dest" "$url"
  else
    wget -q -O "$dest" "$url"
  fi
}

install_macos() {
  version="$1"
  dmg_name="${APP_NAME}_${version}_universal.dmg"
  url="https://github.com/$REPO/releases/download/v${version}/${dmg_name}"

  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  download "$url" "$tmpdir/$dmg_name"

  echo "Installing to /Applications..."
  hdiutil attach "$tmpdir/$dmg_name" -nobrowse -quiet -mountpoint "$tmpdir/mnt"

  # Remove existing installation if present
  if [ -d "/Applications/${APP_NAME}.app" ]; then
    rm -rf "/Applications/${APP_NAME}.app"
  fi

  cp -R "$tmpdir/mnt/${APP_NAME}.app" /Applications/
  hdiutil detach "$tmpdir/mnt" -quiet

  echo ""
  echo "Installed ${APP_NAME} v${version} to /Applications/${APP_NAME}.app"

  # Create CLI symlink so `emdee` works from terminal
  cli_binary="/Applications/${APP_NAME}.app/Contents/MacOS/${APP_NAME}"
  if [ -x "$cli_binary" ]; then
    symlink_created=false

    # Prefer ~/.local/bin (no sudo required)
    user_bin="${HOME}/.local/bin"
    if mkdir -p "$user_bin" 2>/dev/null; then
      ln -sf "$cli_binary" "$user_bin/${APP_NAME}"
      echo "Created symlink: $user_bin/${APP_NAME}"
      symlink_created=true

      case ":$PATH:" in
        *":$user_bin:"*) ;;
        *)
          echo ""
          echo "Note: $user_bin is not in your PATH. Add it with:"
          echo "  export PATH=\"$user_bin:\$PATH\""
          ;;
      esac
    fi

    # Also symlink to /usr/local/bin if writable (no sudo)
    if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
      ln -sf "$cli_binary" "/usr/local/bin/${APP_NAME}"
      echo "Created symlink: /usr/local/bin/${APP_NAME}"
      symlink_created=true
    fi

    if [ "$symlink_created" = false ]; then
      echo ""
      echo "Note: Could not create CLI symlink. To use from terminal, run:"
      echo "  mkdir -p ~/.local/bin && ln -sf \"$cli_binary\" ~/.local/bin/${APP_NAME}"
    fi
  fi

  echo ""
  echo "Usage:"
  echo "  ${APP_NAME} README.md"
  echo "  open -a ${APP_NAME} README.md"
}

install_linux() {
  version="$1"
  arch="$2"

  # Map architecture to Debian naming
  case "$arch" in
    x86_64)   deb_arch="amd64" ;;
    aarch64)  deb_arch="arm64" ;;
    *)        deb_arch="$arch" ;;
  esac

  # Prefer .deb if dpkg is available, otherwise use AppImage
  if command -v dpkg >/dev/null 2>&1; then
    deb_name="${APP_NAME}_${version}_${deb_arch}.deb"
    url="https://github.com/$REPO/releases/download/v${version}/${deb_name}"

    tmpdir="$(mktemp -d)"
    trap 'rm -rf "$tmpdir"' EXIT

    download "$url" "$tmpdir/$deb_name"

    echo "Installing .deb package (requires sudo)..."
    sudo dpkg -i "$tmpdir/$deb_name" || sudo apt-get install -f -y

    echo ""
    echo "Installed ${APP_NAME} v${version}"
    echo ""
    echo "Usage: ${APP_NAME} README.md"
  else
    appimage_name="${APP_NAME}_${version}_${deb_arch}.AppImage"
    url="https://github.com/$REPO/releases/download/v${version}/${appimage_name}"

    install_dir="${HOME}/.local/bin"
    mkdir -p "$install_dir"

    download "$url" "$install_dir/$APP_NAME"
    chmod +x "$install_dir/$APP_NAME"

    echo ""
    echo "Installed ${APP_NAME} v${version} to $install_dir/$APP_NAME"

    case ":$PATH:" in
      *":$install_dir:"*) ;;
      *)
        echo ""
        echo "Note: $install_dir is not in your PATH. Add it with:"
        echo "  export PATH=\"$install_dir:\$PATH\""
        ;;
    esac

    echo ""
    echo "Usage: ${APP_NAME} README.md"
  fi
}

main "$@"

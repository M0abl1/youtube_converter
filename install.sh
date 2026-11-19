#!/bin/sh
# Install ytconv from the latest GitHub release.
#   curl -fsSL https://raw.githubusercontent.com/M0abl1/youtube_converter/main/install.sh | sh
# Env: YTCONV_VERSION (e.g. v1.0.0, default latest), YTCONV_INSTALL_DIR (default /usr/local/bin)
set -eu

repo="M0abl1/youtube_converter"
install_dir="${YTCONV_INSTALL_DIR:-/usr/local/bin}"

os=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$os" in
  darwin|linux) ;;
  *) echo "ytconv: unsupported OS: $os (on Windows, download the zip from https://github.com/$repo/releases)" >&2; exit 1 ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64|amd64) arch=amd64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) echo "ytconv: unsupported architecture: $arch" >&2; exit 1 ;;
esac

if [ -n "${YTCONV_VERSION:-}" ]; then
  base="https://github.com/$repo/releases/download/$YTCONV_VERSION"
else
  base="https://github.com/$repo/releases/latest/download"
fi
archive="ytd_${os}_${arch}.tar.gz"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $archive..."
curl -fsSL "$base/$archive" -o "$tmp/$archive"
curl -fsSL "$base/checksums.txt" -o "$tmp/checksums.txt"

expected=$(grep " $archive\$" "$tmp/checksums.txt" | cut -d' ' -f1)
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$archive" | cut -d' ' -f1)
else
  actual=$(shasum -a 256 "$tmp/$archive" | cut -d' ' -f1)
fi
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "ytconv: checksum mismatch for $archive" >&2
  exit 1
fi

tar -xzf "$tmp/$archive" -C "$tmp" ytconv

if [ -w "$install_dir" ]; then
  install -m 755 "$tmp/ytconv" "$install_dir/ytconv"
else
  echo "Installing to $install_dir (needs sudo)..."
  sudo install -m 755 "$tmp/ytconv" "$install_dir/ytconv"
fi

echo "Installed: $("$install_dir/ytconv" version | head -1)"

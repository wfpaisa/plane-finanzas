#!/usr/bin/env bash
# Descarga el binario de PocketBase para este sistema en pocketbase/pocketbase.
set -euo pipefail
VERSION="${PB_VERSION:-0.40.4}"
case "$(uname -s)" in Linux) OS=linux ;; Darwin) OS=darwin ;; *) echo "Sistema no soportado"; exit 1 ;; esac
case "$(uname -m)" in x86_64|amd64) ARCH=amd64 ;; arm64|aarch64) ARCH=arm64 ;; *) echo "Arquitectura no soportada"; exit 1 ;; esac
DIR="$(cd "$(dirname "$0")/.." && pwd)/pocketbase"
TMP="$(mktemp -d)"
URL="https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_${OS}_${ARCH}.zip"
echo "Descargando $URL"
curl -fsSL -o "$TMP/pb.zip" "$URL"
unzip -o -q "$TMP/pb.zip" pocketbase -d "$DIR"
chmod +x "$DIR/pocketbase"
rm -rf "$TMP"
"$DIR/pocketbase" --version

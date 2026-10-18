#!/usr/bin/env bash
# Builds the app and an Arch package: packaging/arch/termglass-<ver>-1-x86_64.pkg.tar.zst
set -euo pipefail
cd "$(dirname "$0")/../.."
npm run build
npx electron-builder --linux dir
cd packaging/arch
PKGDEST="$PWD" BUILDDIR="$(mktemp -d)" makepkg -f --nodeps

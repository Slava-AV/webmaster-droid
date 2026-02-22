#!/usr/bin/env bash
set -euo pipefail
SRC_DIR="${1:-src}"

npx webmaster-droid scan "$SRC_DIR" --out .webmaster-droid/scan-report.json
npx webmaster-droid codemod "$SRC_DIR" --out .webmaster-droid/codemod-report.json

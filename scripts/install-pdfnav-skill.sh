#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${CODEX_HOME:-}" ]]; then
  echo "CODEX_HOME is not set." >&2
  echo "Export CODEX_HOME first, for example:" >&2
  echo "  export CODEX_HOME=\"$HOME/.codex\"" >&2
  exit 1
fi

TARGET_DIR="${CODEX_HOME}/skills/pdf"
SOURCE_FILE="${REPO_ROOT}/skills/pdfnav-pdf/SKILL.md"

mkdir -p "${TARGET_DIR}"
cp "${SOURCE_FILE}" "${TARGET_DIR}/SKILL.md"

echo "Installed pdfnav skill to: ${TARGET_DIR}/SKILL.md"

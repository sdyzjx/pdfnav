#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${CODEX_HOME:-}" ]]; then
  export CODEX_HOME="$HOME/.codex"
fi

TARGET_DIR="${CODEX_HOME}/skills/pdf"
SOURCE_FILE="${REPO_ROOT}/skills/pdfnav-pdf/SKILL.md"

mkdir -p "${TARGET_DIR}"
cp "${SOURCE_FILE}" "${TARGET_DIR}/SKILL.md"

echo "Installed pdfnav skill to: ${TARGET_DIR}/SKILL.md"

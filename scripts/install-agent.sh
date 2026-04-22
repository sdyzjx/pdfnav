#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

cd "${REPO_ROOT}"

echo "[pdfnav] Installing local dependencies"
npm install

echo "[pdfnav] Linking CLI into the current npm prefix"
npm link

echo "[pdfnav] Installing bundled Codex skill"
CODEX_HOME="${CODEX_HOME}" bash "${SCRIPT_DIR}/install-pdfnav-skill.sh"

CLI_PATH="$(command -v pdfnav || true)"

if [[ -z "${CLI_PATH}" ]]; then
  echo "[pdfnav] Installation finished, but 'pdfnav' is still not on PATH." >&2
  echo "[pdfnav] Check your npm global bin directory and PATH configuration." >&2
  exit 1
fi

echo "[pdfnav] CLI ready at: ${CLI_PATH}"
echo "[pdfnav] Skill installed at: ${CODEX_HOME}/skills/pdf/SKILL.md"
echo "[pdfnav] Verify with: pdfnav --help"

#!/bin/bash
# Installs the "hebrew-rtl" mod for Claude Code in the Claude desktop app (macOS).
#
# What this script does, and nothing else:
#   1. finds the Claude Code engine that ships inside the Claude desktop app
#   2. copies the mod from this folder into  ~/.claude/maind-mods/
#   3. checks the mod with the engine's own validator and test runner
#   4. registers that folder as a local plugin source and installs the mod
#      for the current user (so every session loads it)
#   5. verifies the result and prints one last line:  RESULT: OK  or  RESULT: FAILED - <CODE>
#
# It downloads nothing, needs no password, and touches no folder outside ~/.claude.
set -u

KIT="$(cd "$(dirname "$0")" && pwd)"
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="$CFG/maind-mods"
MOD="$DEST/mods/hebrew-rtl"
ID="hebrew-rtl@maind-mods"
VERSION="0.3.2"

fail() { echo; echo "RESULT: FAILED - $1"; exit 1; }
step() { echo; echo "== $1"; }

[ "$(uname -s)" = "Darwin" ] || fail "NOT_MAC"
# The mod sits under marketplace/ in the zip kit, and at the top of the repository.
if [ -d "$KIT/marketplace" ]; then SRC="$KIT/marketplace"; else SRC="$KIT"; fi
[ -f "$SRC/mods/hebrew-rtl/hooks/rtl.tsx" ] && [ -f "$SRC/.claude-plugin/marketplace.json" ] || fail "KIT_INCOMPLETE"

step "1/6 Find the Claude Code engine"
BIN="${CLAUDE_BIN:-}"
if [ -z "$BIN" ]; then
  BIN="$(ls -t "$HOME/Library/Application Support/Claude/claude-code"/*/*/claude.app/Contents/MacOS/claude 2>/dev/null | head -1)"
fi
if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then BIN="$(command -v claude 2>/dev/null || true)"; fi
if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then fail "NO_ENGINE"; fi
echo "engine: $BIN"
echo "version: $("$BIN" --version 2>&1 | head -1)"

step "2/6 Another copy of this mod must not be active"
OTHER="$("$BIN" plugin list 2>&1 | grep -E "hebrew-rtl@" | grep -v "$ID" || true)"
if [ -n "$OTHER" ]; then echo "$OTHER"; fail "OTHER_COPY_INSTALLED"; fi
echo "none"

step "3/6 Copy the mod to $DEST"
mkdir -p "$DEST/.claude-plugin" "$DEST/mods" || fail "CANNOT_WRITE"
rm -rf "$MOD"
cp "$SRC/.claude-plugin/marketplace.json" "$DEST/.claude-plugin/marketplace.json" || fail "CANNOT_WRITE"
cp -R "$SRC/mods/hebrew-rtl" "$DEST/mods/" || fail "CANNOT_WRITE"
echo "copied"

step "4/6 Check the mod with the engine"
OUT="$("$BIN" plugin validate "$MOD" 2>&1)"
echo "$OUT" | tail -6
echo "$OUT" | grep -q "ui.render{component=AssistantMessage}" || fail "APP_TOO_OLD"
echo "$OUT" | grep -q "Validation passed" || fail "VALIDATE_FAILED"
OUT="$("$BIN" plugin test "$MOD" 2>&1)"
echo "$OUT" | tail -4
if ! echo "$OUT" | grep -Eq "[1-9][0-9]* pass" || ! echo "$OUT" | grep -q " 0 fail"; then fail "TESTS_FAILED"; fi

step "5/6 Install for every session"
if "$BIN" plugin marketplace list 2>&1 | grep -q "maind-mods"; then
  "$BIN" plugin marketplace update maind-mods 2>&1 | tail -2
else
  "$BIN" plugin marketplace add "$DEST" 2>&1 | tail -2
fi
"$BIN" plugin marketplace list 2>&1 | grep -q "maind-mods" || fail "SOURCE_NOT_ADDED"
if "$BIN" plugin list 2>&1 | grep -q "$ID"; then
  "$BIN" plugin update "$ID" 2>&1 | tail -2
  "$BIN" plugin enable "$ID" >/dev/null 2>&1 || true
else
  "$BIN" plugin install "$ID" --scope user 2>&1 | tail -2
fi

step "6/6 Verify"
LIST="$("$BIN" plugin list 2>&1 | grep -A4 "$ID" || true)"
echo "$LIST"
echo "$LIST" | grep -q "Version: $VERSION" || fail "NOT_INSTALLED"
echo "$LIST" | grep -q "enabled" || fail "NOT_ENABLED"
cmp -s "$SRC/mods/hebrew-rtl/hooks/rtl.tsx" "$MOD/hooks/rtl.tsx" || fail "FILES_DIFFER"

echo
echo "RESULT: OK"

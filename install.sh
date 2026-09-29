#!/bin/sh
# ============================================================================
# open-pptd CLI one-shot installer (Linux / macOS)
# ----------------------------------------------------------------------------
# Downloads a runtime zip from GitHub Releases (latest by default), verifies
# its SHA256, unpacks it into ~/.open-pptd/cli/versions/<ver>, switches the
# `current` pointer, writes a launcher, and idempotently wires cli/bin into
# PATH (prefers ~/.local/bin; otherwise writes a marked rc block).
# Finally it installs the icon assets by default; fonts are opt-in (--fonts).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.sh | sh
#   ./install.sh [--version 2.0.0] [--home <dir>] [--fonts] [--force] [--dry-run]
#
# Idempotent: re-running the same command writes nothing when the installed
# version already satisfies the request.
# This file is intentionally ASCII-only (cross-platform, encoding-safe).
# ============================================================================
set -eu

REPO="Shingwha/open-pptd"
GH="https://github.com/$REPO"
API_LATEST="https://api.github.com/repos/$REPO/releases/latest"

# ---- Arguments ----
VERSION=""
HOME_DIR=""
FONTS=0
FORCE=0
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --version|-v) VERSION="${2:-}"; shift 2 ;;
    --home)       HOME_DIR="${2:-}"; shift 2 ;;
    --fonts)      FONTS=1; shift ;;
    --force|-f)   FORCE=1; shift ;;
    --dry-run|-n|--whatif) DRY=1; shift ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
step() { printf '\n> %s\n' "$*"; }
good() { printf '  OK  %s\n' "$*"; }
warn() { printf '  !   %s\n' "$*" >&2; }
die()  { printf '  ERR %s\n' "$*" >&2; exit 1; }

# ---- Download / fetch text (curl first, then wget) ----
fetch_file() { # url dest
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -H "User-Agent: open-pptd-installer" "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" --header="User-Agent: open-pptd-installer" "$1"
  else
    die "curl or wget is required to download"
  fi
}
fetch_text() { # url -> stdout
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -H "User-Agent: open-pptd-installer" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O - --header="User-Agent: open-pptd-installer" "$1"
  else
    return 1
  fi
}
sha256_of() { # path -> lowercase hex
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print tolower($1)}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print tolower($1)}'
  else
    die "sha256sum or shasum is required to verify the download"
  fi
}

say "open-pptd installer (Linux/macOS)$( [ "$DRY" = 1 ] && printf ' - dry-run' )"

# ---- (1) Home + target paths ----
if [ -n "$HOME_DIR" ]; then :
elif [ -n "${OPEN_PPTD_HOME:-}" ]; then HOME_DIR="$OPEN_PPTD_HOME"
else HOME_DIR="$HOME/.open-pptd"
fi
VERSIONS_DIR="$HOME_DIR/cli/versions"
CURRENT_PTR="$HOME_DIR/cli/current"
BIN_DIR="$HOME_DIR/cli/bin"

# Detect installed version locally (no network).
INSTALLED=""
if [ -f "$CURRENT_PTR/package.json" ]; then
  INSTALLED=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CURRENT_PTR/package.json" | head -1)
fi

# ---- (2) Preflight: node ----
if ! command -v node >/dev/null 2>&1; then
  die "node not found. Install Node.js >= 18 and put it on PATH; the open-pptd runtime needs it."
fi
good "node $(node --version)"

# ---- (3) Idempotency probe ----
if [ "$FORCE" = 0 ]; then
  if [ -n "$VERSION" ] && [ "$INSTALLED" = "$VERSION" ]; then
    good "already installed: v$INSTALLED ($VERSIONS_DIR/$VERSION); nothing to do"
    say "  next: open-pptd doctor"
    exit 0
  fi
  if [ -z "$VERSION" ] && [ -n "$INSTALLED" ]; then
    good "already installed: v$INSTALLED ($CURRENT_PTR)"
    say "  next: open-pptd doctor"
    say "  (to upgrade/reinstall latest: re-run with --force)"
    exit 0
  fi
fi

# ---- (4) Resolve version (prefer SHA256SUMS, fall back to GitHub API) ----
# SHA256SUMS is a mandatory release asset whose content IS the checksums, so
# parsing it is steadier than the API (no rate limit, and the checksum file is
# needed for verification anyway). The API is only a fallback.
SUMS_TEXT=""
if [ -z "$VERSION" ]; then
  step "resolving latest version..."
  SUMS_TEXT=$(fetch_text "$GH/releases/latest/download/SHA256SUMS" 2>/dev/null || true)
  VERSION=$(printf '%s' "$SUMS_TEXT" | sed -n 's/.*open-pptd-v\([0-9][0-9.]*\)\.zip.*/\1/p' | head -1)
  [ -n "$VERSION" ] && good "SHA256SUMS -> latest v$VERSION"
  if [ -z "$VERSION" ]; then
    tag=$(fetch_text "$API_LATEST" 2>/dev/null | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' | head -1 || true)
    VERSION="$tag"
    [ -n "$VERSION" ] && good "GitHub API -> latest v$VERSION"
  fi
fi
[ -n "$VERSION" ] || die "cannot resolve latest version (both SHA256SUMS and GitHub API failed)"
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "invalid version: $VERSION (expected x.y.z)"

RUNTIME_ZIP="open-pptd-v$VERSION.zip"
# Tag-pinned URL: works for both `latest` and a pinned version.
RUNTIME_URL="$GH/releases/download/v$VERSION/$RUNTIME_ZIP"
SUMS_URL="$GH/releases/download/v$VERSION/SHA256SUMS"

TMP_ROOT="$HOME_DIR/tmp"
STAGE_DIR="$TMP_ROOT/install-$VERSION-$$"
ZIP_PATH="$TMP_ROOT/$RUNTIME_ZIP"
TARGET_VER="$VERSIONS_DIR/$VERSION"

step "install open-pptd v$VERSION"
say "  home    : $HOME_DIR"
say "  runtime : $RUNTIME_URL"

# ---- dry-run: print planned actions and exit ----
if [ "$DRY" = 1 ]; then
  say "  [dry-run] download $RUNTIME_URL -> $ZIP_PATH"
  say "  [dry-run] download $SUMS_URL -> verify SHA256 (abort + clean on mismatch)"
  say "  [dry-run] unpack $ZIP_PATH -> $STAGE_DIR, then rename to $TARGET_VER"
  say "  [dry-run] switch current pointer -> versions/$VERSION"
  say "  [dry-run] write launcher $BIN_DIR/open-pptd (resolves node at call time)"
  say "  [dry-run] PATH: prefer ~/.local/bin, else write '# >>> open-pptd >>>' block into ~/.profile / ~/.zshrc"
  say "  [dry-run] download+install icon assets into $HOME_DIR/assets/icons (warn only on failure)"
  [ "$FONTS" = 1 ] && say "  [dry-run] download+install font assets into $HOME_DIR/assets/fonts (warn only on failure)"
  say "  [dry-run] final print: version / path / new-terminal hint / next step open-pptd doctor"
  say ""
  say "OK dry-run complete; nothing was changed"
  exit 0
fi

command -v unzip >/dev/null 2>&1 || die "unzip is required (apt install unzip / brew install unzip)"
mkdir -p "$TMP_ROOT"

cleanup() { rm -rf "$STAGE_DIR" "$ZIP_PATH" 2>/dev/null || true; }
trap 'cleanup' EXIT INT TERM

# ---- (4b) Download runtime + mandatory SHA256 check ----
say "  - downloading runtime zip..."
fetch_file "$RUNTIME_URL" "$ZIP_PATH"
SUMS_PATH="$TMP_ROOT/SHA256SUMS"
EXPECTED=""
if fetch_file "$SUMS_URL" "$SUMS_PATH" 2>/dev/null; then
  EXPECTED=$(grep -F "$RUNTIME_ZIP" "$SUMS_PATH" 2>/dev/null | awk '{print tolower($1)}' | head -1 || true)
fi
[ -n "$EXPECTED" ] || die "no checksum for $RUNTIME_ZIP in SHA256SUMS; refusing to install"
ACTUAL=$(sha256_of "$ZIP_PATH")
[ "$ACTUAL" = "$EXPECTED" ] || { cleanup; die "SHA256 mismatch: expected $EXPECTED, got $ACTUAL (temp files cleaned, install aborted)"; }
good "SHA256 verified ($(printf '%s' "$EXPECTED" | cut -c1-12)...)"

# ---- (5) Unpack to tmp, then rename (avoids half-written installs) ----
rm -rf "$STAGE_DIR"; mkdir -p "$STAGE_DIR"
say "  - unpacking..."
unzip -q "$ZIP_PATH" -d "$STAGE_DIR"
# The runtime zip wraps everything in open-pptd/; strip that layer.
SRC_ROOT="$STAGE_DIR"
[ -f "$STAGE_DIR/open-pptd/bin/open-pptd.js" ] && SRC_ROOT="$STAGE_DIR/open-pptd"
[ -f "$SRC_ROOT/bin/open-pptd.js" ] || { cleanup; die "malformed runtime zip: bin/open-pptd.js not found"; }
mkdir -p "$VERSIONS_DIR"
rm -rf "$TARGET_VER"
mv "$SRC_ROOT" "$TARGET_VER"
good "unpacked to $TARGET_VER"

# ---- (6) Switch current pointer (symlink) ----
mkdir -p "$(dirname "$CURRENT_PTR")"
rm -f "$CURRENT_PTR"
ln -s "versions/$VERSION" "$CURRENT_PTR"
good "current -> versions/$VERSION"

# ---- (7) Write launcher (resolves node at call time) ----
# The launcher path is baked absolute (not $(dirname "$0")) so it also works when
# symlinked from ~/.local/bin. node is resolved at call time so nvm/fnm/volta work.
mkdir -p "$BIN_DIR"
{
  printf '#!/bin/sh\n'
  printf 'command -v node >/dev/null 2>&1 || { echo "open-pptd: node not found, install Node.js and add it to PATH" >&2; exit 127; }\n'
  printf 'exec node "%s/../current/bin/open-pptd.js" "$@"\n' "$BIN_DIR"
} > "$BIN_DIR/open-pptd"
chmod +x "$BIN_DIR/open-pptd"
good "launcher: $BIN_DIR/open-pptd"

# ---- (8) PATH (prefer ~/.local/bin; else an rc marker block) ----
LOCAL_BIN="$HOME/.local/bin"
case ":$PATH:" in
  *":$LOCAL_BIN:"*)
    mkdir -p "$LOCAL_BIN"
    ln -sf "$BIN_DIR/open-pptd" "$LOCAL_BIN/open-pptd"
    good "linked to $LOCAL_BIN/open-pptd (that directory is already on PATH)"
    ;;
  *)
    for rc in "$HOME/.profile" "$HOME/.zshrc"; do
      if ! grep -q '# >>> open-pptd >>>' "$rc" 2>/dev/null; then
        {
          printf '\n# >>> open-pptd >>>\n'
          printf 'export PATH="%s:$PATH"\n' "$BIN_DIR"
          printf '# <<< open-pptd <<<\n'
        } >> "$rc"
        good "wrote PATH block into $rc"
      else
        good "$rc already has the open-pptd block (idempotent, not written again)"
      fi
    done
    say "  hint: new shells pick it up automatically; for this shell run: export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

# ---- (9) Assets: icons by default; fonts opt-in ----
install_asset() { # kind zipname
  _kind="$1"; _zip="$2"
  _url="$GH/releases/download/v$VERSION/$_zip"
  _path="$TMP_ROOT/$_zip"
  if ! fetch_file "$_url" "$_path" 2>/dev/null; then
    warn "$_kind asset download failed (CLI still works; retry later with: open-pptd assets sync $_kind)"
    return 0
  fi
  if [ -f "$SUMS_PATH" ]; then
    _exp=$(grep -F "$_zip" "$SUMS_PATH" 2>/dev/null | awk '{print tolower($1)}' | head -1 || true)
    if [ -n "$_exp" ] && [ "$(sha256_of "$_path")" != "$_exp" ]; then
      warn "$_kind asset SHA256 mismatch; skipping"; rm -f "$_path"; return 0
    fi
  fi
  mkdir -p "$HOME_DIR/assets"
  unzip -q -o "$_path" -d "$HOME_DIR/assets"
  rm -f "$_path"
  good "$_kind assets installed into $HOME_DIR/assets"
}
step "install assets"
install_asset "icons" "open-pptd-icons-v$VERSION.zip"
if [ "$FONTS" = 1 ]; then install_asset "fonts" "open-pptd-fonts-v$VERSION.zip"
else warn "fonts not installed (large). When needed: open-pptd assets sync fonts"; fi

# ---- (10) Wrap-up ----
step "complete"
say "  version  : v$VERSION"
say "  location : $TARGET_VER"
say "  launcher : $BIN_DIR/open-pptd"
say "  home     : $HOME_DIR"
say "  PATH     : wired (new terminals / new shells pick it up)"
say "  next     : open-pptd doctor"
say ""

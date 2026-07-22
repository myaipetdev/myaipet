#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$PROJECT_ROOT/desktop-pet"
ROOT_ARCHIVE="$PROJECT_ROOT/petclaw-extension.zip"
PUBLIC_ARCHIVE="$PROJECT_ROOT/web/public/petclaw-extension.zip"
PUBLIC_CHECKSUM="$PROJECT_ROOT/web/public/petclaw-extension.zip.sha256"
BUILD_TEMP="$(mktemp -d "${TMPDIR:-/tmp}/petclaw-extension.XXXXXX")"
BUILD_ARCHIVE="$BUILD_TEMP/petclaw-extension.zip"
REPRO_ARCHIVE="$BUILD_TEMP/petclaw-extension-repro.zip"
CHECK_ONLY=false

case "${1:-}" in
  "") ;;
  --check) CHECK_ONLY=true ;;
  *)
    echo "Usage: $0 [--check]" >&2
    exit 2
    ;;
esac

cleanup() {
  rm -rf -- "$BUILD_TEMP"
}
trap cleanup EXIT

node "$SOURCE_DIR/site-access-contract.test.cjs"

# The popup pairing CTA and the signed-in dashboard anchor are one contract.
# Catch soft-404/dead-anchor regressions before packaging the extension.
if ! grep -Fq 'section=sovereignty#extension-token' "$SOURCE_DIR/popup.html" \
  || ! grep -Fq 'id="extension-token"' "$PROJECT_ROOT/web/src/components/SovereigntyDashboard.tsx"; then
  echo "Extension pairing deep-link does not match the dashboard token anchor." >&2
  exit 1
fi

VERSION="$(node -p "require('$SOURCE_DIR/manifest.json').version")"
if ! grep -Fq "export const PETCLAW_EXTENSION_VERSION = \"$VERSION\";" "$PROJECT_ROOT/web/src/lib/petclaw-extension.ts"; then
  echo "Extension version mismatch: manifest is $VERSION but the dashboard is not." >&2
  exit 1
fi
if ! grep -Fq "const EXT_VERSION = \"$VERSION\";" "$SOURCE_DIR/popup.js"; then
  echo "Extension version mismatch: manifest is $VERSION but the popup fallback is not." >&2
  exit 1
fi
if ! grep -Fq "PETCLAW_EXPECTED_EXTENSION_VERSION=\"$VERSION\"" "$PROJECT_ROOT/deploy/release-smoke.sh"; then
  echo "Extension version mismatch: manifest is $VERSION but the release smoke is not." >&2
  exit 1
fi

mkdir -p "$BUILD_TEMP/package/icons"
for file in manifest.json background.js content.js popup.html popup.js styles.css; do
  cp "$SOURCE_DIR/$file" "$BUILD_TEMP/package/$file"
done
for file in icon16.png icon48.png icon128.png; do
  cp "$SOURCE_DIR/icons/$file" "$BUILD_TEMP/package/icons/$file"
done

# Fixed timestamps + sorted paths + stripped extra fields make identical source
# produce an identical archive across local machines and CI.
find "$BUILD_TEMP/package" -exec touch -t 198001010000 {} +
build_archive() {
  local target="$1"
  (
    cd "$BUILD_TEMP/package"
    LC_ALL=C find . -type f -print | LC_ALL=C sort | zip -X -q "$target" -@
  )
}
build_archive "$BUILD_ARCHIVE"
build_archive "$REPRO_ARCHIVE"
if ! cmp -s "$BUILD_ARCHIVE" "$REPRO_ARCHIVE"; then
  echo "Archive reproducibility check failed." >&2
  exit 1
fi

PACKED_VERSION="$(unzip -p "$BUILD_ARCHIVE" manifest.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).version))')"
if [[ "$PACKED_VERSION" != "$VERSION" ]]; then
  echo "Archive verification failed: expected $VERSION, found $PACKED_VERSION" >&2
  exit 1
fi

node - "$BUILD_ARCHIVE" <<'NODE'
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const archive = process.argv[2];
const expected = [
  "background.js", "content.js", "icons/icon128.png", "icons/icon16.png",
  "icons/icon48.png", "manifest.json", "popup.html", "popup.js", "styles.css",
].sort();
const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
  .trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(entries, expected, "archive contains an unexpected or missing file");
const hangul = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;
for (const file of expected.filter((name) => /\.(?:js|json|html|css)$/.test(name))) {
  const text = execFileSync("unzip", ["-p", archive, file], { encoding: "utf8" });
  assert.doesNotMatch(text, hangul, `${file} contains Korean text`);
}
NODE

SHA="$(shasum -a 256 "$BUILD_ARCHIVE" | awk '{print $1}')"
EXPECTED_CHECKSUM="$SHA  petclaw-extension.zip"

if [[ "$CHECK_ONLY" == true ]]; then
  if ! cmp -s "$BUILD_ARCHIVE" "$ROOT_ARCHIVE" \
    || ! cmp -s "$BUILD_ARCHIVE" "$PUBLIC_ARCHIVE"; then
    echo "Committed extension ZIPs do not match the deterministic source build." >&2
    exit 1
  fi
  if [[ ! -f "$PUBLIC_CHECKSUM" \
    || "$(cat "$PUBLIC_CHECKSUM")" != "$EXPECTED_CHECKSUM" ]]; then
    echo "Committed extension checksum does not match the deterministic source build." >&2
    exit 1
  fi
  echo "Verified PetClaw extension v$VERSION"
else
  cp "$BUILD_ARCHIVE" "$ROOT_ARCHIVE"
  cp "$BUILD_ARCHIVE" "$PUBLIC_ARCHIVE"
  printf '%s\n' "$EXPECTED_CHECKSUM" > "$PUBLIC_CHECKSUM"
  echo "Built PetClaw extension v$VERSION"
fi
echo "SHA-256 $SHA"

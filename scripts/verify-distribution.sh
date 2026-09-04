#!/usr/bin/env sh
set -eu

package_version=$(node -p "require('./package.json').version")
pack_root=$(mktemp -d "${TMPDIR:-/tmp}/scintilla-lambda-pub-core-pack.XXXXXX")

cleanup() {
  rm -rf "$pack_root"
}
trap cleanup EXIT HUP INT TERM

mkdir "$pack_root/first" "$pack_root/second"
zed pack --out "$pack_root/first"
zed pack --out "$pack_root/second"

first_names=$(find "$pack_root/first" -maxdepth 1 -type f -exec basename {} \; | sort)
second_names=$(find "$pack_root/second" -maxdepth 1 -type f -exec basename {} \; | sort)
test "$first_names" = "$second_names"

archive_count=$(printf '%s\n' "$first_names" | awk 'NF { count += 1 } END { print count + 0 }')
test "$archive_count" -eq 8

require_path() {
  listing=$1
  required=$2
  printf '%s\n' "$listing" | grep -Fx "$required" >/dev/null
}

for name in $first_names; do
  cmp -s "$pack_root/first/$name" "$pack_root/second/$name"
  listing=$(tar -tzf "$pack_root/first/$name")
  if printf '%s\n' "$listing" | grep -Eq '(^/|(^|/)\.\.(/|$)|(^|/)(node_modules|target|_build|build)(/|$)|^pkg/\.git(/|$))'; then
    printf 'unsafe or generated path found in %s\n' "$name" >&2
    exit 1
  fi

  case "$name" in
    "scintilla-run-scintilla-lambda-pub-core-$package_version.tar.gz")
      require_path "$listing" "pkg/schema/LambdaManifest.json"
      require_path "$listing" "pkg/typespec/main.tsp"
      ;;
    *-nodejs-*)
      require_path "$listing" "pkg/src/index.mjs"
      require_path "$listing" "pkg/src/index.d.ts"
      ;;
    *-bun-*)
      require_path "$listing" "pkg/src/index.mjs"
      require_path "$listing" "pkg/src/index.d.ts"
      ;;
    *-deno-*)
      require_path "$listing" "pkg/src/index.mjs"
      require_path "$listing" "pkg/src/index.d.ts"
      ;;
    *-rust-*)
      require_path "$listing" "pkg/Cargo.toml"
      require_path "$listing" "pkg/src/lib.rs"
      ;;
    *-golang-*)
      require_path "$listing" "pkg/go.mod"
      require_path "$listing" "pkg/core.go"
      ;;
    *-erlang-*)
      require_path "$listing" "pkg/rebar.config"
      require_path "$listing" "pkg/src/scintilla_lambda_pub_core.erl"
      ;;
    *-gleam-*)
      require_path "$listing" "pkg/gleam.toml"
      require_path "$listing" "pkg/src/scintilla_lambda_pub_core.gleam"
      ;;
    *)
      printf 'unexpected Zed archive: %s\n' "$name" >&2
      exit 1
      ;;
  esac
done

printf 'verified %s deterministic, path-safe Zed target archives\n' "$archive_count"

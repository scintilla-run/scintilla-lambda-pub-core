#!/usr/bin/env sh
set -eu

npm run verify
(cd languages/typescript && npm test)
(cd languages/bun && npx --yes bun@1.4.1 test)
(cd languages/deno && npx --yes deno@2.9.6 test)
(cd languages/rust && cargo fmt --check && cargo clippy --all-targets --locked -- -D warnings && cargo test --locked && cargo package --allow-dirty --list >/dev/null)
(cd languages/go && test -z "$(gofmt -d .)" && go vet ./... && go test -race -cover ./...)
(cd languages/erlang && rebar3 compile && rebar3 eunit)
(cd languages/gleam && gleam format --check src test && gleam test)
(cd languages/typescript && npm pack --dry-run --json --ignore-scripts >/dev/null)
zed validate --json
./scripts/verify-distribution.sh
zed r2g --clean

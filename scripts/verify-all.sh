#!/usr/bin/env sh
set -eu

npm run verify
(cd languages/typescript && npm test)
(cd languages/rust && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test)
(cd languages/go && test -z "$(gofmt -d .)" && go test ./...)
(cd languages/erlang && rebar3 do compile, eunit)
(cd languages/gleam && gleam format --check src test && gleam test)
zed validate --json

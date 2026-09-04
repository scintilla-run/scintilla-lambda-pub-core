# scintilla-lambda-pub-core

Public, runtime-neutral contracts and small native SDKs for building portable
Scintilla lambdas in any GitHub organization.

The contract supports three artifact forms and eight runtime identities:

| Axis | Supported values |
| --- | --- |
| Artifact | Docker-compatible image, OCI image, bare executable |
| Runtime | Node.js, Bun, Deno, Rust, Erlang, Gleam, Go, generic binary |
| Wire protocol | newline-delimited `stdio-json-v1` request/response envelopes |

Artifact form and runtime are independent. A Rust, Go, or compiled Gleam lambda
can be a bare executable or an image; a Node.js, Bun, Deno, Erlang, or Gleam
lambda can use either packaging form as long as its entrypoint implements the
same protocol.

## Dual contract authority

This repository deliberately keeps two reviewed sources of truth:

1. [`schema/`](schema/) contains independently authored JSON Schema Draft
   2020-12 documents.
2. [`typespec/main.tsp`](typespec/main.tsp) contains the same models in
   TypeSpec.

`npm run verify` regenerates [`generated/json-schema/`](generated/json-schema/),
compares its normalized structure with every authored schema, validates the
same positive and negative fixtures against both, and proves fixture coverage
for every runtime. Neither authority can drift unnoticed.

## Install with Zed Package Manager

The root [`.zpkg.toml`](.zpkg.toml) exports the complete contract plus focused
targets for Node.js/Bun/Deno, Rust, Go, Erlang, and Gleam.

```toml
[dependencies]
"scintilla-run/scintilla-lambda-pub-core" = "^0.1.0"
```

Install the full repository contract when an importer needs TypeSpec and JSON
Schema, or select the runtime target for a native SDK. Git submodule consumers
can validate the checked-out package with:

```sh
npm ci --ignore-scripts
npm run verify
zed validate --json
```

See [`docs/consumer-guide.md`](docs/consumer-guide.md) for target coordinates
and [`docs/protocol.md`](docs/protocol.md) for the process contract.

## Security properties

- Container artifacts require an immutable `sha256:` image digest.
- Bare executables require a SHA-256, OS, and architecture.
- Launch commands are structured argv arrays; the contract never invokes a
  shell or expands command text.
- Unknown fields and unknown runtimes fail closed.
- This SDK validates metadata and envelopes. It does not turn host process
  execution into a sandbox; untrusted lambdas still need a hardened external
  isolation boundary.

## Development

```sh
npm ci --ignore-scripts
./scripts/verify-all.sh
```

The full gate compiles TypeSpec, verifies both schema authorities, tests every
native binding, and validates the Zed package manifest.

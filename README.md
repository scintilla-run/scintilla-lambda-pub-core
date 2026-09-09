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

Hosted admission additionally pins
[`ORESoftware/typespec-json-schema-validator`](https://github.com/ORESoftware/typespec-json-schema-validator)
to an immutable reviewed commit. TJSV emits the parity receipt and Contract IR,
then independently rebuilds verification from the exact current TypeSpec,
generated comparison witness, authored JSON Schema closure, and complete
fourteen-declaration consumer scope. Its consumer regression action must reject
altered digests, stale evidence, tampered IR, and incomplete scope.

## Cross-language and runtime evidence

[`config/language-boundaries.json`](config/language-boundaries.json) declares
five required language identities across seven tested runtime targets:
TypeScript on Node.js, Bun, and Deno; native Rust and Go; and Erlang and Gleam
on BEAM.

Each native lane runs its own tests before producing a deterministic package
archive and closed TJSV language-boundary evidence envelope. A final admission
job re-verifies the retained Contract IR against the current peer-authority
inputs and admits all seven envelopes together. It also proves failure for a
stale authored authority, altered receipt identity, inconsistent source
revision, unknown evidence field, and duplicate evidence path. Runtime receipts
and package archives remain evidence; they never become a third contract
authority.

## Install with Zed Package Manager

The root [`.zpkg.toml`](.zpkg.toml) exports the complete contract plus focused
targets for Node.js/Bun/Deno, Rust, Go, Erlang, and Gleam.

```toml
[dependencies]
"scintilla-run/scintilla-lambda-pub-core" = "^0.1.2"
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

The repository-local gate compiles TypeSpec, verifies both schema authorities,
tests every native binding, and validates the Zed package manifest. Hosted CI
adds immutable TJSV current-input, consumer-admission, and cross-language
runtime evidence gates.

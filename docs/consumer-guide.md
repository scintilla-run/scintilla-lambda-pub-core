# Consumer guide

## Zed targets

| Consumer | Target package | Directory |
| --- | --- | --- |
| TypeSpec and JSON Schema | `scintilla-run/scintilla-lambda-pub-core` | repository root |
| Node.js | `scintilla-run/scintilla-lambda-pub-core-nodejs` | `languages/typescript` |
| Bun | `scintilla-run/scintilla-lambda-pub-core-bun` | `languages/bun` |
| Deno | `scintilla-run/scintilla-lambda-pub-core-deno` | `languages/deno` |
| Rust | `scintilla-run/scintilla-lambda-pub-core-rust` | `languages/rust` |
| Go | `scintilla-run/scintilla-lambda-pub-core-golang` | `languages/go` |
| Erlang | `scintilla-run/scintilla-lambda-pub-core-erlang` | `languages/erlang` |
| Gleam | `scintilla-run/scintilla-lambda-pub-core-gleam` | `languages/gleam` |

Use the repository coordinate when a `*-lambdas` repo needs to compile TypeSpec,
validate JSON directly, or expose the contract through a Git submodule. Use a
focused target when only a native binding is needed.

## Importer gate

An importer should pin a reviewed semver release or exact commit and run these
checks in its own CI:

1. Validate every lambda manifest with `schema/LambdaManifest.json`.
2. Validate protocol fixtures with `InvocationRequest.json` and
   `InvocationResponse.json`.
3. Build and test the selected native target.
4. Record the exact package version or commit and artifact digest/checksum in
   the importer release manifest.

Do not point production builds at a mutable branch, mutable container tag, or
an unchecked executable.

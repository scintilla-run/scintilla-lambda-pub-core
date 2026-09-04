# Changelog

## 0.1.2

- Align native manifest string bounds with JSON Schema Unicode code-point
  semantics in TypeScript, Rust, Go, and Erlang.
- Make Gleam executable-command validation use the contract allowlist.
- Reject mixed artifact variants and explicitly empty optional runtime versions
  during Go JSON decoding.
- Reject mixed invocation-result variants during Rust deserialization.
- Add Bun and Deno runtime tests, shared fixture conformance, 68 boundary cases,
  Go race/vet coverage, and deterministic Zed package verification.

## 0.1.1

- Make the Zed consumer smoke test portable across supported host shells.

## 0.1.0

- Publish the initial dual-authored TypeSpec and JSON Schema contract with
  seven language targets and a generic binary runtime.

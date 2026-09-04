# Agent rules — scintilla-lambda-pub-core

This public repository owns the portable Scintilla lambda artifact and
invocation contract. It must remain usable outside the `scintilla-run`
organization and must not depend on private deployment, persistence, identity,
or infrastructure details.

## Contract authority

- `schema/` is the independently authored JSON Schema Draft 2020-12 authority.
- `typespec/main.tsp` is the independently authored TypeSpec authority.
- `generated/json-schema/` is generated from TypeSpec and must not be edited by
  hand.
- `npm run verify` must prove semantic parity between the two authorities and
  validate every fixture against both.
- Native language bindings must match the contract. Additive changes are
  preferred; breaking changes require a new protocol version and migration
  notes.

## Security boundary

- Container images and executable artifacts are immutable: require an OCI
  digest or executable SHA-256.
- Commands are argv arrays, never shell fragments. Do not add command
  interpolation, implicit shells, mutable image tags, credentials, endpoints,
  customer payloads, or environment-specific policy to the contract.
- This library describes and validates execution. It does not make host
  execution a security boundary; untrusted code still requires external
  sandboxing and least-privilege runtime policy.

## Delivery

- Keep history append-only: no rebase, reset, force-push, clean, or destructive
  restoration.
- Stage explicit paths, run `./scripts/verify-all.sh`, commit, fetch and merge
  upstream changes semantically, then push.
- Use reviewed pull requests for changes after the initial repository seed.

# TJSV-bound native runtime evidence

The peer-authority contract gate and native SDK tests form one admission
boundary. A native test result is promotable only when it is bound to the exact
source revision, immutable `ORESoftware/typespec-json-schema-validator`
revision, zero-finding parity receipt, admissible Contract IR, and complete
admitted declaration inventory used by every other runtime.

The workflow emits one deterministic
`scintilla.run/lambda-runtime-evidence/v1` document after each successful native
lane:

- TypeScript/Node.js;
- Bun;
- Deno;
- Rust;
- Go;
- Erlang; and
- Gleam.

The final `scintilla.run/lambda-language-boundary-receipt/v1` gate rejects:

- a missing or duplicated runtime;
- an unsupported runtime identity;
- a stale source commit;
- a different or non-immutable TJSV revision;
- a different parity run or receipt digest;
- a different Contract IR digest;
- a changed declaration inventory;
- non-passed or malformed runtime evidence; and
- a stopped, stale, malformed, or non-admissible authority result.

Generated JSON Schema and Contract IR remain comparison/admission evidence only.
TypeSpec and independently authored JSON Schema Draft 2020-12 remain peer
authorities with no precedence.

## Local regression suite

```sh
npm run test:runtime-evidence
```

The regression suite includes complete-boundary admission plus missing, stale,
tampered, duplicated, unsupported, and non-admissible controls. CI additionally
executes the real native toolchains and binds their successful commands and
runtime versions to the actual TJSV output for the exact checked-out commit.

This receipt proves that the configured native tests completed against one
contract admission result. It does not claim that process execution is a
sandbox or replace provider-specific integration and artifact tests.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CONTEXT_ABI,
  applicationContext,
  RUNTIMES,
  invocationContext,
  validateModuleDescriptor,
  assertModuleDescriptor,
  lambdaModuleDescriptor,
  assertLambdaManifest,
  invocationFailure,
  invocationSuccess,
  validateLambdaManifest,
} from "../src/index.mjs";

const root = new URL("../../../", import.meta.url).pathname;
const fixture = (name) => JSON.parse(readFileSync(join(root, "fixtures/LambdaManifest/valid", name), "utf8"));
const invalidFixture = (name) => JSON.parse(readFileSync(join(root, "fixtures/LambdaManifest/invalid", name), "utf8"));

test("all runtime identities are exported", () => {
  assert.deepEqual(RUNTIMES, ["nodejs", "bun", "deno", "rust", "erlang", "gleam", "golang", "binary"]);
});

test("validates container and executable manifests", () => {
  for (const name of [
    "binary-executable.json",
    "bun-executable.json",
    "deno-oci.json",
    "erlang-executable.json",
    "gleam-executable.json",
    "golang-executable.json",
    "nodejs-docker.json",
    "rust-executable.json",
  ]) {
    assert.equal(validateLambdaManifest(fixture(name)).ok, true, name);
  }
});

test("rejects the shared invalid manifest corpus", () => {
  for (const name of [
    "empty-runtime-version.json",
    "invalid-command-character.json",
    "mixed-artifact-fields.json",
    "mutable-container.json",
    "shell-command.json",
    "unknown-field.json",
    "unknown-runtime.json",
    "uppercase-digest.json",
  ]) {
    assert.equal(validateLambdaManifest(invalidFixture(name)).ok, false, name);
  }
});

test("counts Unicode code points at contract boundaries", () => {
  const valid = fixture("binary-executable.json");
  valid.handler = "🚀".repeat(64);
  valid.runtimeVersion = "🚀".repeat(64);
  valid.artifact.args = ["🚀".repeat(1024)];
  assert.equal(validateLambdaManifest(valid).ok, true);

  valid.handler += "🚀";
  assert.equal(validateLambdaManifest(valid).ok, false);
});

test("rejects shell command strings", () => {
  const invalid = fixture("binary-executable.json");
  invalid.artifact.command = "sh -c ./lambda";
  assert.equal(validateLambdaManifest(invalid).ok, false);
  assert.throws(() => assertLambdaManifest(invalid), /without shell text/);
});

test("builds discriminated invocation responses", () => {
  assert.equal(invocationSuccess("id-1", 42).result.status, "ok");
  assert.equal(invocationFailure("id-2", "busy", "busy", true).result.error.retryable, true);
});


test("builds a minimal versioned invocation context", () => {
  const ctx = invocationContext({ invocationId: "id-ctx", timeoutMs: 2500, traceparent: "00-a-b-01" });
  assert.equal(ctx.abi, CONTEXT_ABI);
  assert.equal(ctx.invocationId, "id-ctx");
  assert.equal(ctx.timeoutMs, 2500);
  assert.equal(ctx.traceparent, "00-a-b-01");
  assert.equal(lambdaModuleDescriptor().contextAbi, CONTEXT_ABI);
  assert.throws(() => lambdaModuleDescriptor("bad export"), /invalid/);
  assert.equal(validateModuleDescriptor(lambdaModuleDescriptor("run")).ok, true);
  assert.equal(validateModuleDescriptor({ kind: "lambda", exportName: "run", contextAbi: "scintilla.run/context/v0" }).ok, false);
  assert.throws(
    () => assertModuleDescriptor({ kind: "lambda", exportName: "bad export", contextAbi: CONTEXT_ABI }),
    /invalid/,
  );
});

test("application context preserves the platform invocation", () => {
  const invocation = invocationContext({ invocationId: "ts-app", timeoutMs: 500 });
  const ctx = applicationContext(invocation, { repository: "catalog" });
  assert.equal(ctx.invocation, invocation);
  assert.equal(ctx.repository, "catalog");
  assert.throws(() => applicationContext(invocation, { invocation: "spoof" }), /cannot override/);
  assert.throws(
    () => applicationContext({ ...invocation, abi: "scintilla.run/context/v0" }, {}),
    /current Scintilla context ABI/,
  );
});

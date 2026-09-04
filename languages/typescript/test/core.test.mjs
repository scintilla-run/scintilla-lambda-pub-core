import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  RUNTIMES,
  assertLambdaManifest,
  invocationFailure,
  invocationSuccess,
  validateLambdaManifest,
} from "../src/index.mjs";

const root = new URL("../../../", import.meta.url).pathname;
const fixture = (name) => JSON.parse(readFileSync(join(root, "fixtures/LambdaManifest/valid", name), "utf8"));

test("all runtime identities are exported", () => {
  assert.deepEqual(RUNTIMES, ["nodejs", "bun", "deno", "rust", "erlang", "gleam", "golang", "binary"]);
});

test("validates container and executable manifests", () => {
  assert.equal(validateLambdaManifest(fixture("nodejs-docker.json")).ok, true);
  assert.equal(validateLambdaManifest(fixture("rust-executable.json")).ok, true);
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

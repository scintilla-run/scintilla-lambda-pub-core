import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { validateLambdaManifest } from "../languages/typescript/src/index.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const canonicalDir = join(root, "schema");
const generatedDir = join(root, "generated", "json-schema");
const fixtureDir = join(root, "fixtures");

const jsonFiles = (directory) =>
  readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort();

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["$schema", "$id", "title", "description"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]),
  );
}

const generatedFiles = jsonFiles(generatedDir);
const canonicalModelFiles = jsonFiles(canonicalDir).filter((name) => name !== "index.json");
assert.deepEqual(
  canonicalModelFiles,
  generatedFiles,
  "the authored and TypeSpec-generated schema sets differ",
);

for (const runtime of ["bun", "deno"]) {
  for (const file of ["index.mjs", "index.d.ts"]) {
    assert.equal(
      readFileSync(join(root, "languages", runtime, "src", file), "utf8"),
      readFileSync(join(root, "languages", "typescript", "src", file), "utf8"),
      `${runtime}/${file} drifted from the shared JavaScript binding`,
    );
  }
}

for (const name of canonicalModelFiles) {
  const canonical = readJson(join(canonicalDir, name));
  const generated = readJson(join(generatedDir, name));
  assert.deepEqual(
    normalize(canonical),
    normalize(generated),
    `${name} differs between authored JSON Schema and TypeSpec output`,
  );
}

function validatorFor(directory) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const name of jsonFiles(directory)) {
    if (name !== "index.json") {
      ajv.addSchema(readJson(join(directory, name)));
    }
  }
  return ajv;
}

const canonicalAjv = validatorFor(canonicalDir);
const generatedAjv = validatorFor(generatedDir);
let fixtureCount = 0;

for (const model of ["LambdaManifest", "InvocationRequest", "InvocationResponse"]) {
  for (const expectation of ["valid", "invalid"]) {
    const directory = join(fixtureDir, model, expectation);
    for (const name of jsonFiles(directory)) {
      const fixture = readJson(join(directory, name));
      fixtureCount += 1;
      const canonical = canonicalAjv.getSchema(
        `https://scintilla.run/schemas/lambda/v1/${model}.json`,
      );
      const generated = generatedAjv.getSchema(`${model}.json`);
      assert.ok(canonical, `missing canonical validator for ${model}`);
      assert.ok(generated, `missing generated validator for ${model}`);

      const shouldPass = expectation === "valid";
      assert.equal(
        canonical(fixture),
        shouldPass,
        `canonical ${model} unexpectedly classified ${expectation}/${name}: ${JSON.stringify(canonical.errors)}`,
      );
      assert.equal(
        generated(fixture),
        shouldPass,
        `generated ${model} unexpectedly classified ${expectation}/${name}: ${JSON.stringify(generated.errors)}`,
      );
      if (model === "LambdaManifest") {
        assert.equal(
          validateLambdaManifest(fixture).ok,
          shouldPass,
          `TypeScript binding unexpectedly classified ${expectation}/${name}`,
        );
      }
    }
  }
}

const canonicalManifest = canonicalAjv.getSchema(
  "https://scintilla.run/schemas/lambda/v1/LambdaManifest.json",
);
const generatedManifest = generatedAjv.getSchema("LambdaManifest.json");
assert.ok(canonicalManifest, "missing canonical LambdaManifest validator");
assert.ok(generatedManifest, "missing generated LambdaManifest validator");

const executableBase = readJson(
  join(fixtureDir, "LambdaManifest", "valid", "binary-executable.json"),
);
const containerBase = readJson(
  join(fixtureDir, "LambdaManifest", "valid", "nodejs-docker.json"),
);
const repeated = (value, count) => Array.from({ length: count }, () => value);
const boundaryCases = [
  ["one-character name", executableBase, (value) => { value.name = "a"; }, true],
  ["63-character name", executableBase, (value) => { value.name = `a${"b".repeat(62)}`; }, true],
  ["64-character name", executableBase, (value) => { value.name = `a${"b".repeat(63)}`; }, false],
  ["uppercase name", executableBase, (value) => { value.name = "Uppercase"; }, false],
  ["64-code-point handler", executableBase, (value) => { value.handler = "🚀".repeat(64); }, true],
  ["65-code-point handler", executableBase, (value) => { value.handler = "🚀".repeat(65); }, false],
  ["64-code-point runtime version", executableBase, (value) => { value.runtimeVersion = "🚀".repeat(64); }, true],
  ["65-code-point runtime version", executableBase, (value) => { value.runtimeVersion = "🚀".repeat(65); }, false],
  ["empty runtime version", executableBase, (value) => { value.runtimeVersion = ""; }, false],
  ["64 executable args", executableBase, (value) => { value.artifact.args = repeated("x", 64); }, true],
  ["65 executable args", executableBase, (value) => { value.artifact.args = repeated("x", 65); }, false],
  ["1,024-code-point executable arg", executableBase, (value) => { value.artifact.args = ["🚀".repeat(1024)]; }, true],
  ["1,025-code-point executable arg", executableBase, (value) => { value.artifact.args = ["🚀".repeat(1025)]; }, false],
  ["empty executable arg", executableBase, (value) => { value.artifact.args = [""]; }, false],
  ["absolute executable command", executableBase, (value) => { value.artifact.command = "/opt/a+b"; }, true],
  ["command missing executable name", executableBase, (value) => { value.artifact.command = "/"; }, false],
  ["relative command missing executable name", executableBase, (value) => { value.artifact.command = "./"; }, false],
  ["command with dollar expansion", executableBase, (value) => { value.artifact.command = "./lambda$HOME"; }, false],
  ["command with newline", executableBase, (value) => { value.artifact.command = "./lambda\nnext"; }, false],
  ["command with non-ASCII text", executableBase, (value) => { value.artifact.command = "./λ"; }, false],
  ["uppercase executable checksum", executableBase, (value) => { value.artifact.sha256 = "A".repeat(64); }, false],
  ["short executable checksum", executableBase, (value) => { value.artifact.sha256 = "a".repeat(63); }, false],
  ["all executable platforms", executableBase, (value) => { value.artifact.os = "freebsd"; value.artifact.architecture = "armv7"; }, true],
  ["unknown executable platform", executableBase, (value) => { value.artifact.os = "solaris"; }, false],
  ["mixed executable and container fields", executableBase, (value) => { value.artifact.image = "unexpected"; }, false],
  ["unknown manifest field", executableBase, (value) => { value.environment = {}; }, false],
  ["64 container entrypoint args", containerBase, (value) => { value.artifact.entrypoint = repeated("x", 64); }, true],
  ["65 container entrypoint args", containerBase, (value) => { value.artifact.entrypoint = repeated("x", 65); }, false],
  ["empty container entrypoint", containerBase, (value) => { value.artifact.entrypoint = []; }, false],
  ["1,024-code-point container arg", containerBase, (value) => { value.artifact.entrypoint = ["🚀".repeat(1024)]; }, true],
  ["512-character image", containerBase, (value) => { value.artifact.image = "a".repeat(512); }, true],
  ["513-character image", containerBase, (value) => { value.artifact.image = "a".repeat(513); }, false],
  ["OCI image format", containerBase, (value) => { value.artifact.format = "oci"; }, true],
  ["unknown image format", containerBase, (value) => { value.artifact.format = "docker-v3"; }, false],
  ["uppercase container digest", containerBase, (value) => { value.artifact.digest = `sha256:${"A".repeat(64)}`; }, false],
];

for (const [name, base, mutate, expected] of boundaryCases) {
  const value = structuredClone(base);
  mutate(value);
  assert.equal(
    canonicalManifest(value),
    expected,
    `canonical schema unexpectedly classified boundary case: ${name}: ${JSON.stringify(canonicalManifest.errors)}`,
  );
  assert.equal(
    generatedManifest(value),
    expected,
    `generated schema unexpectedly classified boundary case: ${name}: ${JSON.stringify(generatedManifest.errors)}`,
  );
  assert.equal(
    validateLambdaManifest(value).ok,
    expected,
    `TypeScript binding unexpectedly classified boundary case: ${name}`,
  );
}

function verifySchemaBoundaryCases(model, cases) {
  const canonical = canonicalAjv.getSchema(
    `https://scintilla.run/schemas/lambda/v1/${model}.json`,
  );
  const generated = generatedAjv.getSchema(`${model}.json`);
  assert.ok(canonical, `missing canonical ${model} validator`);
  assert.ok(generated, `missing generated ${model} validator`);

  for (const [name, base, mutate, expected] of cases) {
    const value = structuredClone(base);
    mutate(value);
    assert.equal(
      canonical(value),
      expected,
      `canonical ${model} unexpectedly classified boundary case: ${name}: ${JSON.stringify(canonical.errors)}`,
    );
    assert.equal(
      generated(value),
      expected,
      `generated ${model} unexpectedly classified boundary case: ${name}: ${JSON.stringify(generated.errors)}`,
    );
  }
}

const requestBase = readJson(
  join(fixtureDir, "InvocationRequest", "valid", "basic.json"),
);
const requestBoundaryCases = [
  ["minimum timeout", requestBase, (value) => { value.timeoutMs = 1; }, true],
  ["maximum timeout", requestBase, (value) => { value.timeoutMs = 3600000; }, true],
  ["zero timeout", requestBase, (value) => { value.timeoutMs = 0; }, false],
  ["negative timeout", requestBase, (value) => { value.timeoutMs = -1; }, false],
  ["excessive timeout", requestBase, (value) => { value.timeoutMs = 3600001; }, false],
  ["fractional timeout", requestBase, (value) => { value.timeoutMs = 1.5; }, false],
  ["one-character request ID", requestBase, (value) => { value.invocationId = "a"; }, true],
  ["128-character request ID", requestBase, (value) => { value.invocationId = "a".repeat(128); }, true],
  ["129-character request ID", requestBase, (value) => { value.invocationId = "a".repeat(129); }, false],
  ["request ID starting with punctuation", requestBase, (value) => { value.invocationId = "-request"; }, false],
  ["512-code-point traceparent", requestBase, (value) => { value.traceparent = "🚀".repeat(512); }, true],
  ["513-code-point traceparent", requestBase, (value) => { value.traceparent = "🚀".repeat(513); }, false],
  ["omitted optional traceparent", requestBase, (value) => { delete value.traceparent; }, true],
  ["missing payload", requestBase, (value) => { delete value.payload; }, false],
  ["unknown request field", requestBase, (value) => { value.environment = {}; }, false],
  ["unknown request protocol", requestBase, (value) => { value.protocol = "http-json-v1"; }, false],
];
verifySchemaBoundaryCases("InvocationRequest", requestBoundaryCases);

const successBase = readJson(
  join(fixtureDir, "InvocationResponse", "valid", "success.json"),
);
const failureBase = readJson(
  join(fixtureDir, "InvocationResponse", "valid", "failure.json"),
);
const responseBoundaryCases = [
  ["one-character response ID", successBase, (value) => { value.invocationId = "a"; }, true],
  ["128-character response ID", successBase, (value) => { value.invocationId = "a".repeat(128); }, true],
  ["129-character response ID", successBase, (value) => { value.invocationId = "a".repeat(129); }, false],
  ["null success payload", successBase, (value) => { value.result.payload = null; }, true],
  ["missing success payload", successBase, (value) => { delete value.result.payload; }, false],
  ["mixed success result", successBase, (value) => { value.result.error = { code: "mixed", message: "mixed", retryable: false }; }, false],
  ["unknown response field", successBase, (value) => { value.debug = true; }, false],
  ["unknown result status", successBase, (value) => { value.result.status = "pending"; }, false],
  ["one-character error code", failureBase, (value) => { value.result.error.code = "a"; }, true],
  ["128-character error code", failureBase, (value) => { value.result.error.code = `a${"b".repeat(127)}`; }, true],
  ["129-character error code", failureBase, (value) => { value.result.error.code = `a${"b".repeat(128)}`; }, false],
  ["uppercase error code", failureBase, (value) => { value.result.error.code = "Invalid"; }, false],
  ["4,096-code-point error message", failureBase, (value) => { value.result.error.message = "🚀".repeat(4096); }, true],
  ["4,097-code-point error message", failureBase, (value) => { value.result.error.message = "🚀".repeat(4097); }, false],
  ["empty error message", failureBase, (value) => { value.result.error.message = ""; }, false],
  ["non-boolean retryable", failureBase, (value) => { value.result.error.retryable = "yes"; }, false],
  ["unknown error field", failureBase, (value) => { value.result.error.stack = "must-not-pass"; }, false],
];
verifySchemaBoundaryCases("InvocationResponse", responseBoundaryCases);

const boundaryCaseCount =
  boundaryCases.length + requestBoundaryCases.length + responseBoundaryCases.length;

const declaredRuntimes = new Set(readJson(join(canonicalDir, "Runtime.json")).enum);
const coveredRuntimes = new Set(
  jsonFiles(join(fixtureDir, "LambdaManifest", "valid")).map(
    (name) => readJson(join(fixtureDir, "LambdaManifest", "valid", name)).runtime,
  ),
);
assert.deepEqual(
  [...coveredRuntimes].sort(),
  [...declaredRuntimes].sort(),
  "valid manifest fixtures must cover every runtime",
);

const source = (path) => readFileSync(join(root, path), "utf8");
const pascalRuntimes = (path, header) => {
  const block = new RegExp(`${header}\\s*\\{([\\s\\S]*?)\\}`).exec(source(path));
  assert.ok(block, `could not find runtime block in ${path}`);
  return [...block[1].matchAll(/\b([A-Z][A-Za-z0-9]*)\b/g)].map((match) =>
    match[1].toLowerCase(),
  );
};
const tsBlock = /export const RUNTIMES = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(
  source("languages/typescript/src/index.mjs"),
);
assert.ok(tsBlock, "could not find TypeScript runtime list");
const erlangBlock = /runtimes\(\) -> \[([^\]]+)\]/.exec(
  source("languages/erlang/src/scintilla_lambda_pub_core.erl"),
);
assert.ok(erlangBlock, "could not find Erlang runtime list");

const bindingRuntimes = {
  typescript: [...tsBlock[1].matchAll(/"([a-z0-9]+)"/g)].map((match) => match[1]),
  rust: pascalRuntimes("languages/rust/src/lib.rs", "pub enum Runtime"),
  go: [
    ...source("languages/go/core.go").matchAll(/Runtime[A-Za-z0-9]+\s+Runtime\s*=\s*"([a-z0-9]+)"/g),
  ].map((match) => match[1]),
  erlang: erlangBlock[1].split(",").map((runtime) => runtime.trim()),
  gleam: pascalRuntimes("languages/gleam/src/scintilla_lambda_pub_core.gleam", "pub type Runtime"),
};

for (const [language, runtimes] of Object.entries(bindingRuntimes)) {
  assert.deepEqual(
    [...runtimes].sort(),
    [...declaredRuntimes].sort(),
    `${language} runtime set differs from the authored schema`,
  );
}

console.log(
  `verified ${canonicalModelFiles.length} dual-authored schemas, ${fixtureCount} fixtures, ${boundaryCaseCount} boundary cases, ${coveredRuntimes.size} runtimes, and ${Object.keys(bindingRuntimes).length} native bindings`,
);

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

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

for (const model of ["LambdaManifest", "InvocationRequest", "InvocationResponse"]) {
  for (const expectation of ["valid", "invalid"]) {
    const directory = join(fixtureDir, model, expectation);
    for (const name of jsonFiles(directory)) {
      const fixture = readJson(join(directory, name));
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
    }
  }
}

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
  `verified ${canonicalModelFiles.length} dual-authored schemas, ${coveredRuntimes.size} runtimes, and ${Object.keys(bindingRuntimes).length} native bindings`,
);

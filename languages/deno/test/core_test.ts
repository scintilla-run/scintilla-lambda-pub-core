import {
  RUNTIMES,
  invocationFailure,
  invocationSuccess,
  validateLambdaManifest,
} from "../src/index.mjs";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const containerManifest = () => ({
  apiVersion: "scintilla.run/lambda/v1",
  name: "deno-lambda",
  runtime: "deno",
  protocol: "stdio-json-v1",
  handler: "main",
  artifact: {
    kind: "container",
    format: "oci",
    image: "ghcr.io/example/deno-lambda",
    digest: `sha256:${"a".repeat(64)}`,
    entrypoint: ["🚀".repeat(1024)],
  },
});

Deno.test("loads the Deno target and validates Unicode boundaries", () => {
  const manifest = containerManifest();
  manifest.handler = "🚀".repeat(64);
  assert(validateLambdaManifest(manifest).ok, "expected valid Deno manifest");
  assert(RUNTIMES.includes("deno"), "expected Deno runtime export");
});

Deno.test("rejects mutable container digests", () => {
  const manifest = containerManifest();
  manifest.artifact.digest = "sha256:latest";
  assert(!validateLambdaManifest(manifest).ok, "expected mutable digest rejection");
});

Deno.test("builds both invocation result variants", () => {
  assert(invocationSuccess("deno-1", 42).result.status === "ok", "expected success result");
  assert(
    invocationFailure("deno-2", "busy", "busy", true).result.status === "error",
    "expected error result",
  );
});

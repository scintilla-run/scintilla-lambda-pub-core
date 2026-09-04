import { expect, test } from "bun:test";
import {
  RUNTIMES,
  invocationFailure,
  invocationSuccess,
  validateLambdaManifest,
} from "../src/index.mjs";

const executableManifest = () => ({
  apiVersion: "scintilla.run/lambda/v1",
  name: "bun-lambda",
  runtime: "bun",
  protocol: "stdio-json-v1",
  handler: "main",
  artifact: {
    kind: "executable",
    command: "./bin/lambda",
    sha256: "a".repeat(64),
    os: "linux",
    architecture: "arm64",
    args: ["🚀".repeat(1024)],
  },
});

test("loads the Bun target and validates Unicode boundaries", () => {
  const manifest = executableManifest();
  manifest.handler = "🚀".repeat(64);
  expect(validateLambdaManifest(manifest).ok).toBe(true);
  expect(RUNTIMES).toContain("bun");
});

test("rejects commands outside the shared allowlist", () => {
  const manifest = executableManifest();
  manifest.artifact.command = "./lambda$HOME";
  expect(validateLambdaManifest(manifest).ok).toBe(false);
});

test("builds both invocation result variants", () => {
  expect(invocationSuccess("bun-1", 42).result.status).toBe("ok");
  expect(invocationFailure("bun-2", "busy", "busy", true).result.status).toBe("error");
});

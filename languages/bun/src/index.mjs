export const API_VERSION = "scintilla.run/lambda/v1";
export const INVOCATION_PROTOCOL = "stdio-json-v1";
export const RUNTIMES = Object.freeze([
  "nodejs",
  "bun",
  "deno",
  "rust",
  "erlang",
  "gleam",
  "golang",
  "binary",
]);
export const CONTAINER_FORMATS = Object.freeze(["docker", "oci"]);
export const OPERATING_SYSTEMS = Object.freeze(["linux", "darwin", "windows", "freebsd"]);
export const ARCHITECTURES = Object.freeze(["amd64", "arm64", "armv7", "riscv64"]);

const SHA256 = /^[a-f0-9]{64}$/;
const COMMAND = /^(\.\/|\/)[A-Za-z0-9._/+-]+$/;
const NAME = /^[a-z][a-z0-9-]{0,62}$/;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isStringArray = (value, minimum = 0) =>
  Array.isArray(value) && value.length >= minimum && value.length <= 64 && value.every((item) => typeof item === "string" && item.length >= 1 && item.length <= 1024);

export function validateLambdaManifest(value) {
  const issues = [];
  if (!isRecord(value)) return { ok: false, issues: ["manifest must be an object"] };

  const allowed = new Set(["apiVersion", "name", "runtime", "protocol", "handler", "runtimeVersion", "artifact"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`unknown manifest field: ${key}`);
  }
  if (value.apiVersion !== API_VERSION) issues.push(`apiVersion must be ${API_VERSION}`);
  if (typeof value.name !== "string" || !NAME.test(value.name)) issues.push("name is invalid");
  if (!RUNTIMES.includes(value.runtime)) issues.push("runtime is unsupported");
  if (value.protocol !== INVOCATION_PROTOCOL) issues.push(`protocol must be ${INVOCATION_PROTOCOL}`);
  if (typeof value.handler !== "string" || value.handler.length < 1 || value.handler.length > 64) issues.push("handler is invalid");
  if (value.runtimeVersion !== undefined && (typeof value.runtimeVersion !== "string" || value.runtimeVersion.length < 1 || value.runtimeVersion.length > 64)) issues.push("runtimeVersion is invalid");

  if (!isRecord(value.artifact)) {
    issues.push("artifact must be an object");
  } else if (value.artifact.kind === "container") {
    const allowedArtifact = new Set(["kind", "format", "image", "digest", "entrypoint"]);
    for (const key of Object.keys(value.artifact)) {
      if (!allowedArtifact.has(key)) issues.push(`unknown container artifact field: ${key}`);
    }
    if (!CONTAINER_FORMATS.includes(value.artifact.format)) issues.push("container format is unsupported");
    if (typeof value.artifact.image !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,511}$/.test(value.artifact.image)) issues.push("container image is invalid");
    if (typeof value.artifact.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.artifact.digest)) issues.push("container digest must be immutable sha256");
    if (!isStringArray(value.artifact.entrypoint, 1)) issues.push("container entrypoint must be a non-empty argv array");
  } else if (value.artifact.kind === "executable") {
    const allowedArtifact = new Set(["kind", "command", "sha256", "os", "architecture", "args"]);
    for (const key of Object.keys(value.artifact)) {
      if (!allowedArtifact.has(key)) issues.push(`unknown executable artifact field: ${key}`);
    }
    if (typeof value.artifact.command !== "string" || !COMMAND.test(value.artifact.command)) issues.push("executable command must be an absolute or ./ path without shell text");
    if (typeof value.artifact.sha256 !== "string" || !SHA256.test(value.artifact.sha256)) issues.push("executable sha256 is invalid");
    if (!OPERATING_SYSTEMS.includes(value.artifact.os)) issues.push("executable operating system is unsupported");
    if (!ARCHITECTURES.includes(value.artifact.architecture)) issues.push("executable architecture is unsupported");
    if (value.artifact.args !== undefined && !isStringArray(value.artifact.args)) issues.push("executable args must be an argv array");
  } else {
    issues.push("artifact kind must be container or executable");
  }

  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

export function assertLambdaManifest(value) {
  const result = validateLambdaManifest(value);
  if (!result.ok) throw new TypeError(result.issues.join("; "));
  return result.value;
}

export const invocationSuccess = (invocationId, payload) => ({
  protocol: INVOCATION_PROTOCOL,
  invocationId,
  result: { status: "ok", payload },
});

export const invocationFailure = (invocationId, code, message, retryable = false) => ({
  protocol: INVOCATION_PROTOCOL,
  invocationId,
  result: { status: "error", error: { code, message, retryable } },
});

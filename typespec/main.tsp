import "@typespec/json-schema";

using TypeSpec.JsonSchema;

namespace Scintilla.Lambda.V1;

@jsonSchema
enum Runtime {
  nodejs,
  bun,
  deno,
  rust,
  erlang,
  gleam,
  golang,
  binary,
}

@jsonSchema
enum ContainerFormat {
  docker,
  oci,
}

@jsonSchema
enum OperatingSystem {
  linux,
  darwin,
  windows,
  freebsd,
}

@jsonSchema
enum Architecture {
  amd64,
  arm64,
  armv7,
  riscv64,
}

@jsonSchema
enum InvocationProtocol {
  "stdio-json-v1",
}

@minLength(1)
@maxLength(1024)
@jsonSchema
scalar LaunchArgument extends string;

@jsonSchema
model ContainerArtifact {
  kind: "container";
  format: ContainerFormat;
  @pattern("^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,511}$")
  image: string;
  @pattern("^sha256:[a-f0-9]{64}$")
  digest: string;
  @minItems(1) @maxItems(64)
  entrypoint: LaunchArgument[];
}

@jsonSchema
model ExecutableArtifact {
  kind: "executable";
  @pattern("^(\\./|/)[A-Za-z0-9._/+-]+$")
  command: string;
  @pattern("^[a-f0-9]{64}$")
  sha256: string;
  os: OperatingSystem;
  architecture: Architecture;
  @maxItems(64)
  args?: LaunchArgument[];
}

@jsonSchema
model LambdaManifest {
  apiVersion: "scintilla.run/lambda/v1";
  @pattern("^[a-z][a-z0-9-]{0,62}$")
  name: string;
  runtime: Runtime;
  protocol: InvocationProtocol;
  @minLength(1) @maxLength(64)
  handler: string;
  @minLength(1) @maxLength(64)
  runtimeVersion?: string;
  artifact: ContainerArtifact | ExecutableArtifact;
}

@jsonSchema
model InvocationRequest {
  protocol: InvocationProtocol;
  @pattern("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
  invocationId: string;
  @minValue(1) @maxValue(3600000)
  timeoutMs: uint32;
  @maxLength(512)
  traceparent?: string;
  payload: unknown;
}

@jsonSchema
model InvocationError {
  @pattern("^[a-z][a-z0-9_.-]{0,127}$")
  code: string;
  @minLength(1) @maxLength(4096)
  message: string;
  retryable: boolean;
}

@jsonSchema
model InvocationSuccess {
  status: "ok";
  payload: unknown;
}

@jsonSchema
model InvocationFailure {
  status: "error";
  error: InvocationError;
}

@jsonSchema
model InvocationResponse {
  protocol: InvocationProtocol;
  @pattern("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
  invocationId: string;
  result: InvocationSuccess | InvocationFailure;
}

@jsonSchema
union SchemaCatalog {
  manifest: LambdaManifest,
  request: InvocationRequest,
  response: InvocationResponse,
}

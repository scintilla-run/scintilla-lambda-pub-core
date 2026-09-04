# Portable lambda protocol

## Manifest

`LambdaManifest` describes how an immutable artifact is launched. `runtime`
identifies the language or generic binary ABI; `artifact` independently selects
a container or executable. Runners must reject unknown fields and must verify
the image digest or executable checksum before launch.

For a container artifact, `format: docker` means the image is compatible with
Docker Image Manifest V2. `format: oci` means the artifact uses the OCI Image
Manifest. Both remain OCI-runtime compatible and both require a digest separate
from the human-readable image name.

For an executable artifact, `command` is an absolute path or a path beginning
with `./`. `args` is an argv vector. Runners must not concatenate these values
into a shell command.

## Invocation

The `stdio-json-v1` adapter exchanges one JSON value per line:

1. The runner writes an `InvocationRequest` to the lambda's standard input.
2. The lambda writes exactly one `InvocationResponse` with the same
   `invocationId` to standard output.
3. Diagnostic output goes to standard error. Secrets and complete payloads must
   not be logged.
4. The runner enforces `timeoutMs`, bounds input and output externally, and
   terminates or recycles the worker according to platform policy.

An invocation response contains a discriminated result: `status: ok` carries a
payload; `status: error` carries a stable machine code, bounded human message,
and retryability hint. Platform retry policy remains outside this portable
contract.

## Compatibility

Additive optional fields may be introduced in a future minor release only when
all validators accept them deliberately. Because v1 objects are sealed, adding
a field requires updating both authorities and every binding in the same
reviewed change. Removing or changing a field, enum member, discriminator, or
constraint requires a new protocol version.

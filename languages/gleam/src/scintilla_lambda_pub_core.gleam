import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string

pub const api_version = "scintilla.run/lambda/v1"

pub const invocation_protocol = "stdio-json-v1"

pub type Runtime {
  Nodejs
  Bun
  Deno
  Rust
  Erlang
  Gleam
  Golang
  Binary
}

pub type ContainerFormat {
  Docker
  Oci
}

pub type OperatingSystem {
  Linux
  Darwin
  Windows
  Freebsd
}

pub type Architecture {
  Amd64
  Arm64
  Armv7
  Riscv64
}

pub type Artifact {
  Container(
    format: ContainerFormat,
    image: String,
    digest: String,
    entrypoint: List(String),
  )
  Executable(
    command: String,
    sha256: String,
    os: OperatingSystem,
    architecture: Architecture,
    args: List(String),
  )
}

pub type LambdaManifest {
  LambdaManifest(
    api_version: String,
    name: String,
    runtime: Runtime,
    protocol: String,
    handler: String,
    runtime_version: Option(String),
    artifact: Artifact,
  )
}

pub type ValidationError {
  UnsupportedApiVersion
  InvalidName
  UnsupportedProtocol
  InvalidHandler
  InvalidRuntimeVersion
  InvalidContainerImage
  MutableContainerImage
  InvalidEntrypoint
  UnsafeExecutableCommand
  InvalidExecutableChecksum
  TooManyArguments
}

pub fn validate(
  manifest: LambdaManifest,
) -> Result(LambdaManifest, ValidationError) {
  let LambdaManifest(
    api_version: version,
    name: name,
    protocol: protocol,
    handler: handler,
    runtime_version: runtime_version,
    artifact: artifact,
    ..,
  ) = manifest
  case
    version == api_version,
    valid_name(name),
    protocol == invocation_protocol,
    string.length(handler) >= 1 && string.length(handler) <= 64,
    valid_runtime_version(runtime_version)
  {
    False, _, _, _, _ -> Error(UnsupportedApiVersion)
    _, False, _, _, _ -> Error(InvalidName)
    _, _, False, _, _ -> Error(UnsupportedProtocol)
    _, _, _, False, _ -> Error(InvalidHandler)
    _, _, _, _, False -> Error(InvalidRuntimeVersion)
    True, True, True, True, True ->
      validate_artifact(artifact)
      |> result.map(fn(_) { manifest })
  }
}

fn validate_artifact(artifact: Artifact) -> Result(Nil, ValidationError) {
  case artifact {
    Container(image: image, digest: digest, entrypoint: entrypoint, ..) ->
      case
        valid_image(image),
        valid_digest(digest),
        list.length(entrypoint) >= 1
        && list.length(entrypoint) <= 64
        && valid_argv(entrypoint)
      {
        False, _, _ -> Error(InvalidContainerImage)
        _, False, _ -> Error(MutableContainerImage)
        _, _, False -> Error(InvalidEntrypoint)
        True, True, True -> Ok(Nil)
      }
    Executable(command: command, sha256: sha256, args: args, ..) ->
      case
        valid_command(command),
        valid_sha256(sha256),
        list.length(args) <= 64 && valid_argv(args)
      {
        False, _, _ -> Error(UnsafeExecutableCommand)
        _, False, _ -> Error(InvalidExecutableChecksum)
        _, _, False -> Error(TooManyArguments)
        True, True, True -> Ok(Nil)
      }
  }
}

fn valid_runtime_version(version: Option(String)) -> Bool {
  case version {
    None -> True
    Some(value) -> string.length(value) >= 1 && string.length(value) <= 64
  }
}

fn valid_name(value: String) -> Bool {
  case string.to_graphemes(value) {
    [first, ..rest] ->
      string.length(value) <= 63
      && string.contains("abcdefghijklmnopqrstuvwxyz", first)
      && list.all(rest, fn(part) {
        string.contains("abcdefghijklmnopqrstuvwxyz0123456789-", part)
      })
    [] -> False
  }
}

fn valid_digest(value: String) -> Bool {
  case string.split_once(value, ":") {
    Ok(#("sha256", sha256)) -> valid_sha256(sha256)
    _ -> False
  }
}

fn valid_image(value: String) -> Bool {
  case string.to_graphemes(value) {
    [first, ..rest] ->
      string.length(value) <= 512
      && string.contains(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        first,
      )
      && list.all(rest, fn(part) {
        string.contains(
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:/@-",
          part,
        )
      })
    [] -> False
  }
}

fn valid_argv(arguments: List(String)) -> Bool {
  list.all(arguments, fn(argument) {
    string.length(argument) >= 1 && string.length(argument) <= 1024
  })
}

fn valid_sha256(value: String) -> Bool {
  string.length(value) == 64
  && string.to_graphemes(value)
  |> list.all(fn(part) { string.contains("0123456789abcdef", part) })
}

fn valid_command(value: String) -> Bool {
  let allowed =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._/+-"
  case string.to_graphemes(value) {
    [".", "/", first, ..rest] ->
      string.contains(allowed, first)
      && list.all(rest, fn(part) { string.contains(allowed, part) })
    ["/", first, ..rest] ->
      string.contains(allowed, first)
      && list.all(rest, fn(part) { string.contains(allowed, part) })
    _ -> False
  }
}

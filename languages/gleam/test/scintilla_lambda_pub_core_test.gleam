import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import scintilla_lambda_pub_core.{
  type LambdaManifest, Amd64, Binary, Executable, LambdaManifest, Linux,
  UnsafeExecutableCommand,
}

pub fn main() -> Nil {
  gleeunit.main()
}

fn manifest(command: String) -> LambdaManifest {
  LambdaManifest(
    api_version: "scintilla.run/lambda/v1",
    name: "example-lambda",
    runtime: Binary,
    protocol: "stdio-json-v1",
    handler: "main",
    runtime_version: None,
    artifact: Executable(
      command: command,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      os: Linux,
      architecture: Amd64,
      args: [],
    ),
  )
}

pub fn accepts_bare_executable_test() {
  scintilla_lambda_pub_core.validate(manifest("./bin/lambda"))
  |> should.be_ok
}

pub fn rejects_shell_command_test() {
  scintilla_lambda_pub_core.validate(manifest("sh -c ./lambda"))
  |> should.equal(Error(UnsafeExecutableCommand))
}

pub fn rejects_every_non_contract_command_character_test() {
  ["./lambda$HOME", "./lambda`id`", "./lambda\nnext", "./λ", "/", "./"]
  |> list.each(fn(command) {
    scintilla_lambda_pub_core.validate(manifest(command))
    |> should.equal(Error(UnsafeExecutableCommand))
  })
}

pub fn counts_unicode_characters_at_contract_boundary_test() {
  let original = manifest("./bin/lambda")
  let bounded =
    LambdaManifest(
      ..original,
      handler: string.repeat("🚀", 64),
      runtime_version: Some(string.repeat("🚀", 64)),
      artifact: Executable(
        command: "./bin/lambda",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        os: Linux,
        architecture: Amd64,
        args: [string.repeat("🚀", 1024)],
      ),
    )
  scintilla_lambda_pub_core.validate(bounded)
  |> should.be_ok
}

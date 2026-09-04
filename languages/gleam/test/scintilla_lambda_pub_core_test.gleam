import gleam/option.{None}
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

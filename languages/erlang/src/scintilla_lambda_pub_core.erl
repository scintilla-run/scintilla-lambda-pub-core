-module(scintilla_lambda_pub_core).

-export([api_version/0, invocation_protocol/0, runtimes/0, validate_manifest/1,
         success/2, failure/4]).

api_version() -> <<"scintilla.run/lambda/v1">>.
invocation_protocol() -> <<"stdio-json-v1">>.
runtimes() -> [nodejs, bun, deno, rust, erlang, gleam, golang, binary].

validate_manifest(Manifest) when is_map(Manifest) ->
    Required = [api_version, name, runtime, protocol, handler, artifact],
    Allowed = [runtime_version | Required],
    case {lists:all(fun(Key) -> maps:is_key(Key, Manifest) end, Required),
          only_keys(Manifest, Allowed)} of
        {false, _} -> {error, missing_required_field};
        {_, false} -> {error, unknown_field};
        {true, true} -> validate_fields(Manifest)
    end;
validate_manifest(_) ->
    {error, invalid_manifest}.

validate_fields(#{api_version := ApiVersion, name := Name, runtime := Runtime,
                  protocol := Protocol, handler := Handler, artifact := Artifact} = Manifest) ->
    RuntimeVersion = maps:get(runtime_version, Manifest, undefined),
    case {ApiVersion =:= api_version(), valid_name(Name), lists:member(Runtime, runtimes()),
          Protocol =:= invocation_protocol(), valid_bounded_binary(Handler, 1, 64),
          valid_optional_bounded_binary(RuntimeVersion, 1, 64)} of
        {false, _, _, _, _, _} -> {error, unsupported_api_version};
        {_, false, _, _, _, _} -> {error, invalid_name};
        {_, _, false, _, _, _} -> {error, unsupported_runtime};
        {_, _, _, false, _, _} -> {error, unsupported_protocol};
        {_, _, _, _, false, _} -> {error, invalid_handler};
        {_, _, _, _, _, false} -> {error, invalid_runtime_version};
        {true, true, true, true, true, true} -> validate_artifact(Artifact)
    end.

validate_artifact(#{kind := container, format := Format, image := Image,
                    digest := Digest, entrypoint := Entrypoint} = Artifact) ->
    case {only_keys(Artifact, [kind, format, image, digest, entrypoint]),
          lists:member(Format, [docker, oci]), valid_image(Image),
          valid_container_digest(Digest), valid_argv(Entrypoint, 1)} of
        {true, true, true, true, true} -> ok;
        {false, _, _, _, _} -> {error, unknown_artifact_field};
        {_, false, _, _, _} -> {error, unsupported_container_format};
        {_, _, false, _, _} -> {error, invalid_container_image};
        {_, _, _, false, _} -> {error, mutable_container_image};
        {_, _, _, _, false} -> {error, invalid_entrypoint}
    end;
validate_artifact(#{kind := executable, command := Command, sha256 := Sha256,
                    os := Os, architecture := Architecture} = Artifact) ->
    Args = maps:get(args, Artifact, []),
    case {only_keys(Artifact, [kind, command, sha256, os, architecture, args]),
          valid_command(Command), valid_sha256(Sha256),
          lists:member(Os, [linux, darwin, windows, freebsd]),
          lists:member(Architecture, [amd64, arm64, armv7, riscv64]),
          valid_argv(Args, 0)} of
        {true, true, true, true, true, true} -> ok;
        {false, _, _, _, _, _} -> {error, unknown_artifact_field};
        {_, false, _, _, _, _} -> {error, unsafe_executable_command};
        {_, _, false, _, _, _} -> {error, invalid_executable_checksum};
        {_, _, _, false, _, _} -> {error, unsupported_operating_system};
        {_, _, _, _, false, _} -> {error, unsupported_architecture};
        {_, _, _, _, _, false} -> {error, invalid_arguments}
    end;
validate_artifact(_) ->
    {error, invalid_artifact}.

only_keys(Map, Allowed) ->
    lists:all(fun(Key) -> lists:member(Key, Allowed) end, maps:keys(Map)).

valid_name(Value) when is_binary(Value) ->
    re:run(Value, <<"^[a-z][a-z0-9-]{0,62}$">>, [{capture, none}]) =:= match;
valid_name(_) ->
    false.

valid_bounded_binary(Value, Minimum, Maximum) when is_binary(Value) ->
    Size = byte_size(Value),
    Size >= Minimum andalso Size =< Maximum;
valid_bounded_binary(_, _, _) ->
    false.

valid_optional_bounded_binary(undefined, _, _) ->
    true;
valid_optional_bounded_binary(Value, Minimum, Maximum) ->
    valid_bounded_binary(Value, Minimum, Maximum).

valid_container_digest(<<"sha256:", Sha256/binary>>) ->
    valid_sha256(Sha256);
valid_container_digest(_) ->
    false.

valid_sha256(Value) when is_binary(Value) ->
    re:run(Value, <<"^[a-f0-9]{64}$">>, [{capture, none}]) =:= match;
valid_sha256(_) ->
    false.

valid_image(Value) when is_binary(Value) ->
    re:run(Value, <<"^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,511}$">>, [{capture, none}]) =:= match;
valid_image(_) ->
    false.

valid_command(Value) when is_binary(Value) ->
    re:run(Value, <<"^(\\./|/)[A-Za-z0-9._/+-]+$">>, [{capture, none}]) =:= match;
valid_command(_) ->
    false.

valid_argv(Value, Minimum) when is_list(Value) ->
    Length = length(Value),
    Length >= Minimum andalso Length =< 64 andalso
        lists:all(fun(Argument) -> valid_bounded_binary(Argument, 1, 1024) end, Value);
valid_argv(_, _) ->
    false.

success(InvocationId, Payload) ->
    #{protocol => invocation_protocol(), invocation_id => InvocationId,
      result => #{status => ok, payload => Payload}}.

failure(InvocationId, Code, Message, Retryable) ->
    #{protocol => invocation_protocol(), invocation_id => InvocationId,
      result => #{status => error,
                  error => #{code => Code, message => Message, retryable => Retryable}}}.

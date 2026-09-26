-module(scintilla_lambda_pub_core).

-export([api_version/0, invocation_protocol/0, context_abi/0, runtimes/0,
         lambda_module_descriptor/1, validate_module_descriptor/1, invocation_context/3,
         application_context/2, context_invocation/1, context_state/1,
         validate_manifest/1, success/2, failure/4]).
-export_type([module_kind/0, module_descriptor/0, invocation_context/0, module_context/0]).

-type module_kind() :: lambda | middleware | extension.
-type module_descriptor() :: #{kind := module_kind(), export_name := binary(),
                               context_abi := binary()}.
-type invocation_context() :: #{abi := binary(), invocation_id := binary(),
                                timeout_ms := non_neg_integer(),
                                traceparent => binary()}.
-type module_context() :: #{invocation := invocation_context(), state := term()}.

-callback run(term(), invocation_context()) -> term().

api_version() -> <<"scintilla.run/lambda/v1">>.
invocation_protocol() -> <<"stdio-json-v1">>.
context_abi() -> <<"scintilla.run/context/v1">>.

lambda_module_descriptor(ExportName) when is_binary(ExportName) ->
    #{kind => lambda, export_name => ExportName, context_abi => context_abi()}.

validate_module_descriptor(#{kind := Kind, export_name := ExportName,
                             context_abi := ContextAbi} = Descriptor) ->
    case {only_keys(Descriptor, [kind, export_name, context_abi]),
          lists:member(Kind, [lambda, middleware, extension]),
          valid_module_export(ExportName),
          ContextAbi =:= context_abi()} of
        {true, true, true, true} -> ok;
        {false, _, _, _} -> {error, unknown_module_descriptor_field};
        {_, false, _, _} -> {error, unsupported_module_kind};
        {_, _, false, _} -> {error, invalid_module_export};
        {_, _, _, false} -> {error, unsupported_context_abi}
    end;
validate_module_descriptor(_) ->
    {error, invalid_module_descriptor}.

invocation_context(InvocationId, TimeoutMs, Traceparent)
  when is_binary(InvocationId), is_integer(TimeoutMs), TimeoutMs >= 0 ->
    Base = #{abi => context_abi(), invocation_id => InvocationId, timeout_ms => TimeoutMs},
    case Traceparent of
        undefined -> Base;
        Value when is_binary(Value) -> Base#{traceparent => Value}
    end.

application_context(Invocation, State) when is_map(Invocation) ->
    ExpectedAbi = context_abi(),
    case maps:get(abi, Invocation, undefined) of
        ExpectedAbi -> #{invocation => Invocation, state => State};
        _ -> erlang:error({unsupported_context_abi, maps:get(abi, Invocation, undefined)})
    end.

context_invocation(#{invocation := Invocation}) -> Invocation.
context_state(#{state := State}) -> State.
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

valid_module_export(Value) when is_binary(Value) ->
    re:run(Value, <<"^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$">>, [{capture, none}]) =:= match;
valid_module_export(_) ->
    false.

valid_name(Value) when is_binary(Value) ->
    re:run(Value, <<"^[a-z][a-z0-9-]{0,62}$">>, [{capture, none}]) =:= match;
valid_name(_) ->
    false.

valid_bounded_binary(Value, Minimum, Maximum) when is_binary(Value) ->
    case unicode:characters_to_list(Value, utf8) of
        Characters when is_list(Characters) ->
            Length = length(Characters),
            Length >= Minimum andalso Length =< Maximum;
        _ ->
            false
    end;
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

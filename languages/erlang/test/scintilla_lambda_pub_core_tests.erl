-module(scintilla_lambda_pub_core_tests).

-include_lib("eunit/include/eunit.hrl").

runtimes_test() ->
    ?assertEqual([nodejs, bun, deno, rust, erlang, gleam, golang, binary],
                 scintilla_lambda_pub_core:runtimes()).

responses_test() ->
    Success = scintilla_lambda_pub_core:success(<<"id-1">>, 42),
    ?assertMatch(#{result := #{status := ok, payload := 42}}, Success),
    Failure = scintilla_lambda_pub_core:failure(<<"id-2">>, busy, <<"busy">>, true),
    ?assertMatch(#{result := #{status := error, error := #{retryable := true}}}, Failure).

manifest_validation_test() ->
    Manifest = #{api_version => <<"scintilla.run/lambda/v1">>,
                 name => <<"example-lambda">>, runtime => binary,
                 protocol => <<"stdio-json-v1">>, handler => <<"main">>,
                 artifact => #{kind => executable, command => <<"./bin/lambda">>,
                               sha256 => <<"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">>,
                               os => linux, architecture => amd64}},
    ?assertEqual(ok, scintilla_lambda_pub_core:validate_manifest(Manifest)),
    Unsafe = Manifest#{artifact := (maps:get(artifact, Manifest))#{command := <<"sh -c ./lambda">>}},
    ?assertEqual({error, unsafe_executable_command},
                 scintilla_lambda_pub_core:validate_manifest(Unsafe)).

unicode_boundary_test() ->
    Rocket = <<"\x{1F680}"/utf8>>,
    Manifest = #{api_version => <<"scintilla.run/lambda/v1">>,
                 name => <<"unicode-boundary">>, runtime => binary,
                 protocol => <<"stdio-json-v1">>,
                 handler => binary:copy(Rocket, 64),
                 runtime_version => binary:copy(Rocket, 64),
                 artifact => #{kind => executable, command => <<"./bin/lambda">>,
                               sha256 => <<"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">>,
                               os => linux, architecture => amd64,
                               args => [binary:copy(Rocket, 1024)]}},
    ?assertEqual(ok, scintilla_lambda_pub_core:validate_manifest(Manifest)),
    TooLong = Manifest#{handler := binary:copy(Rocket, 65)},
    ?assertEqual({error, invalid_handler},
                 scintilla_lambda_pub_core:validate_manifest(TooLong)).


context_contract_test() ->
    ?assertEqual(<<"scintilla.run/context/v1">>, scintilla_lambda_pub_core:context_abi()),
    Descriptor = scintilla_lambda_pub_core:lambda_module_descriptor(<<"run">>),
    ?assertMatch(#{kind := lambda, context_abi := <<"scintilla.run/context/v1">>}, Descriptor),
    ?assertEqual(ok, scintilla_lambda_pub_core:validate_module_descriptor(Descriptor)),
    ?assertEqual({error, unsupported_context_abi},
                 scintilla_lambda_pub_core:validate_module_descriptor(
                   Descriptor#{context_abi := <<"scintilla.run/context/v0">>})),
    Ctx = scintilla_lambda_pub_core:invocation_context(<<"id-ctx">>, 1000, undefined),
    ?assertMatch(#{abi := <<"scintilla.run/context/v1">>, invocation_id := <<"id-ctx">>, timeout_ms := 1000}, Ctx).

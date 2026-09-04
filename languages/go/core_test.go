package lambdacore

import (
	"encoding/json"
	"testing"
)

func validBinaryManifest() LambdaManifest {
	return LambdaManifest{
		APIVersion: APIVersion,
		Name:       "example-lambda",
		Runtime:    RuntimeBinary,
		Protocol:   InvocationProtocol,
		Handler:    "main",
		Artifact: Artifact{
			Kind: "executable", Command: "./bin/lambda",
			SHA256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			OS:     "linux", Architecture: "amd64",
		},
	}
}

func TestValidBareExecutable(t *testing.T) {
	if err := validBinaryManifest().Validate(); err != nil {
		t.Fatalf("expected valid manifest: %v", err)
	}
}

func TestRejectsShellCommand(t *testing.T) {
	manifest := validBinaryManifest()
	manifest.Artifact.Command = "sh -c ./lambda"
	if err := manifest.Validate(); err == nil {
		t.Fatal("expected shell command to be rejected")
	}
}

func TestResponsesAreDiscriminated(t *testing.T) {
	success := Success("id-1", 42)
	if success.Result.Status != "ok" || success.Result.Payload == nil {
		t.Fatal("expected successful response")
	}
	failure := Failure[int]("id-2", InvocationError{Code: "busy", Message: "busy", Retryable: true})
	if failure.Result.Status != "error" || failure.Result.Error == nil {
		t.Fatal("expected failed response")
	}
}

func TestDecodeRejectsUnknownFields(t *testing.T) {
	encoded, err := json.Marshal(validBinaryManifest())
	if err != nil {
		t.Fatal(err)
	}
	withUnknown := append(encoded[:len(encoded)-1], []byte(`,"secret":"must-not-pass"}`)...)
	if _, err := DecodeLambdaManifest(withUnknown); err == nil {
		t.Fatal("expected unknown manifest field to be rejected")
	}
}

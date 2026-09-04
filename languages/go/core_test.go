package lambdacore

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
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

func TestStringBoundsCountUnicodeCodePoints(t *testing.T) {
	manifest := validBinaryManifest()
	manifest.Handler = strings.Repeat("🚀", 64)
	manifest.Artifact.Args = []string{strings.Repeat("🚀", 1024)}
	if err := manifest.Validate(); err != nil {
		t.Fatalf("expected Unicode values at the schema boundary to pass: %v", err)
	}
	manifest.Handler += "🚀"
	if err := manifest.Validate(); err == nil {
		t.Fatal("expected 65-code-point handler to be rejected")
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

func TestDecodeRejectsFieldsFromOtherArtifactVariant(t *testing.T) {
	encoded, err := json.Marshal(validBinaryManifest())
	if err != nil {
		t.Fatal(err)
	}
	withContainerField := append(encoded[:len(encoded)-2], []byte(`,"image":""}}`)...)
	if _, err := DecodeLambdaManifest(withContainerField); err == nil {
		t.Fatal("expected container-only field on executable to be rejected")
	}
}

func TestDecodeRejectsExplicitEmptyRuntimeVersion(t *testing.T) {
	encoded, err := json.Marshal(validBinaryManifest())
	if err != nil {
		t.Fatal(err)
	}
	withEmptyVersion := append(encoded[:len(encoded)-1], []byte(`,"runtimeVersion":""}`)...)
	if _, err := DecodeLambdaManifest(withEmptyVersion); err == nil {
		t.Fatal("expected explicit empty runtimeVersion to be rejected")
	}
}

func TestClassifiesSharedManifestFixtureCorpus(t *testing.T) {
	root := filepath.Join("..", "..", "fixtures", "LambdaManifest")
	for directory, expected := range map[string]bool{"valid": true, "invalid": false} {
		entries, err := os.ReadDir(filepath.Join(root, directory))
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
				continue
			}
			path := filepath.Join(root, directory, entry.Name())
			encoded, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			_, err = DecodeLambdaManifest(encoded)
			if (err == nil) != expected {
				t.Errorf("unexpected fixture classification for %s: %v", path, err)
			}
		}
	}
}

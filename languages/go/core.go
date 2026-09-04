// Package lambdacore defines the portable Scintilla lambda contract.
package lambdacore

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	APIVersion         = "scintilla.run/lambda/v1"
	InvocationProtocol = "stdio-json-v1"
)

type Runtime string

const (
	RuntimeNodeJS Runtime = "nodejs"
	RuntimeBun    Runtime = "bun"
	RuntimeDeno   Runtime = "deno"
	RuntimeRust   Runtime = "rust"
	RuntimeErlang Runtime = "erlang"
	RuntimeGleam  Runtime = "gleam"
	RuntimeGolang Runtime = "golang"
	RuntimeBinary Runtime = "binary"
)

var validRuntimes = map[Runtime]struct{}{
	RuntimeNodeJS: {}, RuntimeBun: {}, RuntimeDeno: {}, RuntimeRust: {},
	RuntimeErlang: {}, RuntimeGleam: {}, RuntimeGolang: {}, RuntimeBinary: {},
}

type Artifact struct {
	Kind         string   `json:"kind"`
	Format       string   `json:"format,omitempty"`
	Image        string   `json:"image,omitempty"`
	Digest       string   `json:"digest,omitempty"`
	Entrypoint   []string `json:"entrypoint,omitempty"`
	Command      string   `json:"command,omitempty"`
	SHA256       string   `json:"sha256,omitempty"`
	OS           string   `json:"os,omitempty"`
	Architecture string   `json:"architecture,omitempty"`
	Args         []string `json:"args,omitempty"`
}

// UnmarshalJSON keeps the discriminated artifact union fail-closed. A field
// from the other variant is invalid even when its JSON value is empty.
func (artifact *Artifact) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return fmt.Errorf("decode artifact fields: %w", err)
	}

	var discriminator struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(data, &discriminator); err != nil {
		return fmt.Errorf("decode artifact kind: %w", err)
	}

	allowed := map[string]struct{}{"kind": {}}
	switch discriminator.Kind {
	case "container":
		for _, field := range []string{"format", "image", "digest", "entrypoint"} {
			allowed[field] = struct{}{}
		}
	case "executable":
		for _, field := range []string{"command", "sha256", "os", "architecture", "args"} {
			allowed[field] = struct{}{}
		}
	default:
		for _, field := range []string{"format", "image", "digest", "entrypoint", "command", "sha256", "os", "architecture", "args"} {
			allowed[field] = struct{}{}
		}
	}
	for field := range fields {
		if _, ok := allowed[field]; !ok {
			return fmt.Errorf("unknown field %q for %s artifact", field, discriminator.Kind)
		}
	}

	type artifactAlias Artifact
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var decoded artifactAlias
	if err := decoder.Decode(&decoded); err != nil {
		return fmt.Errorf("decode artifact: %w", err)
	}
	*artifact = Artifact(decoded)
	return nil
}

type LambdaManifest struct {
	APIVersion            string   `json:"apiVersion"`
	Name                  string   `json:"name"`
	Runtime               Runtime  `json:"runtime"`
	Protocol              string   `json:"protocol"`
	Handler               string   `json:"handler"`
	RuntimeVersion        string   `json:"runtimeVersion,omitempty"`
	Artifact              Artifact `json:"artifact"`
	runtimeVersionPresent bool
}

// UnmarshalJSON preserves whether the optional runtimeVersion property was
// present so an explicitly empty value cannot masquerade as omission.
func (manifest *LambdaManifest) UnmarshalJSON(data []byte) error {
	type manifestAlias LambdaManifest
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var decoded manifestAlias
	if err := decoder.Decode(&decoded); err != nil {
		return err
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	if raw, present := fields["runtimeVersion"]; present {
		var version string
		if err := json.Unmarshal(raw, &version); err != nil {
			return errors.New("runtimeVersion must be a string")
		}
		decoded.runtimeVersionPresent = true
	}
	*manifest = LambdaManifest(decoded)
	return nil
}

var (
	namePattern    = regexp.MustCompile(`^[a-z][a-z0-9-]{0,62}$`)
	shaPattern     = regexp.MustCompile(`^[a-f0-9]{64}$`)
	commandPattern = regexp.MustCompile(`^(\./|/)[A-Za-z0-9._/+-]+$`)
	imagePattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,511}$`)
)

func (manifest LambdaManifest) Validate() error {
	if manifest.APIVersion != APIVersion {
		return errors.New("unsupported apiVersion")
	}
	if !namePattern.MatchString(manifest.Name) {
		return errors.New("invalid lambda name")
	}
	if _, ok := validRuntimes[manifest.Runtime]; !ok {
		return errors.New("unsupported runtime")
	}
	if manifest.Protocol != InvocationProtocol {
		return errors.New("unsupported invocation protocol")
	}
	if !validBoundedString(manifest.Handler, 1, 64) {
		return errors.New("handler must contain 1 to 64 characters")
	}
	if (manifest.runtimeVersionPresent || manifest.RuntimeVersion != "") && !validBoundedString(manifest.RuntimeVersion, 1, 64) {
		return errors.New("runtimeVersion must contain 1 to 64 characters")
	}
	return manifest.Artifact.Validate()
}

// DecodeLambdaManifest rejects unknown JSON fields and validates the decoded
// manifest before returning it to a launcher.
func DecodeLambdaManifest(data []byte) (LambdaManifest, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest LambdaManifest
	if err := decoder.Decode(&manifest); err != nil {
		return LambdaManifest{}, fmt.Errorf("decode lambda manifest: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return LambdaManifest{}, errors.New("decode lambda manifest: trailing JSON value")
	}
	if err := manifest.Validate(); err != nil {
		return LambdaManifest{}, err
	}
	return manifest, nil
}

func (artifact Artifact) Validate() error {
	switch artifact.Kind {
	case "container":
		if artifact.Command != "" || artifact.SHA256 != "" || artifact.OS != "" || artifact.Architecture != "" || len(artifact.Args) > 0 {
			return errors.New("container artifact contains executable-only fields")
		}
		if artifact.Format != "docker" && artifact.Format != "oci" {
			return errors.New("unsupported container format")
		}
		if !imagePattern.MatchString(artifact.Image) {
			return errors.New("invalid container image")
		}
		if !strings.HasPrefix(artifact.Digest, "sha256:") || !shaPattern.MatchString(strings.TrimPrefix(artifact.Digest, "sha256:")) {
			return errors.New("container image must be SHA-256 pinned")
		}
		if len(artifact.Entrypoint) < 1 || len(artifact.Entrypoint) > 64 {
			return errors.New("entrypoint must contain 1 to 64 argv values")
		}
		if !validArgv(artifact.Entrypoint) {
			return errors.New("entrypoint values must contain 1 to 1024 characters")
		}
	case "executable":
		if artifact.Format != "" || artifact.Image != "" || artifact.Digest != "" || len(artifact.Entrypoint) > 0 {
			return errors.New("executable artifact contains container-only fields")
		}
		if !commandPattern.MatchString(artifact.Command) {
			return errors.New("command must be an absolute or ./ path without shell text")
		}
		if !shaPattern.MatchString(artifact.SHA256) {
			return errors.New("executable checksum must be lowercase SHA-256")
		}
		if artifact.OS != "linux" && artifact.OS != "darwin" && artifact.OS != "windows" && artifact.OS != "freebsd" {
			return errors.New("unsupported executable operating system")
		}
		if artifact.Architecture != "amd64" && artifact.Architecture != "arm64" && artifact.Architecture != "armv7" && artifact.Architecture != "riscv64" {
			return errors.New("unsupported executable architecture")
		}
		if len(artifact.Args) > 64 {
			return errors.New("args must contain at most 64 values")
		}
		if !validArgv(artifact.Args) {
			return errors.New("argument values must contain 1 to 1024 characters")
		}
	default:
		return errors.New("artifact kind must be container or executable")
	}
	return nil
}

func validArgv(values []string) bool {
	for _, value := range values {
		if !validBoundedString(value, 1, 1024) {
			return false
		}
	}
	return true
}

func validBoundedString(value string, minimum, maximum int) bool {
	if !utf8.ValidString(value) {
		return false
	}
	length := utf8.RuneCountInString(value)
	return length >= minimum && length <= maximum
}

type InvocationRequest[T any] struct {
	Protocol     string `json:"protocol"`
	InvocationID string `json:"invocationId"`
	TimeoutMS    uint32 `json:"timeoutMs"`
	Traceparent  string `json:"traceparent,omitempty"`
	Payload      T      `json:"payload"`
}

type InvocationError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

type InvocationResult[T any] struct {
	Status  string           `json:"status"`
	Payload *T               `json:"payload,omitempty"`
	Error   *InvocationError `json:"error,omitempty"`
}

type InvocationResponse[T any] struct {
	Protocol     string              `json:"protocol"`
	InvocationID string              `json:"invocationId"`
	Result       InvocationResult[T] `json:"result"`
}

func Success[T any](invocationID string, payload T) InvocationResponse[T] {
	return InvocationResponse[T]{
		Protocol: InvocationProtocol, InvocationID: invocationID,
		Result: InvocationResult[T]{Status: "ok", Payload: &payload},
	}
}

func Failure[T any](invocationID string, failure InvocationError) InvocationResponse[T] {
	return InvocationResponse[T]{
		Protocol: InvocationProtocol, InvocationID: invocationID,
		Result: InvocationResult[T]{Status: "error", Error: &failure},
	}
}

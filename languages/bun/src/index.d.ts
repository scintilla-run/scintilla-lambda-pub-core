export const API_VERSION: "scintilla.run/lambda/v1";
export const INVOCATION_PROTOCOL: "stdio-json-v1";
export const CONTEXT_ABI: "scintilla.run/context/v1";
export const MODULE_KINDS: readonly ModuleKind[];
export const RUNTIMES: readonly Runtime[];
export const CONTAINER_FORMATS: readonly ContainerFormat[];
export const OPERATING_SYSTEMS: readonly OperatingSystem[];
export const ARCHITECTURES: readonly Architecture[];

export type Runtime = "nodejs" | "bun" | "deno" | "rust" | "erlang" | "gleam" | "golang" | "binary";
export type ContainerFormat = "docker" | "oci";
export type OperatingSystem = "linux" | "darwin" | "windows" | "freebsd";
export type Architecture = "amd64" | "arm64" | "armv7" | "riscv64";
export type InvocationProtocol = "stdio-json-v1";
export type ModuleKind = "lambda" | "middleware" | "extension";

export interface ModuleDescriptor {
  kind: ModuleKind;
  exportName: string;
  contextAbi: typeof CONTEXT_ABI;
}

export interface InvocationContext {
  abi: typeof CONTEXT_ABI;
  invocationId: string;
  timeoutMs: number;
  traceparent?: string;
}

export interface ModuleContext {
  readonly invocation: InvocationContext;
}

export type ApplicationContext<State extends object = Record<string, never>> =
  Readonly<State & ModuleContext>;

export interface ContainerArtifact {
  kind: "container";
  format: ContainerFormat;
  image: string;
  digest: string;
  entrypoint: string[];
}

export interface ExecutableArtifact {
  kind: "executable";
  command: string;
  sha256: string;
  os: OperatingSystem;
  architecture: Architecture;
  args?: string[];
}

export interface LambdaManifest {
  apiVersion: "scintilla.run/lambda/v1";
  name: string;
  runtime: Runtime;
  protocol: InvocationProtocol;
  handler: string;
  runtimeVersion?: string;
  artifact: ContainerArtifact | ExecutableArtifact;
}

export interface InvocationRequest<T = unknown> {
  protocol: InvocationProtocol;
  invocationId: string;
  timeoutMs: number;
  traceparent?: string;
  payload: T;
}

export type LambdaHandler<Input = unknown, Output = unknown> =
  (payload: Input, ctx: InvocationContext) => Output | Promise<Output>;

export type ContextualLambdaHandler<
  Input = unknown,
  Output = unknown,
  Context extends ModuleContext = ModuleContext,
> = (payload: Input, ctx: Context) => Output | Promise<Output>;

export interface LambdaModule<Input = unknown, Output = unknown> {
  kind: "lambda";
  run: LambdaHandler<Input, Output>;
}

export interface InvocationError {
  code: string;
  message: string;
  retryable: boolean;
}

export type InvocationResult<T = unknown> =
  | { status: "ok"; payload: T }
  | { status: "error"; error: InvocationError };

export interface InvocationResponse<T = unknown> {
  protocol: InvocationProtocol;
  invocationId: string;
  result: InvocationResult<T>;
}

export type ModuleValidationResult =
  | { ok: true; value: ModuleDescriptor }
  | { ok: false; issues: string[] };

export type ValidationResult =
  | { ok: true; value: LambdaManifest }
  | { ok: false; issues: string[] };

export function invocationContext<T>(request: InvocationRequest<T>): InvocationContext;
export function applicationContext<State extends object>(invocation: InvocationContext, state: State): ApplicationContext<State>;
export function validateModuleDescriptor(value: unknown): ModuleValidationResult;
export function assertModuleDescriptor(value: unknown): ModuleDescriptor;
export function lambdaModuleDescriptor(exportName?: string): ModuleDescriptor;
export function validateLambdaManifest(value: unknown): ValidationResult;
export function assertLambdaManifest(value: unknown): LambdaManifest;
export function invocationSuccess<T>(invocationId: string, payload: T): InvocationResponse<T>;
export function invocationFailure(invocationId: string, code: string, message: string, retryable?: boolean): InvocationResponse<never>;

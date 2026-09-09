import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const EVIDENCE_SCHEMA = "scintilla.run/lambda-runtime-evidence/v1";
export const RECEIPT_SCHEMA = "scintilla.run/lambda-language-boundary-receipt/v1";
export const EXPECTED_LANGUAGES = Object.freeze([
  "bun",
  "deno",
  "erlang",
  "gleam",
  "go",
  "rust",
  "typescript",
]);

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const SAFE_VERSION = /^[\x20-\x7e]{1,160}$/u;
const SAFE_COMMAND = /^[\x20-\x7e]{1,1024}$/u;

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function digestJson(value) {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalStringify(actual) !== canonicalStringify(wanted)) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function validateAuthorityBoundary(report, contractIr) {
  assertPlainObject(report, "parity report");
  assertPlainObject(contractIr, "Contract IR");

  if (
    report.status !== "passed" ||
    report.zeroUnexplainedFindings !== true ||
    !Array.isArray(report.findings) ||
    report.findings.length !== 0 ||
    typeof report.runId !== "string" ||
    !SHA256.test(report.runId)
  ) {
    throw new Error("parity report is not a zero-finding TJSV pass");
  }

  if (
    contractIr.status !== "passed" ||
    contractIr.admissible !== true ||
    !Array.isArray(contractIr.declarations) ||
    contractIr.declarations.length === 0
  ) {
    throw new Error("Contract IR is not an admissible TJSV result");
  }

  const authorities = contractIr.authorities;
  assertPlainObject(authorities, "Contract IR authorities");
  if (
    authorities.typespec !== "independently-authored" ||
    authorities.jsonSchema !== "independently-authored" ||
    authorities.generatedJsonSchema !== "comparison-evidence-only" ||
    authorities.precedence !== "none"
  ) {
    throw new Error("Contract IR changed the peer-authority boundary");
  }

  const receiptRunId = contractIr.admission?.receipt?.runId;
  if (receiptRunId !== report.runId) {
    throw new Error("Contract IR is not bound to the supplied TJSV receipt");
  }

  const declarationIds = contractIr.declarations.map((declaration, index) => {
    assertPlainObject(declaration, `Contract IR declaration ${index}`);
    if (typeof declaration.id !== "string" || declaration.id.length === 0 || declaration.id.length > 256) {
      throw new Error(`Contract IR declaration ${index} has an invalid identity`);
    }
    return declaration.id;
  });
  if (new Set(declarationIds).size !== declarationIds.length) {
    throw new Error("Contract IR contains duplicate declaration identities");
  }

  return declarationIds.sort();
}

async function readJson(path, label) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`${label} is unreadable`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function validateEvidenceShape(evidence, label) {
  assertPlainObject(evidence, label);
  assertExactKeys(
    evidence,
    [
      "authority",
      "contractIrSha256",
      "declarationIds",
      "language",
      "parityReportSha256",
      "parityRunId",
      "runtimeVersion",
      "schema",
      "sourceCommit",
      "status",
      "testCommand",
      "tjsvRevision",
    ],
    label,
  );
  assertPlainObject(evidence.authority, `${label}.authority`);
  assertExactKeys(
    evidence.authority,
    ["generatedJsonSchema", "jsonSchema", "precedence", "typespec"],
    `${label}.authority`,
  );

  if (evidence.schema !== EVIDENCE_SCHEMA || evidence.status !== "passed") {
    throw new Error(`${label} is not passed runtime evidence`);
  }
  if (!EXPECTED_LANGUAGES.includes(evidence.language)) {
    throw new Error(`${label} has an unsupported language`);
  }
  if (!GIT_SHA.test(evidence.sourceCommit) || !GIT_SHA.test(evidence.tjsvRevision)) {
    throw new Error(`${label} has an invalid immutable revision`);
  }
  if (!SHA256.test(evidence.parityRunId) || !SHA256.test(evidence.parityReportSha256) || !SHA256.test(evidence.contractIrSha256)) {
    throw new Error(`${label} has an invalid evidence digest`);
  }
  if (!SAFE_VERSION.test(evidence.runtimeVersion) || !SAFE_COMMAND.test(evidence.testCommand)) {
    throw new Error(`${label} has an invalid bounded runtime description`);
  }
  if (!Array.isArray(evidence.declarationIds) || evidence.declarationIds.length === 0) {
    throw new Error(`${label} has no admitted declaration inventory`);
  }
  if (new Set(evidence.declarationIds).size !== evidence.declarationIds.length) {
    throw new Error(`${label} has duplicate declaration identities`);
  }
  if (
    evidence.authority.typespec !== "independently-authored" ||
    evidence.authority.jsonSchema !== "independently-authored" ||
    evidence.authority.generatedJsonSchema !== "comparison-evidence-only" ||
    evidence.authority.precedence !== "none"
  ) {
    throw new Error(`${label} changed the peer-authority roles`);
  }
}

export async function writeRuntimeEvidence({
  language,
  sourceCommit,
  tjsvRevision,
  reportPath,
  contractIrPath,
  outputPath,
  runtimeVersion,
  testCommand,
}) {
  if (!EXPECTED_LANGUAGES.includes(language)) {
    throw new Error("language is not part of the required runtime boundary");
  }
  if (!GIT_SHA.test(sourceCommit) || !GIT_SHA.test(tjsvRevision)) {
    throw new Error("source and TJSV revisions must be immutable 40-character commits");
  }
  if (!SAFE_VERSION.test(runtimeVersion) || !SAFE_COMMAND.test(testCommand)) {
    throw new Error("runtime version or test command is empty, unbounded, or contains controls");
  }

  const report = await readJson(reportPath, "parity report");
  const contractIr = await readJson(contractIrPath, "Contract IR");
  const declarationIds = validateAuthorityBoundary(report, contractIr);

  const evidence = {
    schema: EVIDENCE_SCHEMA,
    status: "passed",
    language,
    sourceCommit,
    tjsvRevision,
    runtimeVersion,
    testCommand,
    parityRunId: report.runId,
    parityReportSha256: digestJson(report),
    contractIrSha256: digestJson(contractIr),
    declarationIds,
    authority: {
      typespec: "independently-authored",
      jsonSchema: "independently-authored",
      generatedJsonSchema: "comparison-evidence-only",
      precedence: "none",
    },
  };
  validateEvidenceShape(evidence, "runtime evidence");
  await atomicWriteJson(outputPath, evidence);
  return evidence;
}

function finding(ruleId, message, source = null) {
  return { ruleId, message, source };
}

async function collectJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(directory, entry.name))
    .sort();
}

export async function verifyLanguageBoundary({
  evidenceDirectory,
  sourceCommit,
  tjsvRevision,
  reportPath,
  contractIrPath,
  outputPath,
}) {
  const findings = [];
  let report;
  let contractIr;
  let declarationIds = [];

  try {
    report = await readJson(reportPath, "parity report");
    contractIr = await readJson(contractIrPath, "Contract IR");
    declarationIds = validateAuthorityBoundary(report, contractIr);
  } catch (error) {
    findings.push(finding("boundary-authority-evidence-invalid", error.message));
  }

  if (!GIT_SHA.test(sourceCommit)) {
    findings.push(finding("boundary-source-revision-invalid", "source revision is not an immutable commit"));
  }
  if (!GIT_SHA.test(tjsvRevision)) {
    findings.push(finding("boundary-tjsv-revision-invalid", "TJSV revision is not an immutable commit"));
  }

  let files = [];
  try {
    files = await collectJsonFiles(evidenceDirectory);
  } catch {
    findings.push(finding("boundary-evidence-directory-unreadable", "runtime evidence directory is unreadable"));
  }

  const seen = new Map();
  const accepted = [];
  const reportSha256 = report ? digestJson(report) : null;
  const contractIrSha256 = contractIr ? digestJson(contractIr) : null;

  for (const path of files) {
    const source = basename(path);
    let evidence;
    try {
      evidence = await readJson(path, `runtime evidence ${source}`);
      validateEvidenceShape(evidence, `runtime evidence ${source}`);
    } catch (error) {
      findings.push(finding("boundary-runtime-evidence-invalid", error.message, source));
      continue;
    }

    if (seen.has(evidence.language)) {
      findings.push(finding("boundary-runtime-duplicate", `duplicate runtime evidence for ${evidence.language}`, source));
      continue;
    }
    seen.set(evidence.language, source);

    if (evidence.sourceCommit !== sourceCommit) {
      findings.push(finding("boundary-source-revision-mismatch", `${evidence.language} evidence is stale`, source));
    }
    if (evidence.tjsvRevision !== tjsvRevision) {
      findings.push(finding("boundary-tjsv-revision-mismatch", `${evidence.language} used a different TJSV revision`, source));
    }
    if (report && evidence.parityRunId !== report.runId) {
      findings.push(finding("boundary-parity-run-mismatch", `${evidence.language} used a different parity run`, source));
    }
    if (reportSha256 && evidence.parityReportSha256 !== reportSha256) {
      findings.push(finding("boundary-parity-digest-mismatch", `${evidence.language} used a different parity receipt`, source));
    }
    if (contractIrSha256 && evidence.contractIrSha256 !== contractIrSha256) {
      findings.push(finding("boundary-contract-ir-digest-mismatch", `${evidence.language} used a different Contract IR`, source));
    }
    if (canonicalStringify(evidence.declarationIds) !== canonicalStringify(declarationIds)) {
      findings.push(finding("boundary-declaration-inventory-mismatch", `${evidence.language} used a different declaration inventory`, source));
    }

    accepted.push({
      language: evidence.language,
      runtimeVersion: evidence.runtimeVersion,
      testCommand: evidence.testCommand,
      evidenceSha256: digestJson(evidence),
    });
  }

  for (const language of EXPECTED_LANGUAGES) {
    if (!seen.has(language)) {
      findings.push(finding("boundary-runtime-evidence-missing", `missing runtime evidence for ${language}`));
    }
  }

  findings.sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
  accepted.sort((left, right) => left.language.localeCompare(right.language));

  const receipt = {
    schema: RECEIPT_SCHEMA,
    status: findings.length === 0 ? "passed" : "stopped_for_evaluation",
    sourceCommit: GIT_SHA.test(sourceCommit) ? sourceCommit : null,
    tjsvRevision: GIT_SHA.test(tjsvRevision) ? tjsvRevision : null,
    parityRunId: report?.runId ?? null,
    parityReportSha256: reportSha256,
    contractIrSha256,
    declarationIds,
    expectedLanguages: EXPECTED_LANGUAGES,
    runtimes: accepted,
    findings,
  };

  if (outputPath) {
    await atomicWriteJson(outputPath, receipt);
  }
  return receipt;
}

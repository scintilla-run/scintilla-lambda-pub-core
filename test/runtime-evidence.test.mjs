import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EXPECTED_LANGUAGES,
  digestJson,
  verifyLanguageBoundary,
  writeRuntimeEvidence,
} from "../scripts/runtime-evidence-core.mjs";

const SOURCE = "a".repeat(40);
const TJSV = "b".repeat(40);

function parityReport() {
  return {
    schema: "ores.typespec-json-schema-validator.report/v1",
    status: "passed",
    zeroUnexplainedFindings: true,
    runId: "c".repeat(64),
    findings: [],
  };
}

function contractIr(report) {
  return {
    schema: "ores.typespec-json-schema-validator.contract-ir/v1",
    status: "passed",
    admissible: true,
    authorities: {
      typespec: "independently-authored",
      jsonSchema: "independently-authored",
      generatedJsonSchema: "comparison-evidence-only",
      precedence: "none",
    },
    admission: { receipt: { runId: report.runId } },
    declarations: [
      { id: "Scintilla.Lambda.V1.InvocationRequest" },
      { id: "Scintilla.Lambda.V1.InvocationResponse" },
      { id: "Scintilla.Lambda.V1.LambdaManifest" },
    ],
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "scintilla-runtime-evidence-"));
  const evidenceDirectory = join(root, "evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  const report = parityReport();
  const ir = contractIr(report);
  const reportPath = join(root, "report.json");
  const contractIrPath = join(root, "contract-ir.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(contractIrPath, `${JSON.stringify(ir, null, 2)}\n`);

  for (const language of EXPECTED_LANGUAGES) {
    await writeRuntimeEvidence({
      language,
      sourceCommit: SOURCE,
      tjsvRevision: TJSV,
      reportPath,
      contractIrPath,
      outputPath: join(evidenceDirectory, `${language}.json`),
      runtimeVersion: `${language} 1.0.0`,
      testCommand: `test ${language}`,
    });
  }

  return { root, evidenceDirectory, reportPath, contractIrPath, report, ir };
}

async function verify(value, overrides = {}) {
  return verifyLanguageBoundary({
    evidenceDirectory: value.evidenceDirectory,
    sourceCommit: SOURCE,
    tjsvRevision: TJSV,
    reportPath: value.reportPath,
    contractIrPath: value.contractIrPath,
    outputPath: join(value.root, "receipt.json"),
    ...overrides,
  });
}

function ruleIds(receipt) {
  return new Set(receipt.findings.map((finding) => finding.ruleId));
}

test("admits a complete seven-runtime boundary bound to one TJSV receipt", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));

  const receipt = await verify(value);
  assert.equal(receipt.status, "passed");
  assert.deepEqual(receipt.findings, []);
  assert.deepEqual(
    receipt.runtimes.map(({ language }) => language),
    EXPECTED_LANGUAGES,
  );
  assert.equal(receipt.parityReportSha256, digestJson(value.report));
  assert.equal(receipt.contractIrSha256, digestJson(value.ir));

  const written = JSON.parse(await readFile(join(value.root, "receipt.json"), "utf8"));
  assert.deepEqual(written, receipt);
});

test("fails closed when one runtime is missing", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  await rm(join(value.evidenceDirectory, "gleam.json"));

  const receipt = await verify(value);
  assert.equal(receipt.status, "stopped_for_evaluation");
  assert.ok(ruleIds(receipt).has("boundary-runtime-evidence-missing"));
});

test("fails closed on stale source and TJSV revisions", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const path = join(value.evidenceDirectory, "rust.json");
  const evidence = JSON.parse(await readFile(path, "utf8"));
  evidence.sourceCommit = "d".repeat(40);
  evidence.tjsvRevision = "e".repeat(40);
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);

  const receipt = await verify(value);
  const rules = ruleIds(receipt);
  assert.equal(receipt.status, "stopped_for_evaluation");
  assert.ok(rules.has("boundary-source-revision-mismatch"));
  assert.ok(rules.has("boundary-tjsv-revision-mismatch"));
});

test("fails closed on a tampered parity or Contract IR digest", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const path = join(value.evidenceDirectory, "go.json");
  const evidence = JSON.parse(await readFile(path, "utf8"));
  evidence.parityReportSha256 = "f".repeat(64);
  evidence.contractIrSha256 = "0".repeat(64);
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);

  const receipt = await verify(value);
  const rules = ruleIds(receipt);
  assert.equal(receipt.status, "stopped_for_evaluation");
  assert.ok(rules.has("boundary-parity-digest-mismatch"));
  assert.ok(rules.has("boundary-contract-ir-digest-mismatch"));
});

test("fails closed on duplicated runtime evidence", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const rust = await readFile(join(value.evidenceDirectory, "rust.json"), "utf8");
  await writeFile(join(value.evidenceDirectory, "rust-copy.json"), rust);

  const receipt = await verify(value);
  assert.equal(receipt.status, "stopped_for_evaluation");
  assert.ok(ruleIds(receipt).has("boundary-runtime-duplicate"));
});

test("fails closed when the supplied TJSV result is non-admissible", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const ir = { ...value.ir, status: "stopped_for_evaluation", admissible: false, declarations: [] };
  await writeFile(value.contractIrPath, `${JSON.stringify(ir, null, 2)}\n`);

  const receipt = await verify(value);
  assert.equal(receipt.status, "stopped_for_evaluation");
  assert.ok(ruleIds(receipt).has("boundary-authority-evidence-invalid"));
});

test("runtime evidence writer rejects unsupported languages and stale authority binding", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));

  await assert.rejects(
    writeRuntimeEvidence({
      language: "python",
      sourceCommit: SOURCE,
      tjsvRevision: TJSV,
      reportPath: value.reportPath,
      contractIrPath: value.contractIrPath,
      outputPath: join(value.root, "python.json"),
      runtimeVersion: "python 3",
      testCommand: "python -m test",
    }),
    /required runtime boundary/u,
  );

  const ir = contractIr(value.report);
  ir.admission.receipt.runId = "1".repeat(64);
  await writeFile(value.contractIrPath, `${JSON.stringify(ir, null, 2)}\n`);
  await assert.rejects(
    writeRuntimeEvidence({
      language: "rust",
      sourceCommit: SOURCE,
      tjsvRevision: TJSV,
      reportPath: value.reportPath,
      contractIrPath: value.contractIrPath,
      outputPath: join(value.root, "stale.json"),
      runtimeVersion: "rust 1",
      testCommand: "cargo test",
    }),
    /not bound/u,
  );
});

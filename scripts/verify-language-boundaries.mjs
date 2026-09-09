import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const fromRoot = (value, fallback) => resolve(root, value || fallback);
const tjsvRoot = fromRoot(process.env.TJSV_MODULE_ROOT, "tmp/tjsv");
const manifestPath = fromRoot(
  process.env.LANGUAGE_BOUNDARY_MANIFEST,
  "config/language-boundaries.json",
);
const evidenceRoot = fromRoot(
  process.env.LANGUAGE_BOUNDARY_EVIDENCE_DIR,
  ".runtime-artifacts/runtime-evidence",
);
const reportPath = fromRoot(
  process.env.TJSV_PARITY_REPORT,
  ".contract-evidence/positive/report.json",
);
const contractIrPath = fromRoot(
  process.env.TJSV_CONTRACT_IR,
  ".contract-evidence/positive/contract-ir.json",
);
const generatedSchema = fromRoot(
  process.env.TJSV_GENERATED_SCHEMA,
  ".contract-evidence/positive/generated/typespec.generated.schema.json",
);
const typespec = fromRoot(process.env.TJSV_TYPESPEC, "typespec/main.tsp");
const authoredSchema = fromRoot(process.env.TJSV_AUTHORED_SCHEMA, "schema");
const outputRoot = fromRoot(
  process.env.TJSV_BOUNDARY_OUTPUT_DIR,
  ".language-boundary-verification",
);

const modulePath = join(
  tjsvRoot,
  "src",
  "language-boundary-current-inputs.mjs",
);
const { verifyLanguageBoundariesAgainstCurrentInputs } = await import(
  pathToFileURL(modulePath).href
);

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const clone = (value) => structuredClone(value);
const ruleIds = (receipt) => receipt.findings.map((finding) => finding.ruleId);

await mkdir(outputRoot, { recursive: true });

const manifest = await readJson(manifestPath);
const report = await readJson(reportPath);
const contractIr = await readJson(contractIrPath);
const evidenceByPath = new Map();
for (const target of manifest.targets) {
  const evidence = await readJson(join(evidenceRoot, target.evidence));
  evidenceByPath.set(target.evidence, evidence);
}

const currentInput = (overrides = {}) => ({
  typespec,
  generatedSchema,
  authoredSchema,
  report,
  contractIr,
  manifest,
  evidenceByPath,
  ...overrides,
});

async function writeReceipt(name, receipt) {
  await writeFile(
    join(outputRoot, `${name}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}

const positive = await verifyLanguageBoundariesAgainstCurrentInputs(currentInput());
await writeReceipt("positive", positive);
assert.equal(positive.status, "passed");
assert.equal(positive.zeroUnexplainedFindings, true);
assert.equal(positive.counts.requiredTargets, manifest.targets.length);
assert.equal(positive.counts.admittedEvidence, manifest.targets.length);
assert.deepEqual(positive.findings, []);

const mismatchedReceiptEvidence = new Map(evidenceByPath);
const receiptMismatchPath = manifest.targets.find(
  (target) => target.language === "typescript" && target.runtime === "node",
).evidence;
const receiptMismatch = clone(mismatchedReceiptEvidence.get(receiptMismatchPath));
receiptMismatch.receiptRunId = "9".repeat(64);
mismatchedReceiptEvidence.set(receiptMismatchPath, receiptMismatch);
const mismatchedReceipt = await verifyLanguageBoundariesAgainstCurrentInputs(
  currentInput({ evidenceByPath: mismatchedReceiptEvidence }),
);
await writeReceipt("negative-receipt-run-id", mismatchedReceipt);
assert.equal(mismatchedReceipt.status, "stopped_for_evaluation");
assert.ok(ruleIds(mismatchedReceipt).includes("boundary-evidence-receipt-mismatch"));

const mismatchedSourceEvidence = new Map(evidenceByPath);
const sourceMismatchPath = manifest.targets.find(
  (target) => target.language === "rust",
).evidence;
const sourceMismatch = clone(mismatchedSourceEvidence.get(sourceMismatchPath));
sourceMismatch.sourceRevision = "8".repeat(40);
mismatchedSourceEvidence.set(sourceMismatchPath, sourceMismatch);
const mismatchedSource = await verifyLanguageBoundariesAgainstCurrentInputs(
  currentInput({ evidenceByPath: mismatchedSourceEvidence }),
);
await writeReceipt("negative-source-revision", mismatchedSource);
assert.equal(mismatchedSource.status, "stopped_for_evaluation");
assert.ok(mismatchedSource.findings.length > 0);

const unknownFieldEvidence = new Map(evidenceByPath);
const unknownFieldPath = manifest.targets.find(
  (target) => target.language === "go",
).evidence;
const unknownField = clone(unknownFieldEvidence.get(unknownFieldPath));
unknownField.debug = true;
unknownFieldEvidence.set(unknownFieldPath, unknownField);
const unknownFieldReceipt = await verifyLanguageBoundariesAgainstCurrentInputs(
  currentInput({ evidenceByPath: unknownFieldEvidence }),
);
await writeReceipt("negative-unknown-field", unknownFieldReceipt);
assert.equal(unknownFieldReceipt.status, "stopped_for_evaluation");
assert.ok(unknownFieldReceipt.findings.length > 0);

const duplicatePathManifest = clone(manifest);
duplicatePathManifest.targets[1].evidence = duplicatePathManifest.targets[0].evidence;
const duplicatePathReceipt = await verifyLanguageBoundariesAgainstCurrentInputs(
  currentInput({ manifest: duplicatePathManifest }),
);
await writeReceipt("negative-duplicate-evidence-path", duplicatePathReceipt);
assert.equal(duplicatePathReceipt.status, "stopped_for_evaluation");
assert.ok(duplicatePathReceipt.findings.length > 0);

const staleRoot = join(root, "tmp", "language-boundary-stale-authority");
await rm(staleRoot, { recursive: true, force: true });
await cp(authoredSchema, staleRoot, { recursive: true });
const staleRuntimePath = join(staleRoot, "Runtime.json");
const staleRuntime = await readJson(staleRuntimePath);
staleRuntime.$comment = "do-not-leak-language-boundary-stale-marker";
await writeFile(staleRuntimePath, `${JSON.stringify(staleRuntime, null, 2)}\n`);
const staleAuthority = await verifyLanguageBoundariesAgainstCurrentInputs(
  currentInput({ authoredSchema: staleRoot }),
);
await writeReceipt("negative-stale-authored-authority", staleAuthority);
assert.equal(staleAuthority.status, "stopped_for_evaluation");
assert.equal(staleAuthority.counts.admittedEvidence, 0);
assert.ok(
  ruleIds(staleAuthority).includes(
    "boundary-current-contract-ir-verification-failed",
  ),
);
const staleText = JSON.stringify(staleAuthority);
assert.doesNotMatch(staleText, /do-not-leak-language-boundary-stale-marker/u);
assert.doesNotMatch(staleText, new RegExp(process.cwd().replaceAll("\\", "\\\\"), "u"));

const expectedFiles = [
  "positive.json",
  "negative-receipt-run-id.json",
  "negative-source-revision.json",
  "negative-unknown-field.json",
  "negative-duplicate-evidence-path.json",
  "negative-stale-authored-authority.json",
];
assert.equal(expectedFiles.length, 6);

console.log(
  `verified ${manifest.targets.length} required runtime targets across ${manifest.minimumDistinctLanguages} languages with ${expectedFiles.length - 1} fail-closed negative controls`,
);

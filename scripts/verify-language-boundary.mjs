#!/usr/bin/env node

import { resolve } from "node:path";
import { verifyLanguageBoundary } from "./runtime-evidence-core.mjs";

function argumentsFrom(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = /^--([a-z0-9-]+)=(.*)$/u.exec(argument);
    if (!match || values.has(match[1])) {
      throw new Error("arguments must be unique --name=value pairs");
    }
    values.set(match[1], match[2]);
  }
  return values;
}

try {
  const args = argumentsFrom(process.argv.slice(2));
  const required = [
    "evidence-dir",
    "source-commit",
    "tjsv-revision",
    "report",
    "contract-ir",
    "output",
  ];
  for (const name of required) {
    if (!args.get(name)) {
      throw new Error(`missing --${name}`);
    }
  }
  if (args.size !== required.length) {
    throw new Error("unknown language-boundary argument");
  }

  const receipt = await verifyLanguageBoundary({
    evidenceDirectory: resolve(args.get("evidence-dir")),
    sourceCommit: args.get("source-commit"),
    tjsvRevision: args.get("tjsv-revision"),
    reportPath: resolve(args.get("report")),
    contractIrPath: resolve(args.get("contract-ir")),
    outputPath: resolve(args.get("output")),
  });
  if (receipt.status !== "passed") {
    for (const finding of receipt.findings) {
      console.error(`${finding.ruleId}: ${finding.message}`);
    }
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`language boundary stopped: ${error.message}`);
  process.exitCode = 2;
}

#!/usr/bin/env node

import { resolve } from "node:path";
import { writeRuntimeEvidence } from "./runtime-evidence-core.mjs";

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
    "language",
    "source-commit",
    "tjsv-revision",
    "report",
    "contract-ir",
    "output",
    "runtime-version",
    "test-command",
  ];
  for (const name of required) {
    if (!args.get(name)) {
      throw new Error(`missing --${name}`);
    }
  }
  if (args.size !== required.length) {
    throw new Error("unknown runtime evidence argument");
  }

  await writeRuntimeEvidence({
    language: args.get("language"),
    sourceCommit: args.get("source-commit"),
    tjsvRevision: args.get("tjsv-revision"),
    reportPath: resolve(args.get("report")),
    contractIrPath: resolve(args.get("contract-ir")),
    outputPath: resolve(args.get("output")),
    runtimeVersion: args.get("runtime-version"),
    testCommand: args.get("test-command"),
  });
} catch (error) {
  console.error(`runtime evidence stopped: ${error.message}`);
  process.exitCode = 2;
}

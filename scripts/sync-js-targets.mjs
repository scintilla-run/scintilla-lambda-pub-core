import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "languages", "typescript", "src");

const targets = [
  {
    directory: "bun",
    package: {
      name: "@scintilla-run/lambda-pub-core-bun",
      version: "0.1.2",
      description: "Portable Scintilla lambda contracts for Bun",
      type: "module",
      exports: { ".": { types: "./src/index.d.ts", import: "./src/index.mjs" } },
      files: ["src", "README.md"],
      license: "MIT",
    },
  },
  {
    directory: "deno",
    package: {
      name: "@scintilla-run/lambda-pub-core-deno",
      version: "0.1.2",
      description: "Portable Scintilla lambda contracts for Deno",
      type: "module",
      exports: "./src/index.mjs",
      license: "MIT",
    },
  },
];

for (const target of targets) {
  const directory = join(root, "languages", target.directory);
  mkdirSync(join(directory, "src"), { recursive: true });
  for (const file of ["index.mjs", "index.d.ts"]) {
    copyFileSync(join(source, file), join(directory, "src", file));
  }
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(target.package, null, 2)}\n`);
  writeFileSync(
    join(directory, "README.md"),
    `# ${target.directory} binding\n\nGenerated from the dependency-free TypeScript/JavaScript binding. Do not edit this target directly.\n`,
  );
}

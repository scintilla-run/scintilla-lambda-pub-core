# TypeScript/JavaScript binding

Pure ESM binding shared by Node.js, Bun, and Deno. It has no runtime
dependencies and validates the security-relevant lambda manifest surface before
a runner launches an artifact.

```js
import { assertLambdaManifest } from "@scintilla-run/lambda-pub-core";

const manifest = assertLambdaManifest(JSON.parse(source));
```

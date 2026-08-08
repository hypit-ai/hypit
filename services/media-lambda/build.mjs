#!/usr/bin/env node
// Bundles the handler to one ESM file, so the image carries no node_modules
// and its content hash is a function of the source alone.
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "build");
await mkdir(out, { recursive: true });

const result = await build({
  entryPoints: [join(root, "src/handler.ts")],
  outfile: join(out, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // The AWS SDK is bundled rather than taken from the runtime, so the image
  // pins the same client version the tests ran against.
  banner: { js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);" },
  metafile: true,
  logLevel: "info",
});
if (result.errors.length > 0) process.exit(1);

const { readFile } = await import("node:fs/promises");
const bundle = await readFile(join(out, "index.mjs"));
const dockerfile = await readFile(join(root, "Dockerfile"));
const hash = createHash("sha256").update(bundle).update(dockerfile).digest("hex");
await writeFile(join(out, "Dockerfile"), dockerfile);
await writeFile(join(out, "bundle-hash.txt"), `${hash}\n`);
process.stdout.write(`${JSON.stringify({ bundleHash: hash, bytes: bundle.byteLength }, null, 2)}\n`);

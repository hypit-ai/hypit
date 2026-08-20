#!/usr/bin/env node
// Bundles the handler into a small managed-runtime ZIP. FFmpeg is deliberately
// absent: it is an independently versioned Lambda Layer mounted at /opt.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "build");
await mkdir(out, { recursive: true });

const deployment = {
  contract: "hypit.media-lambda-deployment@1",
  runtime: "nodejs22.x",
  architecture: "x86_64",
  handler: "index.handler",
  ffmpegVersion: "8.0.1",
  ffmpegPath: "/opt/bin/ffmpeg",
  ffprobePath: "/opt/bin/ffprobe",
  ffmpegLibraryPath: "/opt/lib",
};
const entry = join(out, "index.mjs");
const archive = join(out, "function.zip");
for (const path of [
  entry,
  archive,
  join(out, "deployment.json"),
  join(out, "bundle-hash.txt"),
  join(out, "function-artifact.json"),
]) await rm(path, { force: true });

const result = await build({
  entryPoints: [join(root, "src/handler.ts")],
  outfile: entry,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // The AWS SDK is bundled rather than taken from the runtime, so the ZIP
  // pins the same client version the tests ran against.
  banner: { js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);" },
  metafile: true,
  logLevel: "info",
});
if (result.errors.length > 0) process.exit(1);

const bundle = await readFile(entry);
const deploymentBytes = Buffer.from(`${JSON.stringify(deployment)}\n`, "utf8");
const hash = createHash("sha256").update(bundle).update(deploymentBytes).digest("hex");
await writeFile(join(out, "deployment.json"), deploymentBytes);
await writeFile(join(out, "bundle-hash.txt"), `${hash}\n`);

// Strip host-specific metadata and hold the only archive member at a stable
// timestamp. The Build identity is the source/deployment hash above; this also
// keeps repeated ZIPs byte-stable on the reference macOS/Linux toolchain.
await chmod(entry, 0o644);
const epoch = new Date("1980-01-01T00:00:00.000Z");
await utimes(entry, epoch, epoch);
await promisify(execFile)("zip", ["-X", "-q", "-j", archive, entry], {
  windowsHide: true,
  env: { ...process.env, TZ: "UTC" },
});
const archiveStat = await stat(archive);
const archiveBytes = await readFile(archive);
const archiveSha256 = createHash("sha256").update(archiveBytes).digest();
const functionArtifact = {
  contract: "hypit.media-lambda-function-artifact@1",
  bundleHash: hash,
  archiveSha256: archiveSha256.toString("hex"),
  codeSha256: archiveSha256.toString("base64"),
  archiveBytes: archiveStat.size,
};
await writeFile(join(out, "function-artifact.json"),
  `${JSON.stringify(functionArtifact, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({
  ...functionArtifact,
  bundleBytes: bundle.byteLength,
  deployment,
}, null, 2)}\n`);

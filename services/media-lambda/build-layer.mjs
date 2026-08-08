#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  cp,
  lstat,
  lutimes,
  mkdir,
  readlink,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const SOURCE_NAME = "ffmpeg-n8.0.1-66-g27b8d1a017-linux64-gpl-shared-8.0.tar.xz";
const SOURCE_URL =
  `https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-02-28-12-59/${SOURCE_NAME}`;
const SOURCE_SHA256 = "38f5363bef58d74547e5055846d76d8b20bb2872a87b0aab71611b010b437a6f";
const FFmpeg_VERSION = "8.0.1";
const EPOCH = new Date("1980-01-01T00:00:00.000Z");

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "build");
const source = process.env.NARRATAGE_FFMPEG_SOURCE ?? join(out, SOURCE_NAME);
const work = join(out, "ffmpeg-layer-work");
const extracted = join(work, "source");
const layer = join(work, "layer");
const archive = join(out, "ffmpeg-layer.zip");
const manifestPath = join(out, "ffmpeg-layer-artifact.json");

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function ensureSource() {
  await mkdir(out, { recursive: true });
  try {
    if (await sha256(source) === SOURCE_SHA256) return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (process.env.NARRATAGE_FFMPEG_SOURCE !== undefined) {
    throw new Error(`NARRATAGE_FFMPEG_SOURCE does not match pinned sha256 ${SOURCE_SHA256}`);
  }

  const temporary = `${source}.partial`;
  await rm(temporary, { force: true });
  const response = await fetch(SOURCE_URL, { redirect: "follow" });
  if (!response.ok || response.body === null) {
    throw new Error(`failed to download pinned FFmpeg archive: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { mode: 0o644 }));
  const actual = await sha256(temporary);
  if (actual !== SOURCE_SHA256) {
    await rm(temporary, { force: true });
    throw new Error(`FFmpeg source digest mismatch: expected ${SOURCE_SHA256}, got ${actual}`);
  }
  await rename(temporary, source);
}

async function entriesUnder(path, found = []) {
  const children = (await readdir(path)).sort();
  for (const name of children) {
    const child = join(path, name);
    const info = await lstat(child);
    if (info.isDirectory()) await entriesUnder(child, found);
    else found.push(child);
  }
  return found;
}

async function normalize(path) {
  const children = (await readdir(path)).sort();
  for (const name of children) {
    const child = join(path, name);
    const info = await lstat(child);
    if (info.isDirectory()) {
      await normalize(child);
      await chmod(child, 0o755);
      await utimes(child, EPOCH, EPOCH);
    } else if (info.isSymbolicLink()) {
      await lutimes(child, EPOCH, EPOCH);
    } else {
      await chmod(child, relative(layer, child).startsWith("bin/") ? 0o755 : 0o644);
      await utimes(child, EPOCH, EPOCH);
    }
  }
  await chmod(path, 0o755);
  await utimes(path, EPOCH, EPOCH);
}

await ensureSource();
if (await sha256(source) !== SOURCE_SHA256) throw new Error("pinned FFmpeg source changed during build");
await rm(work, { recursive: true, force: true });
await rm(archive, { force: true });
await mkdir(extracted, { recursive: true });
await mkdir(layer, { recursive: true });
await promisify(execFile)("tar", ["-xf", source, "-C", extracted]);

const roots = (await readdir(extracted)).sort();
if (roots.length !== 1) throw new Error(`FFmpeg archive must have one root directory; got ${roots.length}`);
const upstream = join(extracted, roots[0]);
for (const name of ["bin/ffmpeg", "bin/ffprobe", "lib", "LICENSE.txt"]) {
  await mkdir(dirname(join(layer, name)), { recursive: true });
  await cp(join(upstream, name), join(layer, name), {
    recursive: true,
    dereference: false,
    // Node otherwise resolves copied links against the source tree and writes
    // an absolute build-machine path. Such a Layer looks complete in `unzip
    // -l` but its libraries cannot be found under /opt at runtime.
    verbatimSymlinks: true,
  });
}

const provenance = {
  contract: "narratage.ffmpeg-lambda-layer@1",
  ffmpegVersion: FFmpeg_VERSION,
  architecture: "x86_64",
  upstream: { url: SOURCE_URL, sha256: SOURCE_SHA256 },
  paths: { ffmpeg: "/opt/bin/ffmpeg", ffprobe: "/opt/bin/ffprobe" },
  license: "GPL-3.0-or-later",
};
await writeFile(join(layer, "narratage-layer.json"), `${JSON.stringify(provenance, null, 2)}\n`);
await normalize(layer);

const files = await entriesUnder(layer);
for (const file of files) {
  const info = await lstat(file);
  if (!info.isSymbolicLink()) continue;
  const target = await readlink(file);
  if (isAbsolute(target)) throw new Error(`${relative(layer, file)} has an absolute symlink target: ${target}`);
  const resolved = resolve(dirname(file), target);
  const withinLayer = relative(layer, resolved);
  if (withinLayer.startsWith("..") || isAbsolute(withinLayer)) {
    throw new Error(`${relative(layer, file)} escapes the Layer: ${target}`);
  }
  await stat(resolved);
}
for (const binary of [join(layer, "bin/ffmpeg"), join(layer, "bin/ffprobe")]) {
  const magic = await readFile(binary);
  if (magic.length < 20 || !magic.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw new Error(`${relative(layer, binary)} is not an ELF binary`);
  }
  if (magic.readUInt16LE(18) !== 62) throw new Error(`${relative(layer, binary)} is not x86-64`);
}

await promisify(execFile)("zip", [
  "-X", "-q", "-y", archive,
  ...files.map((path) => relative(layer, path)),
], { cwd: layer, env: { ...process.env, TZ: "UTC" } });

let uncompressedBytes = 0;
for (const file of files) uncompressedBytes += (await lstat(file)).size;
const archiveBytes = (await stat(archive)).size;
const archiveSha256 = await sha256(archive);
const artifact = {
  ...provenance,
  archiveSha256,
  archiveBytes,
  uncompressedBytes,
  entryCount: files.length,
};
await writeFile(manifestPath, `${JSON.stringify(artifact, null, 2)}\n`);
await rm(work, { recursive: true, force: true });
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);

#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import {
  checkSource,
  compileSource,
  estimateSource,
  resolveScriptBindings,
} from "./compiler.js";
import { SvmlError } from "./diagnostics.js";
import { formatDocumentScript } from "./format.js";
import { projectCanvas, projectTimeline } from "./views.js";

type ParsedArgs = {
  command?: string;
  positional: string[];
  options: Map<string, string | true>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value?.startsWith("--")) {
      if (value) positional.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(name, next);
      index += 1;
    } else {
      options.set(name, true);
    }
  }
  return {
    ...(command ? { command } : {}),
    positional,
    options,
  };
}

function option(args: ParsedArgs, name: string, required = false): string | undefined {
  const value = args.options.get(name);
  if (typeof value === "string") return value;
  if (required) throw new Error(`--${name} is required`);
  return undefined;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const output = resolve(file);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = args.positional[0];
  if (args.command === "check") {
    if (!file) throw new Error("usage: svml check <file.svml>");
    const result = await checkSource(file);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      source: result.document.file,
      script: {
        segments: result.narrative.segments.length,
        words: result.narrative.tokens.length,
        selections: Object.keys(result.narrative.selections).length,
        moments: Object.keys(result.narrative.moments).length,
      },
      plan: {
        values: result.plan.values.length,
        instances: result.plan.instances.length,
        edges: result.plan.edges.length,
        root: result.plan.root,
      },
      kernels: result.manifests.map((manifest) => ({
        name: manifest.name,
        abi: manifest.abiVersion,
        manifestHash: manifest.sourceHash,
        implementationHash: manifest.implementationHash,
      })),
      reproducibility: {
        lockRequiredForFrozenBuild: true,
        modules: result.lock.modules.length,
      },
    }, null, 2)}\n`);
    return;
  }
  if (args.command === "lock") {
    if (!file) throw new Error("usage: svml lock <file.svml> [--out svml.lock]");
    const result = await checkSource(file);
    const output = option(args, "out") ?? resolve(dirname(resolve(file)), "svml.lock");
    await writeJson(output, result.lock);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      source: result.document.file,
      output: resolve(output),
      modules: result.lock.modules.length,
      kernels: result.lock.kernels.length,
    })}\n`);
    return;
  }
  if (args.command === "script") {
    if (!file) throw new Error("usage: svml script <file.svml> [--out tokens.json]");
    const result = await checkSource(file);
    const payload = {
      projections: result.narrative.projections,
      segments: result.narrative.segments.map((segment) => ({
        id: segment.id,
        tokenStart: segment.tokenStart,
        tokenEnd: segment.tokenEnd,
      })),
      words: result.narrative.tokens.map((token) => ({
        id: token.id,
        text: token.text,
        normalized: token.normalized,
        segmentId: token.segmentId,
      })),
      selections: result.narrative.selections,
      moments: result.narrative.moments,
    };
    const output = option(args, "out");
    if (output) await writeJson(output, payload);
    else process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (args.command === "plan") {
    if (!file) throw new Error("usage: svml plan <file.svml> [--out plan.json]");
    const result = await checkSource(file);
    const output = option(args, "out");
    if (output) await writeJson(output, result.plan);
    else process.stdout.write(`${JSON.stringify(result.plan, null, 2)}\n`);
    return;
  }
  if (args.command === "fmt") {
    if (!file) throw new Error("usage: svml fmt <file.svml> [--check|--write|--out formatted.svml]");
    const checked = await checkSource(file);
    const formatted = formatDocumentScript(
      checked.document,
      checked.narrative,
      resolveScriptBindings(checked.document),
    );
    if (args.options.has("check")) {
      if (formatted !== checked.document.source) {
        throw new Error(`${resolve(file)} is not canonically formatted`);
      }
      process.stdout.write(`${resolve(file)} is canonically formatted\n`);
      return;
    }
    const output = option(args, "out");
    if (args.options.has("write")) {
      await writeFile(resolve(file), formatted, "utf8");
    } else if (output) {
      await writeFile(resolve(output), formatted, "utf8");
    } else {
      process.stdout.write(formatted);
    }
    return;
  }
  if (args.command === "estimate") {
    if (!file) throw new Error("usage: svml estimate <file.svml> [--out alignment.json]");
    const numeric = (name: string): number | undefined => {
      const value = option(args, name);
      if (value === undefined) return undefined;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`--${name} requires a finite number`);
      return parsed;
    };
    const result = await estimateSource(file, {
      ...(numeric("syllables-per-second") !== undefined
        ? { syllablesPerSecond: numeric("syllables-per-second")! }
        : {}),
      ...(numeric("word-gap") !== undefined ? { wordGapSec: numeric("word-gap")! } : {}),
      ...(numeric("segment-padding") !== undefined
        ? { segmentPaddingSec: numeric("segment-padding")! }
        : {}),
      ...(numeric("empty-segment-duration") !== undefined
        ? { emptySegmentSec: numeric("empty-segment-duration")! }
        : {}),
      ...(numeric("max-caption-words") !== undefined
        ? { maxCaptionWords: numeric("max-caption-words")! }
        : {}),
      ...(numeric("fps") !== undefined ? { fps: numeric("fps")! } : {}),
    });
    const output = option(args, "out");
    if (output) await writeJson(output, result.evidence);
    else process.stdout.write(`${JSON.stringify(result.evidence, null, 2)}\n`);
    return;
  }
  if (args.command === "canvas") {
    if (!file) throw new Error("usage: svml canvas <file.svml> [--out canvas.json]");
    const result = await checkSource(file);
    const payload = projectCanvas(result.plan);
    const output = option(args, "out");
    if (output) await writeJson(output, payload);
    else process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (args.command === "timeline") {
    if (!file) {
      throw new Error("usage: svml timeline <file.svml> --evidence alignment.json [--out timeline.json]");
    }
    const evidenceFile = option(args, "evidence", true);
    const compilation = await compileSource({
      file,
      evidenceFile: evidenceFile!,
      ...(option(args, "lock") ? { lockFile: option(args, "lock")! } : {}),
      ...(option(args, "artifacts")
        ? { artifactsFile: option(args, "artifacts")! }
        : {}),
    });
    const payload = projectTimeline(compilation);
    const output = option(args, "out");
    if (output) await writeJson(output, payload);
    else process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (args.command === "compile") {
    if (!file) {
      throw new Error("usage: svml compile <file.svml> --evidence alignment.json --out index.html");
    }
    const evidenceFile = option(args, "evidence", true);
    const outputFile = option(args, "out", true);
    const compilation = await compileSource({
      file,
      evidenceFile: evidenceFile!,
      outputFile: outputFile!,
      ...(option(args, "lock") ? { lockFile: option(args, "lock")! } : {}),
      ...(option(args, "artifacts")
        ? { artifactsFile: option(args, "artifacts")! }
        : {}),
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      source: compilation.document.file,
      output: compilation.outputFile,
      durationFrames: compilation.located.durationFrames,
      fps: compilation.located.fps,
      instances: compilation.plan.instances.length,
      reproducible: compilation.reproducible,
    })}\n`);
    return;
  }
  if (args.command === "render") {
    if (!file) throw new Error("usage: svml render <index.html> --out video.mp4");
    const output = option(args, "out", true);
    const cli = createRequire(import.meta.url).resolve("hyperframes/bin/hyperframes.mjs");
    const compositionFile = resolve(file);
    const projectDir = dirname(compositionFile);
    await new Promise<void>((accept, reject) => {
      const command = [
        cli,
        "render",
        projectDir,
        "-o",
        resolve(output!),
      ];
      if (basename(compositionFile) !== "index.html") {
        command.push("--composition", basename(compositionFile));
      }
      const child = spawn(process.execPath, command, {
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code) => code === 0
        ? accept()
        : reject(new Error(`HyperFrames exited with status ${String(code)}`)));
    });
    return;
  }
  process.stdout.write(`SVML compiler

usage:
  svml check <file.svml>
  svml lock <file.svml> [--out svml.lock]
  svml script <file.svml> [--out narrative.json]
  svml plan <file.svml> [--out plan.json]
  svml fmt <file.svml> [--check|--write|--out formatted.svml]
  svml estimate <file.svml> [--out alignment.json] [--fps 30]
  svml canvas <file.svml> [--out canvas.json]
  svml timeline <file.svml> --evidence alignment.json [--out timeline.json] [--lock svml.lock] [--artifacts artifacts.json]
  svml compile <file.svml> --evidence alignment.json --out index.html [--lock svml.lock] [--artifacts artifacts.json]
  svml render <index.html> --out video.mp4

The current runtime is deterministic-only: it has no generation provider host.
`);
}

run().catch((error: unknown) => {
  if (error instanceof SvmlError) {
    process.stderr.write(`${JSON.stringify({ ok: false, diagnostics: error.diagnostics }, null, 2)}\n`);
  } else {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  process.exitCode = 1;
});

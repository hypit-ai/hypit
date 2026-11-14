import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import type {
  AudiovisualTerminalCapability,
  AudiovisualTerminalExecutor,
  PlannedSourceExecution,
} from "@hypit/audiovisual-execution";
import { inferPlannedPictureSamplingGrid } from "@hypit/audiovisual-execution";
import {
  verifyPreparedPictureSampling,
  type PreparedPictureSampling,
} from "@hypit/media";
import type { BlobRef } from "@hypit/protocol";
import {
  compareExactTemporalValues,
  exactTemporalRational,
  exactTemporalValueFromFrames,
  exactTemporalZero,
  resolveTemporalBoundary,
  sealLocalTemporalDomain,
  sealTemporalMap,
} from "@hypit/temporal";

import {
  assertManimPictureSourceSet,
  resolveManimPictureSource,
  type ManimPictureSourceSet,
} from "./program.js";

export type ManimArtifactGateway = {
  readonly get: (artifact: BlobRef) => Promise<Uint8Array | undefined>;
  readonly putFile: (path: string, mediaType: string) => Promise<BlobRef>;
};

export type ManimExecutionEnvironment = {
  readonly artifacts: ManimArtifactGateway;
  readonly pythonPath: string;
  readonly ffprobePath: string;
  readonly processTimeoutMs: number;
  readonly maxProcessOutputBytes: number;
  readonly maxFrameRate: number;
  readonly signal?: AbortSignal;
};

export type ManimTerminal = {
  readonly terminal: string;
  readonly representation: string;
  readonly sources: ManimPictureSourceSet;
  readonly environment: ManimExecutionEnvironment;
};

export type ManimTerminalCapabilityInput = Pick<
ManimTerminal,
"terminal" | "representation" | "sources"
>;

const manimRunner = resolve(import.meta.dirname, "../runtime/hypit_manim_runner.py");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function executionEnd(task: PlannedSourceExecution) {
  assert(task.requested.kind === "signal", `Manim Source ${task.source}.${task.output} is constant.`);
  if (task.acquisition.kind === "whole") return task.requested.regions.domain.duration;
  assert(task.acquisition.kind === "sequential"
    && compareExactTemporalValues(task.acquisition.origin, exactTemporalZero()) === 0,
  `Manim Source ${task.source}.${task.output} requires whole or zero-origin sequential acquisition.`);
  assert(task.acquisition.execution.regions.length === 1,
    `Manim Source ${task.source}.${task.output} sequential acquisition is not one continuous prefix.`);
  return task.acquisition.execution.regions[0]!.end.position;
}

/** Coarsest rational zero-origin grid containing the Source-local observations. */
export function manimFrameRate(
  task: PlannedSourceExecution,
  maximum: number,
): import("@hypit/temporal").TemporalRate {
  assert(task.requested.kind === "signal", `Manim Source ${task.source}.${task.output} is constant.`);
  assert(task.samples !== undefined && task.samples.length > 0,
    `Manim Source ${task.source}.${task.output} has no exact Picture sample request.`);
  return inferPlannedPictureSamplingGrid(task, executionEnd(task), maximum).frameRate;
}

function run(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly environment: ManimExecutionEnvironment },
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
      maxBuffer: options.environment.maxProcessOutputBytes,
      timeout: options.environment.processTimeoutMs,
      signal: options.environment.signal,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(new Error(`${command} failed: ${(stderr || stdout || error.message).trim().slice(-4000)}`));
      } else resolve({ stdout, stderr });
    });
  });
}

async function filesWithSuffix(root: string, suffix: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(suffix)) result.push(path);
    }
  };
  await visit(root);
  return result;
}

type ProbedVideo = {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly alpha: boolean;
};

async function probeVideo(
  path: string,
  environment: ManimExecutionEnvironment,
  cwd: string,
): Promise<ProbedVideo> {
  const result = await run(environment.ffprobePath, [
    "-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,nb_read_frames:stream_tags=alpha_mode", "-of", "json", path,
  ], { cwd, environment });
  const value = JSON.parse(result.stdout) as {
    streams?: Array<Record<string, unknown> & { tags?: Record<string, unknown> }>;
  };
  const stream = value.streams?.[0];
  assert(stream !== undefined, "Manim output has no Picture stream.");
  const width = Number(stream.width);
  const height = Number(stream.height);
  const frames = Number(stream.nb_read_frames);
  assert(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0,
    "Manim output Picture extent is invalid.");
  assert(Number.isSafeInteger(frames) && frames > 0, "Manim output frame count is unavailable.");
  return { width, height, frames, alpha: stream.tags?.alpha_mode === "1" };
}

async function renderManimSource(
  task: PlannedSourceExecution,
  sources: ManimPictureSourceSet,
  environment: ManimExecutionEnvironment,
): Promise<PreparedPictureSampling> {
  assert(task.signal === "picture" && task.requested.kind === "signal" && task.pictureDomain !== undefined,
    `Manim task ${task.task} is not a signal Picture Source.`);
  const domain = task.requested.regions.domain;
  const picture = task.pictureDomain;
  assert(Number.isSafeInteger(picture.region.width) && picture.region.width > 0
    && Number.isSafeInteger(picture.region.height) && picture.region.height > 0,
  `Manim Source ${task.source}.${task.output} Picture domain must have a positive integer extent.`);
  const frameRate = manimFrameRate(task, environment.maxFrameRate);
  const sampling = { frameRate };
  const end = executionEnd(task);
  const frameCount = resolveTemporalBoundary(end, sampling, "cover");
  assert(frameCount > 0, `Manim Source ${task.source}.${task.output} requested no frames.`);

  const program = resolveManimPictureSource(sources, task.source, task.output);
  const work = await mkdtemp(join(tmpdir(), "hypit-manim-"));
  try {
    for (const file of program.files) {
      environment.signal?.throwIfAborted();
      const bytes = await environment.artifacts.get(file.artifact);
      assert(bytes !== undefined, `Manim Scene Artifact ${file.artifact.resource} is unavailable.`);
      const path = join(work, file.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { signal: environment.signal });
    }
    const media = join(work, "media");
    await run(environment.pythonPath, [
      manimRunner, String(frameCount),
      "--format=webm", "--transparent", "--renderer=cairo", "--disable_caching",
      "--progress_bar=none", "--verbosity=ERROR",
      `--frame_rate=${frameRate.numerator / frameRate.denominator}`,
      `--resolution=${picture.region.width},${picture.region.height}`,
      `--media_dir=${media}`, "--output_file=hypit-product",
      program.entry, program.scene,
    ], { cwd: work, environment });
    const outputs = (await filesWithSuffix(media, ".webm"))
      .filter((path) => basename(path) === "hypit-product.webm");
    assert(outputs.length === 1, `Manim produced ${outputs.length} final WebM outputs, expected one.`);
    const observed = await probeVideo(outputs[0]!, environment, work);
    assert(observed.width === picture.region.width && observed.height === picture.region.height,
      `Manim output is ${observed.width}x${observed.height}, expected ${picture.region.width}x${picture.region.height}.`);
    assert(observed.frames === frameCount,
      `Manim output has ${observed.frames} frames, expected ${frameCount}.`);
    assert(observed.alpha, "Manim output does not declare an alpha channel.");
    const streamDomain = sealLocalTemporalDomain({
      id: `${domain.id}:manim-render`,
      duration: exactTemporalValueFromFrames(frameCount, sampling),
    });
    const product: PreparedPictureSampling = {
      source: {
        source: await environment.artifacts.putFile(outputs[0]!, "video/webm"),
        kind: "signal",
        streamIndex: 0,
        presentationStart: exactTemporalZero(),
        sourceDomain: streamDomain,
        interpretation: {
          codedWidth: observed.width,
          codedHeight: observed.height,
          sampleAspectRatio: { numerator: 1, denominator: 1 },
          rotationDegrees: 0,
          picture: {
            colorPrimaries: "bt709",
            colorTransfer: "bt709",
            colorMatrix: "bt709",
            colorRange: "limited",
            bitDepth: 8,
            alphaMode: "straight",
          },
        },
      },
      sampling: sealTemporalMap({ stages: [{
        target: structuredClone(domain),
        source: structuredClone(streamDomain),
        pieces: [{
          target: { start: exactTemporalZero(), end: structuredClone(end) },
          sourceAtStart: exactTemporalZero(),
          rate: { numerator: 1, denominator: 1 },
        }],
      }] }),
    };
    verifyPreparedPictureSampling(product);
    return product;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Source-only Manim offer; the Host still owns the actual binding choice. */
export function createManimTerminalCapability(
  input: ManimTerminalCapabilityInput,
): AudiovisualTerminalCapability {
  assert(input.terminal.length > 0, "Manim Terminal capability identity is empty.");
  assert(input.representation.length > 0, "Manim Terminal Product representation is empty.");
  assertManimPictureSourceSet(input.sources);
  return {
    terminal: input.terminal,
    finalOutputs: [],
    verifyBinding(context) {
      assert(context.target.kind === "source" && context.target.demand.signal === "picture",
        `Manim Terminal ${input.terminal} accepts only Picture Source demand.`);
      resolveManimPictureSource(
        input.sources,
        context.target.demand.source,
        context.target.demand.output,
      );
      const access = context.binding.sourceAccess;
      assert(access?.kind === "whole" || access?.kind === "sequential"
        && compareExactTemporalValues(access.origin, exactTemporalZero()) === 0,
      `Manim Source ${context.target.demand.source}.${context.target.demand.output} requires whole or zero-origin sequential access.`);
    },
    inputRepresentations: () => [],
    outputRepresentations: context => context.requirement.signal === "picture"
      ? [input.representation] : [],
  };
}

export function createManimTerminalExecutor(
  input: ManimTerminal,
): AudiovisualTerminalExecutor<PreparedPictureSampling, never> {
  assert(input.terminal.length > 0, "Manim Terminal identity is empty.");
  assert(input.representation.length > 0, "Manim Terminal representation is empty.");
  assertManimPictureSourceSet(input.sources);
  return {
    terminal: input.terminal,
    async execute(request) {
      assert(request.island.signals.length === 1 && request.island.signals[0] === "picture"
        && request.nodes.length === 0 && request.uses.length === 0 && request.inputs.length === 0
        && request.finalOutputs.length === 0,
      "Manim Terminal accepts only foreign Picture Source islands.");
      const productNodes = new Set(request.products.map((product) => {
        assert(product.requirement.signal === "picture"
          && product.binding.representation === input.representation,
        `Manim Terminal cannot publish Product ${product.requirement.id}.`);
        return product.requirement.node;
      }));
      const rendered = new Map<string, PreparedPictureSampling>();
      for (const source of request.sources) {
        assert(productNodes.has(source.task), `Manim Source task ${source.task} has no Picture Product consumer.`);
        rendered.set(source.task, await renderManimSource(source, input.sources, input.environment));
      }
      return { products: request.products.map((product) => {
        const value = rendered.get(product.requirement.node);
        assert(value !== undefined,
          `Manim Product ${product.requirement.id} does not belong to an executed Source task.`);
        return { product: product.requirement.id, value };
      }) };
    },
  };
}

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type {
  AudiovisualTerminalCapability,
  AudiovisualTerminalExecutor,
  PlannedSourceExecution,
} from "@hypit/audiovisual-execution";
import { inferPlannedPictureSamplingGrid } from "@hypit/audiovisual-execution";
import { verifyPreparedPictureSampling, type PreparedPictureSampling } from "@hypit/media";
import type { BlobRef } from "@hypit/protocol";
import {
  compareExactTemporalValues,
  exactTemporalValueFromFrames,
  exactTemporalZero,
  resolveTemporalBoundary,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
} from "@hypit/temporal";
import type { ExactTemporalValue } from "@hypit/temporal";

import {
  assertBlenderPictureSourceSet,
  resolveBlenderPictureSource,
  type BlenderPictureSourceSet,
} from "./program.js";

export type BlenderArtifactGateway = {
  readonly get: (artifact: BlobRef) => Promise<Uint8Array | undefined>;
  readonly putFile: (path: string, mediaType: string) => Promise<BlobRef>;
};

export type BlenderExecutionEnvironment = {
  readonly artifacts: BlenderArtifactGateway;
  readonly blenderPath: string;
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  readonly processTimeoutMs: number;
  readonly maxProcessOutputBytes: number;
  readonly maxFrameRate: number;
  readonly signal?: AbortSignal;
};

export type BlenderTerminal = {
  readonly terminal: string;
  readonly representation: string;
  readonly sources: BlenderPictureSourceSet;
  readonly environment: BlenderExecutionEnvironment;
};

export type BlenderTerminalCapabilityInput = Pick<
BlenderTerminal,
"terminal" | "representation" | "sources"
>;

const blenderRunner = resolve(import.meta.dirname, "../runtime/hypit_blender_runner.py");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rangeBounds(task: PlannedSourceExecution): {
  readonly start: ExactTemporalValue;
  readonly end: ExactTemporalValue;
} {
  assert(task.requested.kind === "signal" && task.acquisition.kind === "range",
    `Blender Source ${task.source}.${task.output} requires range acquisition.`);
  const first = task.acquisition.regions.regions[0];
  const last = task.acquisition.regions.regions.at(-1);
  assert(first !== undefined && last !== undefined,
    `Blender Source ${task.source}.${task.output} has no requested range.`);
  return {
    start: structuredClone(first.start.position),
    end: structuredClone(last.end.position),
  };
}

/** Coarsest rational zero-origin grid containing the Source-local observations. */
export function blenderFrameRate(
  task: PlannedSourceExecution,
  maximum: number,
): import("@hypit/temporal").TemporalRate {
  const bounds = rangeBounds(task);
  return inferPlannedPictureSamplingGrid(task, bounds.end, maximum).frameRate;
}

function run(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly environment: BlenderExecutionEnvironment },
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolveRun, reject) => {
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
      } else resolveRun({ stdout, stderr });
    });
  });
}

async function probeProduct(
  path: string,
  environment: BlenderExecutionEnvironment,
  cwd: string,
): Promise<{ readonly width: number; readonly height: number; readonly frames: number; readonly alpha: boolean }> {
  const result = await run(environment.ffprobePath, [
    "-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,nb_read_frames:stream_tags=alpha_mode", "-of", "json", path,
  ], { cwd, environment });
  const value = JSON.parse(result.stdout) as {
    readonly streams?: readonly (Record<string, unknown> & { readonly tags?: Readonly<Record<string, unknown>> })[];
  };
  const stream = value.streams?.[0];
  assert(stream !== undefined, "Blender output has no Picture stream.");
  const width = Number(stream.width);
  const height = Number(stream.height);
  const frames = Number(stream.nb_read_frames);
  assert(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0,
    "Blender output Picture extent is invalid.");
  assert(Number.isSafeInteger(frames) && frames > 0, "Blender output frame count is unavailable.");
  return { width, height, frames, alpha: stream.tags?.alpha_mode === "1" };
}

async function renderBlenderSource(
  task: PlannedSourceExecution,
  sources: BlenderPictureSourceSet,
  environment: BlenderExecutionEnvironment,
): Promise<PreparedPictureSampling> {
  assert(task.signal === "picture" && task.requested.kind === "signal" && task.pictureDomain !== undefined,
    `Blender task ${task.task} is not a signal Picture Source.`);
  const domain = task.requested.regions.domain;
  const picture = task.pictureDomain;
  assert(Number.isSafeInteger(picture.region.width) && picture.region.width > 0
    && Number.isSafeInteger(picture.region.height) && picture.region.height > 0,
  `Blender Source ${task.source}.${task.output} Picture domain must have a positive integer extent.`);
  const bounds = rangeBounds(task);
  assert(compareExactTemporalValues(bounds.start, bounds.end) < 0,
    `Blender Source ${task.source}.${task.output} requested range is empty.`);
  const frameRate = blenderFrameRate(task, environment.maxFrameRate);
  const sampling = { frameRate };
  const startFrame = resolveTemporalBoundary(bounds.start, sampling, "inside");
  const endFrame = resolveTemporalBoundary(bounds.end, sampling, "cover");
  const frameCount = endFrame - startFrame;
  assert(frameCount > 0, `Blender Source ${task.source}.${task.output} requested no frames.`);

  const program = resolveBlenderPictureSource(sources, task.source, task.output);
  const work = await mkdtemp(join(tmpdir(), "hypit-blender-"));
  try {
    for (const file of program.files) {
      environment.signal?.throwIfAborted();
      const bytes = await environment.artifacts.get(file.artifact);
      assert(bytes !== undefined, `Blender Scene Artifact ${file.artifact.resource} is unavailable.`);
      const path = join(work, file.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, environment.signal === undefined ? {} : { signal: environment.signal });
    }
    const frames = join(work, "frames");
    await run(environment.blenderPath, [
      "--background", "--factory-startup", "--python-exit-code", "1", "--python", blenderRunner, "--",
      "--entry", program.entry,
      "--start", String(startFrame), "--end", String(endFrame),
      "--fps-numerator", String(frameRate.numerator),
      "--fps-denominator", String(frameRate.denominator),
      "--width", String(picture.region.width), "--height", String(picture.region.height),
      "--output", frames,
    ], { cwd: work, environment });
    const output = join(work, "product.webm");
    await run(environment.ffmpegPath, [
      "-y", "-framerate", `${frameRate.numerator}/${frameRate.denominator}`, "-start_number", "0",
      "-i", join(frames, "%09d.png"), "-an", "-c:v", "libvpx-vp9", "-lossless", "1",
      "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-row-mt", "1",
      "-deadline", "realtime", "-cpu-used", "8", output,
    ], { cwd: work, environment });
    const observed = await probeProduct(output, environment, work);
    assert(observed.width === picture.region.width && observed.height === picture.region.height,
      `Blender output is ${observed.width}x${observed.height}, expected ${picture.region.width}x${picture.region.height}.`);
    assert(observed.frames === frameCount,
      `Blender output has ${observed.frames} frames, expected ${frameCount}.`);
    assert(observed.alpha, "Blender output does not declare an alpha channel.");

    const streamDomain = sealLocalTemporalDomain({
      id: `${domain.id}:blender-render`,
      duration: exactTemporalValueFromFrames(frameCount, sampling),
    });
    const product: PreparedPictureSampling = {
      source: {
        source: await environment.artifacts.putFile(output, "video/webm"),
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
          target: { start: bounds.start, end: bounds.end },
          sourceAtStart: subtractExactTemporalValues(
            bounds.start,
            exactTemporalValueFromFrames(startFrame, sampling),
          ),
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

export function createBlenderTerminalCapability(
  input: BlenderTerminalCapabilityInput,
): AudiovisualTerminalCapability {
  assert(input.terminal.length > 0, "Blender Terminal capability identity is empty.");
  assert(input.representation.length > 0, "Blender Terminal Product representation is empty.");
  assertBlenderPictureSourceSet(input.sources);
  return {
    terminal: input.terminal,
    finalOutputs: [],
    verifyBinding(context) {
      assert(context.target.kind === "source" && context.target.demand.signal === "picture",
        `Blender Terminal ${input.terminal} accepts only Picture Source demand.`);
      resolveBlenderPictureSource(input.sources, context.target.demand.source, context.target.demand.output);
      assert(context.binding.sourceAccess?.kind === "range",
        `Blender Source ${context.target.demand.source}.${context.target.demand.output} requires range access.`);
    },
    inputRepresentations: () => [],
    outputRepresentations: context => context.requirement.signal === "picture"
      ? [input.representation] : [],
  };
}

export function createBlenderTerminalExecutor(
  input: BlenderTerminal,
): AudiovisualTerminalExecutor<PreparedPictureSampling, never> {
  assert(input.terminal.length > 0, "Blender Terminal identity is empty.");
  assert(input.representation.length > 0, "Blender Terminal representation is empty.");
  assertBlenderPictureSourceSet(input.sources);
  return {
    terminal: input.terminal,
    async execute(request) {
      assert(request.island.signals.length === 1 && request.island.signals[0] === "picture"
        && request.nodes.length === 0 && request.uses.length === 0 && request.inputs.length === 0
        && request.finalOutputs.length === 0,
      "Blender Terminal accepts only foreign Picture Source islands.");
      const productNodes = new Set(request.products.map((product) => {
        assert(product.requirement.signal === "picture"
          && product.binding.representation === input.representation,
        `Blender Terminal cannot publish Product ${product.requirement.id}.`);
        return product.requirement.node;
      }));
      const rendered = new Map<string, PreparedPictureSampling>();
      for (const source of request.sources) {
        assert(productNodes.has(source.task), `Blender Source task ${source.task} has no Picture Product consumer.`);
        rendered.set(source.task, await renderBlenderSource(source, input.sources, input.environment));
      }
      return { products: request.products.map((product) => {
        const value = rendered.get(product.requirement.node);
        assert(value !== undefined,
          `Blender Product ${product.requirement.id} does not belong to an executed Source task.`);
        return { product: product.requirement.id, value };
      }) };
    },
  };
}

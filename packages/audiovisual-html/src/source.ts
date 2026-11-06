import {
  assertAudiovisualProgram,
  assertSignalOperatorProgram,
} from "@hypit/audiovisual";
import type {
  AudiovisualProgram,
  SignalOperatorProgram,
} from "@hypit/audiovisual";
import { verifyPreparedMedia } from "@hypit/media";
import type { PreparedMedia } from "@hypit/media";
import { assertSpatialMap } from "@hypit/spatial/algebra";
import type { SpatialMap } from "@hypit/spatial/algebra";
import type { TemporalSamplingGrid } from "@hypit/temporal";

export type AudiovisualHtmlSourceImplementation =
  | {
      readonly kind: "program";
      readonly program: SignalOperatorProgram;
    }
  | {
      readonly kind: "prepared-media";
      readonly media: PreparedMedia;
    }
  | {
      readonly kind: "audiovisual";
      readonly program: AudiovisualProgram;
      readonly sources: AudiovisualHtmlSourceSet;
    };

export type AudiovisualHtmlSource = {
  readonly source: string;
  readonly output: string;
  readonly implementation: AudiovisualHtmlSourceImplementation;
};

export type AudiovisualHtmlSourceSet = {
  readonly sources: readonly AudiovisualHtmlSource[];
};

export type AudiovisualHtmlOutput = {
  readonly id: string;
  readonly sampling: TemporalSamplingGrid;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly clearColor: string;
  };
  /** Exact output-viewport to Programme-picture sampling relation. */
  readonly pictureMapping: SpatialMap;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function assertAudiovisualHtmlOutput(value: AudiovisualHtmlOutput): void {
  identity(value.id, "Audiovisual HTML output identity");
  assert(Number.isSafeInteger(value.sampling.frameRate.numerator)
    && value.sampling.frameRate.numerator > 0,
  "Audiovisual HTML frame-rate numerator must be a positive safe integer.");
  assert(Number.isSafeInteger(value.sampling.frameRate.denominator)
    && value.sampling.frameRate.denominator > 0,
  "Audiovisual HTML frame-rate denominator must be a positive safe integer.");
  assert(Number.isSafeInteger(value.canvas.width) && value.canvas.width > 0
    && Number.isSafeInteger(value.canvas.height) && value.canvas.height > 0,
  "Audiovisual HTML Canvas must have positive integer dimensions.");
  assert(value.canvas.clearColor.length > 0, "Audiovisual HTML Canvas clear color is empty.");
  assertSpatialMap(value.pictureMapping);
  assert(value.pictureMapping.target.region.x === 0 && value.pictureMapping.target.region.y === 0
    && value.pictureMapping.target.region.width === value.canvas.width
    && value.pictureMapping.target.region.height === value.canvas.height,
  "Audiovisual HTML Picture Mapping target must be the selected Canvas viewport.");
}

export function sealAudiovisualHtmlSource(value: AudiovisualHtmlSource): AudiovisualHtmlSource {
  identity(value.source, "Audiovisual HTML Source identity");
  identity(value.output, "Audiovisual HTML Source output");
  switch (value.implementation.kind) {
    case "program": assertSignalOperatorProgram(
      value.implementation.program,
      `Audiovisual HTML Source ${value.source}.${value.output} programme`,
    ); break;
    case "prepared-media": {
      verifyPreparedMedia(value.implementation.media);
      assert(value.implementation.media.picture !== undefined,
        `Prepared Media ${value.implementation.media.id} has no selected Picture member.`);
      break;
    }
    case "audiovisual": {
      assertAudiovisualProgram(value.implementation.program);
      assert(value.implementation.program.picture !== undefined,
        `Nested Programme ${value.implementation.program.id} has no Picture output.`);
      assertAudiovisualHtmlSourceSet(value.implementation.sources);
      break;
    }
  }
  return structuredClone(value);
}

export function createAudiovisualHtmlSourceSet(): AudiovisualHtmlSourceSet {
  return { sources: [] };
}

export function assertAudiovisualHtmlSourceSet(value: AudiovisualHtmlSourceSet): void {
  assert(Array.isArray(value.sources), "Audiovisual HTML Source set is invalid.");
  const keys = new Set<string>();
  for (const source of value.sources) {
    sealAudiovisualHtmlSource(source);
    const key = `${source.source}\u0000${source.output}`;
    assert(!keys.has(key),
      `Audiovisual HTML Source ${source.source}.${source.output} is implemented more than once.`);
    keys.add(key);
  }
}

export function appendAudiovisualHtmlSource(
  set: AudiovisualHtmlSourceSet,
  source: AudiovisualHtmlSource,
): AudiovisualHtmlSourceSet {
  assertAudiovisualHtmlSourceSet(set);
  const next = { sources: [...set.sources, sealAudiovisualHtmlSource(source)] };
  assertAudiovisualHtmlSourceSet(next);
  return structuredClone(next);
}

export function resolveAudiovisualHtmlSource(
  set: AudiovisualHtmlSourceSet,
  source: string,
  output: string,
): AudiovisualHtmlSource {
  assertAudiovisualHtmlSourceSet(set);
  const matches = set.sources.filter((value) => value.source === source && value.output === output);
  assert(matches.length === 1,
    `Audiovisual HTML Source ${source}.${output} has ${matches.length} terminal implementations.`);
  return structuredClone(matches[0]!);
}

export function visualProgramHtmlSource(
  source: string,
  output: string,
  program: SignalOperatorProgram,
): AudiovisualHtmlSource {
  return sealAudiovisualHtmlSource({
    source,
    output,
    implementation: { kind: "program", program },
  });
}

export function preparedMediaHtmlSource(media: PreparedMedia): AudiovisualHtmlSource {
  return sealAudiovisualHtmlSource({
    source: media.id,
    output: "picture",
    implementation: { kind: "prepared-media", media },
  });
}

export function audiovisualProgramHtmlSource(
  program: AudiovisualProgram,
  sources: AudiovisualHtmlSourceSet,
): AudiovisualHtmlSource {
  return sealAudiovisualHtmlSource({
    source: program.id,
    output: "picture",
    implementation: { kind: "audiovisual", program, sources },
  });
}

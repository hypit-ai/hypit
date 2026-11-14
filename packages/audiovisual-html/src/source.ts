import {
  assertAudiovisualProgram,
  assertSignalOperatorProgram,
} from "@hypit/audiovisual";
import type {
  AudiovisualProgram,
  SignalOperatorProgram,
} from "@hypit/audiovisual";
import { verifyPreparedMedia, verifyPreparedPictureSampling } from "@hypit/media";
import type { PreparedMedia, PreparedPictureSampling } from "@hypit/media";

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
      /** Execution-owned Picture signal received from another Terminal island. */
      readonly kind: "picture-product";
      readonly product: PreparedPictureSampling;
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
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
    case "picture-product": {
      verifyPreparedPictureSampling(value.implementation.product);
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

/** Adapt one transient cross-island Picture signal without creating a Media Asset. */
export function pictureProductHtmlSource(
  source: string,
  output: string,
  product: PreparedPictureSampling,
): AudiovisualHtmlSource {
  return sealAudiovisualHtmlSource({
    source,
    output,
    implementation: { kind: "picture-product", product },
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

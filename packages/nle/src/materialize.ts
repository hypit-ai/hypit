import type { PackageSymbol } from "@hypit/audiovisual";
import { mediaPictureExtent, sealMediaInterpretation } from "@hypit/media";
import { compareExactTemporalValues, exactTemporalZero, type ExactTemporalValue } from "@hypit/temporal/algebra";
import {
  assertNleProject,
  findNleComposition,
  nleCompositionDuration,
} from "./project.js";
import { containNlePictureLayout } from "./picture.js";
import { nleLinearTimeMapping } from "./source-time.js";
import type { NleTransaction } from "./transaction.js";
import type {
  NleAdjustItem,
  NleAudioAppearance,
  NleComponentSharedValueBinding,
  NleComposition,
  NleMediaInterpretation,
  NleMediaReference,
  NleParameterBinding,
  NlePictureAppearance,
  NlePictureLayout,
  NleProject,
  NleTimeMapping,
  NleTrack,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function track(project: NleProject, id: string): { readonly composition: NleComposition; readonly track: NleTrack } {
  for (const composition of project.compositions) {
    const value = composition.tracks.find((candidate) => candidate.id === id);
    if (value !== undefined) return { composition, track: value };
  }
  throw new Error(`Unknown NLE Track: ${id}.`);
}

function fullCanvas(composition: NleComposition): NlePictureLayout {
  return {
    x: 0,
    y: 0,
    width: composition.canvas.width,
    height: composition.canvas.height,
    fit: "contain",
  };
}

/** Plan adoption of one accepted Media Asset as an ordinary Present Item. */
export function createMediaAssetMaterialization(project: NleProject, input: {
  readonly itemId: string;
  readonly asset: NleMediaReference;
  readonly interpretation: NleMediaInterpretation;
  readonly track: string;
  readonly at: ExactTemporalValue;
  readonly duration?: ExactTemporalValue;
  readonly audio?: Partial<NleAudioAppearance> | false;
  readonly picture?: Partial<NlePictureAppearance> & { readonly layout?: NlePictureLayout };
}): NleTransaction {
  assertNleProject(project);
  const interpretation = sealMediaInterpretation(input.interpretation);
  const location = track(project, input.track);
  const destination = location.track;
  const duration = input.duration ?? interpretation.domain?.duration;
  assert(duration !== undefined,
    `Constant NLE Media Asset ${input.asset.path} requires an explicit occurrence duration.`);
  assert(destination.kind !== "picture" || interpretation.picture !== undefined,
    `NLE Media Asset ${input.asset.path} has no Picture for Track ${destination.id}.`);
  assert(destination.kind !== "audio" || interpretation.audio !== undefined,
    `NLE Media Asset ${input.asset.path} has no Audio for Track ${destination.id}.`);
  assert(input.audio === undefined || input.audio === false || interpretation.audio !== undefined,
    `NLE Media Asset ${input.asset.path} cannot include missing Audio.`);

  const includeAudio = input.audio !== false && interpretation.audio !== undefined;
  const defaultLayout = interpretation.picture === undefined
    ? undefined
    : containNlePictureLayout(location.composition.canvas, (() => {
        const extent = mediaPictureExtent(interpretation.picture!);
        return { width: extent.widthPx, height: extent.heightPx };
      })());
  return { commands: [{
    kind: "item.add",
    track: destination.id,
    item: {
      id: input.itemId,
      kind: "present",
      source: "media",
      asset: structuredClone(input.asset),
      start: structuredClone(input.at),
      duration: structuredClone(duration),
      sourceTime: nleLinearTimeMapping(duration),
      enabled: true,
      ...(includeAudio ? { audio: structuredClone(input.audio ?? {}) } : {}),
      ...(destination.kind === "audio" ? {} : {
        picture: {
          ...structuredClone(input.picture ?? {}),
          layout: structuredClone(input.picture?.layout ?? defaultLayout!),
        },
      }),
    },
  }] };
}

/** Plan one package Component occurrence without evaluating the Component Source. */
export function createComponentMaterialization(project: NleProject, input: {
  readonly id: string;
  readonly track: string;
  readonly component: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly sharedValueBindings?: readonly NleComponentSharedValueBinding[];
  readonly media?: Readonly<Record<string, NleMediaReference>>;
  readonly at: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
  readonly sourceTime?: NleTimeMapping;
  readonly layout?: NlePictureLayout;
  readonly audio?: Partial<NleAudioAppearance>;
}): NleTransaction {
  assertNleProject(project);
  const location = track(project, input.track);
  const destination = location.track;
  assert(destination.kind !== "audio" || input.audio !== undefined,
    `NLE Component ${input.id} on an Audio Track requires Audio appearance.`);
  return { commands: [{
    kind: "item.add",
    track: destination.id,
    item: {
      id: input.id,
      kind: "present",
      source: "component",
      component: structuredClone(input.component),
      parameters: structuredClone(input.parameters),
      ...(input.sharedValueBindings === undefined
        ? {} : { sharedValueBindings: structuredClone(input.sharedValueBindings) }),
      ...(input.media === undefined ? {} : { media: structuredClone(input.media) }),
      start: structuredClone(input.at),
      duration: structuredClone(input.duration),
      sourceTime: structuredClone(input.sourceTime ?? nleLinearTimeMapping(input.duration)),
      enabled: true,
      ...(input.audio === undefined ? {} : { audio: structuredClone(input.audio) }),
      ...(destination.kind === "audio" ? {} : {
        picture: { layout: structuredClone(input.layout ?? fullCanvas(location.composition)) },
      }),
    },
  }] };
}

/** Plan one independently timed Programme-scoped Process. */
export function createAdjustMaterialization(project: NleProject, input: {
  readonly id: string;
  readonly track: string;
  readonly operator: PackageSymbol;
  readonly parameters: NleParameterBinding;
  readonly at: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
  readonly controlTime?: NleTimeMapping;
}): NleTransaction {
  assertNleProject(project);
  track(project, input.track);
  const item: NleAdjustItem = {
    id: input.id,
    kind: "adjust",
    operator: structuredClone(input.operator),
    parameters: structuredClone(input.parameters),
    start: structuredClone(input.at),
    duration: structuredClone(input.duration),
    controlTime: structuredClone(input.controlTime ?? nleLinearTimeMapping(input.duration)),
    enabled: true,
  };
  return { commands: [{ kind: "item.add", track: input.track, item }] };
}

/** Plan one occurrence of another Composition owned by the same Project. */
export function createCompositionMaterialization(project: NleProject, input: {
  readonly id: string;
  readonly track: string;
  readonly composition: string;
  readonly at: ExactTemporalValue;
  readonly layout?: NlePictureLayout;
  readonly audio?: NleAudioAppearance | false;
}): NleTransaction {
  assertNleProject(project);
  const source = findNleComposition(project, input.composition);
  const location = track(project, input.track);
  const duration = nleCompositionDuration(source);
  assert(compareExactTemporalValues(duration, exactTemporalZero()) > 0,
    `NLE Composition ${source.id} has no enabled duration to materialize.`);
  const hasPicture = source.tracks.some((candidate) => candidate.enabled && candidate.items.some((item) =>
    item.enabled && item.kind === "present" && item.picture !== undefined));
  const hasAudio = source.tracks.some((candidate) => candidate.enabled && candidate.items.some((item) =>
    item.enabled && item.kind === "present" && item.audio !== undefined));
  assert(location.track.kind !== "picture" || hasPicture,
    `NLE Composition ${source.id} has no Picture for Track ${location.track.id}.`);
  assert(location.track.kind !== "audio" || hasAudio,
    `NLE Composition ${source.id} has no Audio for Track ${location.track.id}.`);
  assert(location.track.kind !== "audio" || input.audio !== false,
    `NLE Composition ${source.id} on Audio Track ${location.track.id} cannot exclude Audio.`);
  const includeAudio = input.audio !== false && hasAudio;
  return { commands: [{
    kind: "item.add",
    track: location.track.id,
    item: {
      id: input.id,
      kind: "present",
      source: "composition",
      composition: source.id,
      start: structuredClone(input.at),
      duration: structuredClone(duration),
      sourceTime: nleLinearTimeMapping(duration),
      enabled: true,
      ...(includeAudio ? { audio: structuredClone(input.audio ?? {}) } : {}),
      ...(location.track.kind === "audio" ? {} : {
        picture: { layout: structuredClone(input.layout ?? fullCanvas(location.composition)) },
      }),
    },
  }] };
}

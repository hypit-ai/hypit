import { assertImplementationBinding, type PackageSymbol } from "./implementation.js";
import { mediaPictureExtent, sealMediaInterpretation } from "@hypit/media";
import {
  compareExactTemporalValues,
  exactTemporalZero,
  subtractExactTemporalValues,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";
import {
  assertNleProject,
  findNleComposition,
  nleCompositionDuration,
  nleItemEnd,
} from "./project.js";
import { containNlePictureLayout } from "./picture.js";
import { nleLinearTimeMapping } from "./source-time.js";
import type { NleTransaction } from "./transaction.js";
import type {
  NleAdjustItem,
  NleAudioAppearance,
  NleComponentValueBinding,
  NleComponentItem,
  NleComposition,
  NleMediaInterpretation,
  NleMediaReference,
  NleParameterBinding,
  NleMediaPictureAppearance,
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
  readonly picture?: Partial<NleMediaPictureAppearance> & { readonly layout?: NlePictureLayout };
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
      sourceTime: interpretation.domain === undefined
        ? nleLinearTimeMapping(duration, exactTemporalZero(), { numerator: 0, denominator: 1 })
        : nleLinearTimeMapping(duration),
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
  readonly role?: NleComponentItem["role"];
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly valueBindings?: readonly NleComponentValueBinding[];
  readonly media?: Readonly<Record<string, NleMediaReference>>;
  readonly at: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
  readonly sourceTime?: NleTimeMapping;
  readonly layout?: NlePictureLayout;
}): NleTransaction {
  assertNleProject(project);
  const location = track(project, input.track);
  const destination = location.track;
  assert(destination.kind === "picture",
    `NLE Component ${input.id} requires a Picture Track.`);
  assert((destination.role === "subtitle") === (input.role === "subtitle"),
    `NLE Component ${input.id} requires a Track with a matching subtitle role.`);
  return { commands: [{
    kind: "item.add",
    track: destination.id,
    item: {
      id: input.id,
      kind: "present",
      source: "component",
      ...(input.role === undefined ? {} : { role: input.role }),
      component: structuredClone(input.component),
      parameters: structuredClone(input.parameters),
      ...(input.valueBindings === undefined
        ? {} : { valueBindings: structuredClone(input.valueBindings) }),
      ...(input.media === undefined ? {} : { media: structuredClone(input.media) }),
      start: structuredClone(input.at),
      duration: structuredClone(input.duration),
      sourceTime: structuredClone(input.sourceTime ?? nleLinearTimeMapping(input.duration)),
      enabled: true,
      picture: { layout: structuredClone(input.layout ?? fullCanvas(location.composition)) },
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

/** Plan one package Transition by atomically turning a direct Picture cut into its canonical overlap. */
export function createTransitionMaterialization(project: NleProject, input: {
  readonly id: string;
  readonly composition: string;
  readonly outgoing: string;
  readonly incoming: string;
  readonly operator: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly duration: ExactTemporalValue;
}): NleTransaction {
  assertNleProject(project);
  const composition = findNleComposition(project, input.composition);
  const located = composition.tracks.flatMap((candidate) => candidate.items.map((item) => ({ track: candidate, item })));
  const outgoing = located.find((candidate) => candidate.item.id === input.outgoing);
  const incoming = located.find((candidate) => candidate.item.id === input.incoming);
  assert(outgoing !== undefined, `NLE Transition outgoing Item ${input.outgoing} is not in ${composition.id}.`);
  assert(incoming !== undefined, `NLE Transition incoming Item ${input.incoming} is not in ${composition.id}.`);
  assert(input.outgoing !== input.incoming, "NLE Transition requires two different Items.");
  assert(outgoing.track.id === incoming.track.id && outgoing.track.kind === "picture",
    "NLE Transition Items must belong to one Picture Track.");
  assert(outgoing.item.kind === "present" && incoming.item.kind === "present",
    "NLE Transition requires Present Items.");
  assert(outgoing.item.enabled && incoming.item.enabled, "NLE Transition cannot use a disabled Item.");
  assert(compareExactTemporalValues(nleItemEnd(outgoing.item), incoming.item.start) === 0,
    "NLE Transition materialization requires a direct outgoing/incoming cut.");
  assert(compareExactTemporalValues(input.duration, exactTemporalZero()) > 0,
    "NLE Transition duration must be positive.");
  assert(compareExactTemporalValues(input.duration, outgoing.item.duration) < 0
    && compareExactTemporalValues(input.duration, incoming.item.duration) < 0,
  "NLE Transition duration must be shorter than both Items.");
  assertImplementationBinding({ implementation: input.operator, parameters: input.parameters },
    `NLE Transition ${input.id}`);
  return { commands: [
    {
      kind: "item.move",
      ids: [input.incoming],
      delta: subtractExactTemporalValues(exactTemporalZero(), input.duration),
    },
    {
      kind: "transition.add",
      composition: composition.id,
      transition: {
        id: input.id,
        outgoing: input.outgoing,
        incoming: input.incoming,
        operator: structuredClone(input.operator),
        parameters: structuredClone(input.parameters),
      },
    },
  ] };
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

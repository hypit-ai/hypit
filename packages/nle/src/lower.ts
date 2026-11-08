import {
  assertAudioOperator,
  assertPictureOperator,
  assertProgramSource,
  audiovisualProgramSource,
  audioType,
  pictureType,
  pointwiseOperatorTemporalSupport,
  sealAudiovisualProgram,
  sealOccurrence,
  type AudioNode,
  type AudioOperator,
  type AudiovisualProgram,
  type Occurrence,
  type PictureOperator,
  type PictureNode,
  type ProgramSource,
} from "@hypit/audiovisual";
import { programSourceFromPreparedMedia } from "@hypit/media-avir";
import { verifyPreparedMedia } from "@hypit/media";
import { sameType } from "@hypit/protocol";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  exactTemporalZero,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";
import {
  sealLocalSpatialDomain,
  sealSpatialMap,
  type LocalSpatialDomain,
  type SpatialMap,
} from "@hypit/spatial/algebra";

import { assertNleProject, findNleMedia, nleProjectDuration } from "./project.js";
import type {
  NleEffect,
  NleItem,
  NleLoweringContext,
  NleLoweringHost,
  NlePictureAppearance,
  NleProject,
  NleResolvedItemSource,
  NleTrack,
} from "./types.js";

/** Read-only observation seam for downstream compilation sessions. It is never persisted in an NLE Project. */
export type NleLoweringObserver = {
  readonly lowered: (project: NleProject, program: AudiovisualProgram) => void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * NLE automation is already materialized in exact Item-local time. Lowering closes that local clock to
 * one factual Programme mapping; package resolvers never publish a named occurrence/source lookup.
 */
function itemControlMapping(
  item: NleItem,
  parent: AudiovisualProgram["domain"],
  control: import("@hypit/temporal/algebra").LocalTemporalDomain,
  label: string,
): import("@hypit/temporal/algebra").TemporalMap {
  assert(compareExactTemporalValues(control.duration, item.duration) === 0,
    `${label} Control ${control.id} has another duration.`);
  return sealTemporalMap({ stages: [{
    target: parent,
    source: control,
    pieces: [{
      target: {
        start: structuredClone(item.start),
        end: addExactTemporalValues(item.start, item.duration),
      },
      sourceAtStart: exactTemporalZero(),
      rate: { numerator: 1, denominator: 1 },
    }],
  }] });
}

function programmeSpace(project: NleProject): LocalSpatialDomain {
  return sealLocalSpatialDomain({
    id: `${project.id}:picture`,
    region: { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height },
  });
}

function fitMap(
  target: LocalSpatialDomain,
  source: LocalSpatialDomain,
  appearance: NlePictureAppearance,
): SpatialMap {
  const layout = appearance.layout;
  const sourceWidth = source.region.width;
  const sourceHeight = source.region.height;
  let width = layout.width;
  let height = layout.height;
  if (layout.fit !== "fill") {
    const scale = layout.fit === "contain"
      ? Math.min(layout.width / sourceWidth, layout.height / sourceHeight)
      : Math.max(layout.width / sourceWidth, layout.height / sourceHeight);
    width = sourceWidth * scale;
    height = sourceHeight * scale;
  }
  const x = layout.x + (layout.width - width) / 2;
  const y = layout.y + (layout.height - height) / 2;
  const xx = sourceWidth / width;
  const yy = sourceHeight / height;
  return sealSpatialMap({
    target,
    source,
    transform: { kind: "affine", xx, xy: 0, yx: 0, yy, tx: -x * xx, ty: -y * yy },
  });
}

function validateResolvedSource(value: NleResolvedItemSource, item: NleItem): void {
  assertProgramSource(value.source);
  if (value.pictureOutput !== undefined) {
    const picture = value.source.outputs[value.pictureOutput];
    assert(picture !== undefined && sameType(picture.type, pictureType) && picture.spatialDomain !== undefined,
      `NLE ${item.kind} Item ${item.id} resolved no Picture output ${value.pictureOutput}.`);
  }
  if (value.audioOutput !== undefined) {
    const audio = value.source.outputs[value.audioOutput];
    assert(audio !== undefined && sameType(audio.type, audioType),
      `NLE ${item.kind} Item ${item.id} resolved no Audio output ${value.audioOutput}.`);
  }
}

function sourceForItem(
  project: NleProject,
  track: NleTrack,
  item: NleItem,
  host: NleLoweringHost,
  observer?: NleLoweringObserver,
): NleResolvedItemSource {
  if (item.kind === "component") {
    const value = host.resolveComponent(item, { project, track });
    validateResolvedSource(value, item);
    return value;
  }
  if (item.kind === "compound") {
    const child = lowerNleProjectToAudiovisual(item.project, host, observer);
    const source = audiovisualProgramSource(child);
    return {
      source,
      ...(child.picture === undefined ? {} : { pictureOutput: "picture" }),
      ...(child.audio === undefined ? {} : { audioOutput: "audio" }),
    };
  }
  const declaration = findNleMedia(project, item.media);
  const media = host.resolveMedia(declaration, { project, track, item });
  verifyPreparedMedia(media);
  const source = programSourceFromPreparedMedia(media);
  const pictureOutput = source.outputs.picture === undefined ? undefined : "picture";
  return {
    source,
    ...(pictureOutput === undefined ? {} : { pictureOutput }),
    ...(source.outputs.audio === undefined ? {} : { audioOutput: "audio" }),
  };
}

function audioEffectNode(
  nodes: Record<string, AudioNode>,
  input: string,
  effect: NleEffect,
  item: NleItem,
  context: NleLoweringContext,
  host: NleLoweringHost,
  parent: AudiovisualProgram["domain"],
): string {
  const resolved = host.resolveAudioEffect(effect, item, context);
  assertAudioOperator(resolved.operator);
  assert(resolved.operator.inputs.length === 1,
    `NLE Audio Effect ${effect.id} must expose exactly one Audio input.`);
  const port = resolved.operator.inputs[0]!;
  const mappings: Record<string, import("@hypit/temporal/algebra").TemporalMap> = {};
  for (const [name, control] of Object.entries(resolved.operator.temporalControls)) {
    mappings[name] = itemControlMapping(item, parent, control,
      `NLE Audio Effect ${effect.id}`);
  }
  const id = `${item.id}:audio-effect:${effect.id}`;
  nodes[id] = {
    kind: "apply",
    operator: resolved.operator,
    inputs: { [port]: input },
    controlMappings: mappings,
  };
  return id;
}

function selection(item: NleItem, source: ProgramSource, outputName: string) {
  const output = source.outputs[outputName];
  assert(output !== undefined, `NLE Item ${item.id} selected missing Source output ${outputName}.`);
  if (output.kind === "constant") return { kind: "constant" as const };
  const local = sealLocalTemporalDomain({ id: `${item.id}:time`, duration: structuredClone(item.duration) });
  return { kind: "signal" as const, mapping: sealTemporalMap({ stages: [{
    target: local,
    source: output.domain,
    pieces: structuredClone(item.sourceTime.pieces),
  }] }) };
}

function occurrence(
  item: NleItem,
  parent: AudiovisualProgram["domain"],
  source: ProgramSource,
  outputs: readonly string[],
): Occurrence {
  const domain = sealLocalTemporalDomain({ id: `${item.id}:time`, duration: structuredClone(item.duration) });
  return sealOccurrence({
    id: item.id,
    source,
    domain,
    placement: {
      parent,
      start: structuredClone(item.start),
      active: { start: exactTemporalZero(), end: domain.duration },
    },
    selections: Object.fromEntries(outputs.map((output) => [output, selection(item, source, output)])),
  });
}

function effectNode(
  nodes: Record<string, PictureNode>,
  input: string,
  effect: NleEffect,
  item: NleItem,
  context: NleLoweringContext,
  host: NleLoweringHost,
  parent: AudiovisualProgram["domain"],
): string {
  const resolved = host.resolveEffect(effect, item, context);
  assertPictureOperator(resolved.operator);
  assert(resolved.operator.inputs.length === 1,
    `NLE Effect ${effect.id} must expose exactly one Picture input.`);
  const port = resolved.operator.inputs[0]!;
  const mappings: Record<string, import("@hypit/temporal/algebra").TemporalMap> = {};
  for (const [name, control] of Object.entries(resolved.operator.temporalControls)) {
    mappings[name] = itemControlMapping(item, parent, control,
      `NLE Effect ${effect.id}`);
  }
  const id = `${item.id}:effect:${effect.id}`;
  nodes[id] = {
    kind: "apply",
    operator: resolved.operator,
    inputs: { [port]: input },
    controlMappings: mappings,
  };
  return id;
}

export function lowerNleProjectToAudiovisual(
  project: NleProject,
  host: NleLoweringHost,
  observer?: NleLoweringObserver,
): AudiovisualProgram {
  assertNleProject(project);
  const duration = nleProjectDuration(project);
  assert(compareExactTemporalValues(duration, exactTemporalZero()) > 0,
    "NLE Project has no enabled Items to lower.");
  const domain = sealLocalTemporalDomain({ id: `${project.id}:time`, duration });
  const pictureDomain = programmeSpace(project);
  const occurrences: Record<string, Occurrence> = {};
  const pictureNodes: Record<string, PictureNode> = {};
  const audioNodes: Record<string, AudioNode> = {};
  const audioInputs: string[] = [];
  const located = new Map<string, { readonly item: NleItem; readonly track: NleTrack }>();
  const matteByContent = new Map(project.mattes.map((matte) => [matte.content, matte] as const));
  const matteSources = new Set(project.mattes.map((matte) => matte.matte));
  const paintOrder: string[] = [];
  for (const track of project.tracks) {
    for (const item of track.items) located.set(item.id, { item, track });
    if (track.kind !== "picture" || track.muted) continue;
    for (const item of track.items) {
      if (item.enabled && !matteSources.has(item.id)) paintOrder.push(item.id);
    }
  }
  const requiredPicture = new Set(paintOrder);
  const requireMatte = (id: string): void => {
    const matte = matteByContent.get(id);
    if (matte === undefined || requiredPicture.has(matte.matte)) return;
    requiredPicture.add(matte.matte);
    requireMatte(matte.matte);
  };
  for (const id of [...requiredPicture]) requireMatte(id);

  const requiredAudio = new Set<string>();
  for (const track of project.tracks) {
    if (track.muted) continue;
    for (const item of track.items) {
      if (!item.enabled) continue;
      if (item.audio !== undefined) requiredAudio.add(item.id);
    }
  }

  const itemRoots = new Map<string, string>();
  for (const [id, value] of located) {
    const needsPicture = requiredPicture.has(id);
    const needsAudio = requiredAudio.has(id);
    if (!needsPicture && !needsAudio) continue;
    const { item, track } = value;
    const context = { project, track } as const;
    const resolved = sourceForItem(project, track, item, host, observer);
    const outputs: string[] = [];
    if (needsPicture) {
      assert(resolved.pictureOutput !== undefined,
        `NLE Item ${item.id} resolved no Picture output.`);
      outputs.push(resolved.pictureOutput);
    }
    if (needsAudio) {
      assert(resolved.audioOutput !== undefined,
        `NLE ${item.kind} Item ${item.id} requests Audio but resolved no Audio output.`);
      outputs.push(resolved.audioOutput);
    }
    occurrences[item.id] = occurrence(item, domain, resolved.source, [...new Set(outputs)]);

    if (needsPicture) {
      const pictureOutput = resolved.pictureOutput!;
      const appearance = item.picture!;
      const use = `${item.id}:picture`;
      const placed = `${item.id}:placed`;
      const clipped = `${item.id}:clipped`;
      pictureNodes[use] = { kind: "use", occurrence: item.id, output: pictureOutput };
      pictureNodes[placed] = {
        kind: "remap",
        input: use,
        mapping: fitMap(pictureDomain, resolved.source.outputs[pictureOutput]!.spatialDomain!, appearance),
      };
      pictureNodes[clipped] = {
        kind: "crop",
        input: placed,
        region: {
          x: appearance.layout.x,
          y: appearance.layout.y,
          width: appearance.layout.width,
          height: appearance.layout.height,
        },
      };
      let root = clipped;
      for (const effect of appearance.effects) {
        root = effectNode(pictureNodes, root, effect, item, context, host, domain);
      }
      itemRoots.set(id, root);
    }
    if (needsAudio) {
      const audioOutput = resolved.audioOutput!;
      const audioId = `${item.id}:audio`;
      audioNodes[audioId] = { kind: "use", occurrence: item.id, output: audioOutput };
      let audioRoot = audioId;
      for (const effect of item.audio!.effects) {
        audioRoot = audioEffectNode(audioNodes, audioRoot, effect, item, context, host, domain);
      }
      audioInputs.push(audioRoot);
    }
  }

  const matteRoots = new Map<string, string>();
  const resolveMatteRoot = (id: string): string => {
    const cached = matteRoots.get(id);
    if (cached !== undefined) return cached;
    const input = itemRoots.get(id);
    assert(input !== undefined, `NLE Matte content ${id} has no Picture root.`);
    const matte = matteByContent.get(id);
    if (matte === undefined) {
      matteRoots.set(id, input);
      return input;
    }
    const source = resolveMatteRoot(matte.matte);
    const content = located.get(id)!;
    const matteItem = located.get(matte.matte)!;
    const resolved = host.resolveMatte(matte, {
      project,
      track: content.track,
      content: content.item,
      matte: matteItem.item,
    });
    assertPictureOperator(resolved.operator);
    assert(resolved.operator.inputs.length === 2
      && resolved.operator.inputs.includes("content") && resolved.operator.inputs.includes("matte"),
    `NLE Matte ${matte.id} operator must expose content and matte Picture inputs.`);
    const mappings: Record<string, import("@hypit/temporal/algebra").TemporalMap> = {};
    for (const [name, control] of Object.entries(resolved.operator.temporalControls)) {
      mappings[name] = itemControlMapping(content.item, domain, control,
        `NLE Matte ${matte.id}`);
    }
    const node = `${matte.content}:matte:${matte.id}`;
    pictureNodes[node] = {
      kind: "apply",
      operator: resolved.operator,
      inputs: { content: input, matte: source },
      controlMappings: mappings,
    };
    matteRoots.set(id, node);
    return node;
  };
  for (const id of requiredPicture) resolveMatteRoot(id);

  const transitionByOutgoing = new Map(project.transitions
    .filter((transition) => requiredPicture.has(transition.outgoing) && requiredPicture.has(transition.incoming))
    .map((transition) => [transition.outgoing, transition] as const));
  const transitionByIncoming = new Map([...transitionByOutgoing.values()]
    .map((transition) => [transition.incoming, transition] as const));
  const transitionRoot = (transition: NleProject["transitions"][number]): string => {
    const outgoing = located.get(transition.outgoing)!;
    const incoming = located.get(transition.incoming)!;
    const start = incoming.item.start;
    const end = addExactTemporalValues(outgoing.item.start, outgoing.item.duration);
    const transitionDomain = sealLocalTemporalDomain({
      id: `${transition.id}:time`, duration: subtractExactTemporalValues(end, start),
    });
    const resolved = host.resolveTransition(transition, {
      project,
      track: outgoing.track,
      outgoing: outgoing.item,
      incoming: incoming.item,
      domain: transitionDomain,
    });
    assertPictureOperator(resolved.operator);
    assert(resolved.operator.inputs.length === 2
      && resolved.operator.inputs.includes("outgoing") && resolved.operator.inputs.includes("incoming"),
    `NLE Transition ${transition.id} operator must expose outgoing and incoming Picture inputs.`);
    const mappings: Record<string, import("@hypit/temporal/algebra").TemporalMap> = {};
    for (const [name, control] of Object.entries(resolved.operator.temporalControls)) {
      assert(compareExactTemporalValues(control.duration, transitionDomain.duration) === 0,
        `NLE Transition ${transition.id} Control ${name} has another duration.`);
      mappings[name] = sealTemporalMap({ stages: [{
        target: domain,
        source: control,
        pieces: [{
          target: { start: structuredClone(start), end: structuredClone(end) },
          sourceAtStart: exactTemporalZero(),
          rate: { numerator: 1, denominator: 1 },
        }],
      }] });
    }
    const applied = `${transition.id}:apply`;
    const restricted = `${transition.id}:range`;
    pictureNodes[applied] = {
      kind: "apply",
      operator: resolved.operator,
      inputs: {
        outgoing: resolveMatteRoot(transition.outgoing),
        incoming: resolveMatteRoot(transition.incoming),
      },
      controlMappings: mappings,
    };
    pictureNodes[restricted] = {
      kind: "restrict",
      input: applied,
      range: { start: structuredClone(start), end: structuredClone(end) },
    };
    return restricted;
  };

  const chainByMember = new Map<string, { readonly root: string; readonly emit: string }>();
  for (const first of paintOrder) {
    if (transitionByIncoming.has(first) || !transitionByOutgoing.has(first)) continue;
    const members: string[] = [];
    const segments: string[] = [];
    let current: string | undefined = first;
    let previous: NleProject["transitions"][number] | undefined;
    while (current !== undefined) {
      members.push(current);
      const value: NleItem = located.get(current)!.item;
      const next = transitionByOutgoing.get(current);
      const visibleStart: ExactTemporalValue = previous === undefined
        ? value.start
        : addExactTemporalValues(
          located.get(previous.outgoing)!.item.start,
          located.get(previous.outgoing)!.item.duration,
        );
      const visibleEnd: ExactTemporalValue = next === undefined
        ? addExactTemporalValues(value.start, value.duration)
        : located.get(next.incoming)!.item.start;
      assert(compareExactTemporalValues(visibleStart, visibleEnd) <= 0,
        `NLE Transition chain around Item ${current} overlaps itself.`);
      if (compareExactTemporalValues(visibleStart, visibleEnd) < 0) {
        const restricted = `${current}:transition-visible:${segments.length}`;
        pictureNodes[restricted] = {
          kind: "restrict",
          input: resolveMatteRoot(current),
          range: { start: structuredClone(visibleStart), end: structuredClone(visibleEnd) },
        };
        segments.push(restricted);
      }
      if (next === undefined) break;
      segments.push(transitionRoot(next));
      previous = next;
      current = next.incoming;
    }
    const root = `${first}:transition-chain`;
    pictureNodes[root] = { kind: "over", inputs: segments };
    const emit = members.reduce((latest, member) =>
      paintOrder.indexOf(member) > paintOrder.indexOf(latest) ? member : latest, members[0]!);
    for (const member of members) chainByMember.set(member, { root, emit });
  }

  const pictureLayers: string[] = [];
  for (const id of paintOrder) {
    const chain = chainByMember.get(id);
    if (chain !== undefined) {
      if (chain.emit === id) pictureLayers.push(chain.root);
      continue;
    }
    pictureLayers.push(resolveMatteRoot(id));
  }

  assert(pictureLayers.length > 0 || audioInputs.length > 0, "NLE Project contains no active Picture or Audio output.");
  let picture: AudiovisualProgram["picture"];
  if (pictureLayers.length === 1) picture = { nodes: pictureNodes, root: pictureLayers[0]! };
  else if (pictureLayers.length > 1) {
    pictureNodes[`${project.id}:picture-root`] = { kind: "over", inputs: pictureLayers };
    picture = { nodes: pictureNodes, root: `${project.id}:picture-root` };
  }
  let audio: AudiovisualProgram["audio"];
  if (audioInputs.length === 1) audio = { nodes: audioNodes, root: audioInputs[0]! };
  else if (audioInputs.length > 1) {
    audioNodes[`${project.id}:audio-root`] = { kind: "mix", inputs: audioInputs };
    audio = { nodes: audioNodes, root: `${project.id}:audio-root` };
  }
  const program = sealAudiovisualProgram({
    id: project.id,
    domain,
    occurrences,
    ...(picture === undefined ? {} : { pictureDomain, picture }),
    ...(audio === undefined ? {} : { audio }),
  });
  observer?.lowered(project, program);
  return program;
}

/** Useful for simple package resolvers and tests that need a pointwise one-input HTML effect. */
export function nlePointwisePictureEffect(
  id: string,
  program: PictureOperator["program"],
): PictureOperator {
  return {
    id,
    inputs: ["picture"],
    temporalControls: {},
    temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
    program,
  };
}

/** Useful for simple package resolvers that need a pointwise one-input Audio effect. */
export function nlePointwiseAudioEffect(
  id: string,
  program: AudioOperator["program"],
): AudioOperator {
  return {
    id,
    inputs: ["signal"],
    temporalControls: {},
    temporalSupport: pointwiseOperatorTemporalSupport(["signal"]),
    program,
  };
}

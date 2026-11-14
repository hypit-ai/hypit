import {
  assertAudioOperator,
  assertPictureOperator,
  assertProgramSource,
  assertSignalReconstruction,
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
import { sameType } from "@hypit/module";
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

import {
  assertNleComposition,
  assertNleProject,
  nleCompositionDuration,
  nleProjectDuration,
  resolveNlePictureAppearance,
} from "./project.js";
import { fitNlePictureContent } from "./picture.js";
import { nleTimeMappingRequiredDuration } from "./source-time.js";
import type {
  NleComposition,
  NleComponentLoweringContext,
  NleItem,
  NleLoweringHost,
  NleOperatorApplication,
  NleOperatorLoweringContext,
  NleProject,
  NleResolvedPictureAppearance,
  NleResolvedItemSource,
  NlePresentItem,
  NleTrack,
} from "./types.js";

/** Read-only observation seam for downstream compilation sessions. It is never persisted in an NLE Project. */
export type NleLoweringObserver = {
  readonly lowered: (composition: NleComposition, program: AudiovisualProgram) => void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * NLE automation is already materialized in exact Item-local time. Lowering closes that local clock to
 * one factual Programme mapping; package resolvers never publish a named occurrence/source lookup.
 */
function operatorControlMapping(
  application: NleOperatorApplication,
  start: ExactTemporalValue,
  parent: AudiovisualProgram["domain"],
  control: import("@hypit/temporal/algebra").LocalTemporalDomain,
  label: string,
): import("@hypit/temporal/algebra").TemporalMap {
  const required = nleTimeMappingRequiredDuration(application.controlTime);
  assert(compareExactTemporalValues(control.duration, required) === 0,
    `${label} Control ${control.id} has another duration.`);
  return sealTemporalMap({ stages: [{
    target: parent,
    source: control,
    pieces: application.controlTime.pieces.map((piece) => ({
      ...structuredClone(piece),
      target: {
        start: addExactTemporalValues(start, piece.target.start),
        end: addExactTemporalValues(start, piece.target.end),
      },
    })),
  }] });
}

function programmeSpace(project: NleComposition): LocalSpatialDomain {
  return sealLocalSpatialDomain({
    id: `${project.id}:picture`,
    region: { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height },
  });
}

function itemSpace(item: NleItem, appearance: NleResolvedPictureAppearance): LocalSpatialDomain {
  return sealLocalSpatialDomain({
    id: `${item.id}:picture`,
    region: { x: 0, y: 0, width: appearance.layout.width, height: appearance.layout.height },
  });
}

function fitMap(
  target: LocalSpatialDomain,
  source: LocalSpatialDomain,
  appearance: NleResolvedPictureAppearance,
): SpatialMap {
  const layout = appearance.layout;
  const sourceWidth = source.region.width;
  const sourceHeight = source.region.height;
  const content = fitNlePictureContent({ ...layout, x: 0, y: 0 }, {
    width: sourceWidth,
    height: sourceHeight,
  });
  const { x, y, width, height } = content;
  const xx = sourceWidth / width;
  const yy = sourceHeight / height;
  return sealSpatialMap({
    target,
    source,
    transform: {
      kind: "affine", xx, xy: 0, yx: 0, yy,
      tx: x === 0 ? 0 : -x * xx,
      ty: y === 0 ? 0 : -y * yy,
    },
  });
}

function placementMap(
  target: LocalSpatialDomain,
  source: LocalSpatialDomain,
  appearance: NleResolvedPictureAppearance,
): SpatialMap {
  return sealSpatialMap({
    target,
    source,
    transform: {
      kind: "affine",
      xx: 1,
      xy: 0,
      yx: 0,
      yy: 1,
      tx: -appearance.layout.x,
      ty: -appearance.layout.y,
    },
  });
}

function validateResolvedSource(value: NleResolvedItemSource, item: NlePresentItem): void {
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
  project: NleComposition,
  track: NleTrack,
  item: NlePresentItem,
  host: NleLoweringHost,
  observer?: NleLoweringObserver,
): NleResolvedItemSource {
  if (item.source === "component") {
    const media: Record<string, import("./types.js").NleResolvedMedia> = {};
    for (const [input, asset] of Object.entries(item.media ?? {})) {
      media[input] = host.resolveMedia(asset, {
        kind: "component-input",
        project,
        track,
        item,
        input,
      });
      verifyPreparedMedia(media[input]);
    }
    const context: NleComponentLoweringContext = { project, track, media };
    const value = host.resolveComponent(item, context);
    validateResolvedSource(value, item);
    return value;
  }
  if (item.source === "composition") {
    const child = lowerNleCompositionToAudiovisual(item.composition, host, observer);
    const source = audiovisualProgramSource(child);
    return {
      source,
      ...(child.picture === undefined ? {} : { pictureOutput: "picture" }),
      ...(child.audio === undefined ? {} : { audioOutput: "audio" }),
    };
  }
  const media = host.resolveMedia(item.asset, { kind: "item", project, track, item });
  verifyPreparedMedia(media);
  const source = programSourceFromPreparedMedia(media);
  const pictureOutput = source.outputs.picture === undefined ? undefined : "picture";
  return {
    source,
    ...(pictureOutput === undefined ? {} : { pictureOutput }),
    ...(source.outputs.audio === undefined ? {} : { audioOutput: "audio" }),
  };
}

function audioOperatorNode(
  nodes: Record<string, AudioNode>,
  input: string,
  application: NleOperatorApplication,
  context: NleOperatorLoweringContext,
  host: NleLoweringHost,
  parent: AudiovisualProgram["domain"],
): string {
  const resolved = host.resolveAudioOperator(application, context);
  assertAudioOperator(resolved.operator);
  assert(resolved.operator.inputs.length === 1,
    `NLE Audio Operator Application ${application.id} must expose exactly one Audio input.`);
  const port = resolved.operator.inputs[0]!;
  const mappings: Record<string, import("@hypit/temporal/algebra").TemporalMap> = {};
  for (const [name, control] of Object.entries(resolved.operator.temporalControls)) {
    mappings[name] = operatorControlMapping(application, context.scope.item.start, parent, control,
      `NLE Audio Operator Application ${application.id}`);
  }
  const id = `${context.scope.item.id}:audio-operator:${application.id}`;
  nodes[id] = {
    kind: "apply",
    operator: resolved.operator,
    inputs: { [port]: input },
    controlMappings: mappings,
  };
  return id;
}

function selection(
  item: NlePresentItem,
  source: ProgramSource,
  outputName: string,
  reconstruction?: import("@hypit/audiovisual").SignalReconstruction,
) {
  const output = source.outputs[outputName];
  assert(output !== undefined, `NLE Item ${item.id} selected missing Source output ${outputName}.`);
  if (output.kind === "constant") return { kind: "constant" as const };
  const local = sealLocalTemporalDomain({ id: `${item.id}:time`, duration: structuredClone(item.duration) });
  return { kind: "signal" as const, mapping: sealTemporalMap({ stages: [{
    target: local,
    source: output.domain,
    pieces: structuredClone(item.sourceTime.pieces),
  }] }), ...(reconstruction === undefined ? {} : { reconstruction: structuredClone(reconstruction) }) };
}

function occurrence(
  item: NlePresentItem,
  parent: AudiovisualProgram["domain"],
  source: ProgramSource,
  outputs: readonly string[],
  reconstructions: Readonly<Record<string, import("@hypit/audiovisual").SignalReconstruction>>,
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
    selections: Object.fromEntries(outputs.map((output) => [
      output,
      selection(item, source, output, reconstructions[output]),
    ])),
  });
}

function pictureOperatorNode(
  nodes: Record<string, PictureNode>,
  input: string,
  application: NleOperatorApplication,
  context: NleOperatorLoweringContext,
  host: NleLoweringHost,
  parent: AudiovisualProgram["domain"],
): string {
  const resolved = host.resolvePictureOperator(application, context);
  assertPictureOperator(resolved.operator);
  assert(resolved.operator.inputs.length === 1,
    `NLE Picture Operator Application ${application.id} must expose exactly one Picture input.`);
  const port = resolved.operator.inputs[0]!;
  const mappings: Record<string, import("@hypit/temporal/algebra").TemporalMap> = {};
  for (const [name, control] of Object.entries(resolved.operator.temporalControls)) {
    mappings[name] = operatorControlMapping(application, context.scope.item.start, parent, control,
      `NLE Picture Operator Application ${application.id}`);
  }
  const id = `${context.scope.item.id}:picture-operator:${application.id}`;
  nodes[id] = {
    kind: "apply",
    operator: resolved.operator,
    inputs: { [port]: input },
    controlMappings: mappings,
  };
  return id;
}

function lowerNleComposition(
  project: NleComposition,
  host: NleLoweringHost,
  observer?: NleLoweringObserver,
  projectEnvelope = false,
): AudiovisualProgram {
  const duration = projectEnvelope
    ? nleProjectDuration(project as NleProject)
    : nleCompositionDuration(project);
  assert(compareExactTemporalValues(duration, exactTemporalZero()) > 0,
    "NLE Project has no enabled Items to lower.");
  const domain = sealLocalTemporalDomain({ id: `${project.id}:time`, duration });
  const pictureDomain = programmeSpace(project);
  const occurrences: Record<string, Occurrence> = {};
  const pictureNodes: Record<string, PictureNode> = {};
  const audioNodes: Record<string, AudioNode> = {};
  const located = new Map<string, { readonly item: NleItem; readonly track: NleTrack }>();
  const matteByContent = new Map(project.mattes.map((matte) => [matte.content, matte] as const));
  const matteSources = new Set(project.mattes.map((matte) => matte.matte));
  const pictureOrder: string[] = [];
  const audioOrder: string[] = [];
  for (const track of project.tracks) {
    for (const item of track.items) located.set(item.id, { item, track });
    if (track.muted) continue;
    for (const item of track.items) {
      if (!item.enabled) continue;
      if (track.kind === "picture") {
        if (!matteSources.has(item.id)) pictureOrder.push(item.id);
        if (item.kind === "present" && item.audio !== undefined) audioOrder.push(item.id);
      } else {
        audioOrder.push(item.id);
      }
    }
  }
  const requiredPicture = new Set(pictureOrder.filter((id) => located.get(id)!.item.kind === "present"));
  const requireMatte = (id: string): void => {
    const matte = matteByContent.get(id);
    if (matte === undefined || requiredPicture.has(matte.matte)) return;
    requiredPicture.add(matte.matte);
    requireMatte(matte.matte);
  };
  for (const id of [...requiredPicture]) requireMatte(id);

  const requiredAudio = new Set(audioOrder.filter((id) => {
    const item = located.get(id)!.item;
    return item.kind === "present" && item.audio !== undefined;
  }));

  const itemRoots = new Map<string, string>();
  const audioItemRoots = new Map<string, string>();
  for (const [id, value] of located) {
    const needsPicture = requiredPicture.has(id);
    const needsAudio = requiredAudio.has(id);
    if (!needsPicture && !needsAudio) continue;
    const { item, track } = value;
    assert(item.kind === "present", `NLE source Item ${item.id} is not a Present.`);
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
    const reconstructions: Record<string, import("@hypit/audiovisual").SignalReconstruction> = {};
    if (needsAudio && item.audio?.reconstruction !== undefined) {
      const audioOutput = resolved.audioOutput!;
      const resolvedReconstruction = host.resolveSignalReconstruction(item.audio.reconstruction, item, context);
      assertSignalReconstruction(resolvedReconstruction.reconstruction,
        `NLE Item ${item.id} Audio reconstruction`);
      assert(sameType(resolvedReconstruction.reconstruction.signal,
        resolved.source.outputs[audioOutput]!.type),
      `NLE Item ${item.id} Audio reconstruction targets another signal Type.`);
      reconstructions[audioOutput] = resolvedReconstruction.reconstruction;
    }
    occurrences[item.id] = occurrence(item, domain, resolved.source, [...new Set(outputs)], reconstructions);

    if (needsPicture) {
      const pictureOutput = resolved.pictureOutput!;
      const appearance = resolveNlePictureAppearance(project, item.picture!);
      const use = `${item.id}:picture`;
      const fitted = `${item.id}:fitted`;
      const placed = `${item.id}:placed`;
      const localPicture = itemSpace(item, appearance);
      pictureNodes[use] = { kind: "use", occurrence: item.id, output: pictureOutput };
      pictureNodes[fitted] = {
        kind: "remap",
        input: use,
        mapping: fitMap(localPicture, resolved.source.outputs[pictureOutput]!.spatialDomain!, appearance),
      };
      let localRoot = fitted;
      for (const application of appearance.operators ?? []) {
        localRoot = pictureOperatorNode(
          pictureNodes,
          localRoot,
          application,
          {
            ...context,
            application,
            scope: { kind: "occurrence", item },
            controlDuration: nleTimeMappingRequiredDuration(application.controlTime),
          },
          host,
          domain,
        );
      }
      pictureNodes[placed] = {
        kind: "remap",
        input: localRoot,
        mapping: placementMap(pictureDomain, localPicture, appearance),
      };
      const range = `${item.id}:range`;
      pictureNodes[range] = {
        kind: "restrict",
        input: placed,
        range: {
          start: structuredClone(item.start),
          end: addExactTemporalValues(item.start, item.duration),
        },
      };
      itemRoots.set(id, range);
    }
    if (needsAudio) {
      const audioOutput = resolved.audioOutput!;
      const audioId = `${item.id}:audio`;
      audioNodes[audioId] = { kind: "use", occurrence: item.id, output: audioOutput };
      let localRoot = audioId;
      for (const application of item.audio?.operators ?? []) {
        localRoot = audioOperatorNode(
          audioNodes,
          localRoot,
          application,
          {
            ...context,
            application,
            scope: { kind: "occurrence", item },
            controlDuration: nleTimeMappingRequiredDuration(application.controlTime),
          },
          host,
          domain,
        );
      }
      const range = `${item.id}:audio-range`;
      audioNodes[range] = {
        kind: "restrict",
        input: localRoot,
        range: {
          start: structuredClone(item.start),
          end: addExactTemporalValues(item.start, item.duration),
        },
      };
      audioItemRoots.set(id, range);
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
    assert(content.item.kind === "present" && matteItem.item.kind === "present",
      `NLE Matte ${matte.id} requires Present Items.`);
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
      assert(compareExactTemporalValues(control.duration, content.item.duration) === 0,
        `NLE Matte ${matte.id} Control ${name} has another duration.`);
      mappings[name] = sealTemporalMap({ stages: [{
        target: domain,
        source: control,
        pieces: [{
          target: {
            start: structuredClone(content.item.start),
            end: addExactTemporalValues(content.item.start, content.item.duration),
          },
          sourceAtStart: exactTemporalZero(),
          rate: { numerator: 1, denominator: 1 },
        }],
      }] });
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
  const transitionRoot = (transition: NleComposition["transitions"][number]): string => {
    const outgoing = located.get(transition.outgoing)!;
    const incoming = located.get(transition.incoming)!;
    assert(outgoing.item.kind === "present" && incoming.item.kind === "present",
      `NLE Transition ${transition.id} requires Present Items.`);
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
  for (const first of pictureOrder) {
    if (located.get(first)!.item.kind !== "present") continue;
    if (transitionByIncoming.has(first) || !transitionByOutgoing.has(first)) continue;
    const members: string[] = [];
    const segments: string[] = [];
    let current: string | undefined = first;
    let previous: NleComposition["transitions"][number] | undefined;
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
      pictureOrder.indexOf(member) > pictureOrder.indexOf(latest) ? member : latest, members[0]!);
    for (const member of members) chainByMember.set(member, { root, emit });
  }

  const restrictPicture = (input: string, start: ExactTemporalValue, end: ExactTemporalValue, id: string): string => {
    pictureNodes[id] = { kind: "restrict", input, range: { start, end } };
    return id;
  };
  const restrictAudio = (input: string, start: ExactTemporalValue, end: ExactTemporalValue, id: string): string => {
    audioNodes[id] = { kind: "restrict", input, range: { start, end } };
    return id;
  };

  let pictureRoot: string | undefined;
  for (const id of pictureOrder) {
    const { item, track } = located.get(id)!;
    if (item.kind === "present") {
      const chain = chainByMember.get(id);
      if (chain !== undefined && chain.emit !== id) continue;
      const contribution = chain?.root ?? resolveMatteRoot(id);
      if (pictureRoot === undefined) pictureRoot = contribution;
      else {
        const over = `${id}:over`;
        pictureNodes[over] = { kind: "over", inputs: [pictureRoot, contribution] };
        pictureRoot = over;
      }
      continue;
    }
    const input = pictureRoot ?? `${project.id}:transparent`;
    if (pictureRoot === undefined) pictureNodes[input] = { kind: "transparent" };
    const applied = pictureOperatorNode(pictureNodes, input, item, {
      project,
      track,
      application: item,
      scope: { kind: "adjustment", item },
      controlDuration: nleTimeMappingRequiredDuration(item.controlTime),
    }, host, domain);
    const start = structuredClone(item.start);
    const end = addExactTemporalValues(item.start, item.duration);
    if (compareExactTemporalValues(start, exactTemporalZero()) === 0
      && compareExactTemporalValues(end, duration) === 0) {
      pictureRoot = applied;
      continue;
    }
    const segments: string[] = [];
    if (compareExactTemporalValues(start, exactTemporalZero()) > 0) {
      segments.push(restrictPicture(input, exactTemporalZero(), start, `${item.id}:before`));
    }
    segments.push(restrictPicture(applied, start, end, `${item.id}:active`));
    if (compareExactTemporalValues(end, duration) < 0) {
      segments.push(restrictPicture(input, end, structuredClone(duration), `${item.id}:after`));
    }
    const merged = `${item.id}:adjusted-picture`;
    pictureNodes[merged] = { kind: "over", inputs: segments };
    pictureRoot = merged;
  }

  let audioRoot: string | undefined;
  for (const id of audioOrder) {
    const { item, track } = located.get(id)!;
    if (item.kind === "present") {
      const contribution = audioItemRoots.get(id);
      if (contribution === undefined) continue;
      if (audioRoot === undefined) audioRoot = contribution;
      else {
        const mixed = `${id}:mix`;
        audioNodes[mixed] = { kind: "mix", inputs: [audioRoot, contribution] };
        audioRoot = mixed;
      }
      continue;
    }
    const input = audioRoot ?? `${project.id}:silence`;
    if (audioRoot === undefined) audioNodes[input] = { kind: "silence" };
    const applied = audioOperatorNode(audioNodes, input, item, {
      project,
      track,
      application: item,
      scope: { kind: "adjustment", item },
      controlDuration: nleTimeMappingRequiredDuration(item.controlTime),
    }, host, domain);
    const start = structuredClone(item.start);
    const end = addExactTemporalValues(item.start, item.duration);
    if (compareExactTemporalValues(start, exactTemporalZero()) === 0
      && compareExactTemporalValues(end, duration) === 0) {
      audioRoot = applied;
      continue;
    }
    const segments: string[] = [];
    if (compareExactTemporalValues(start, exactTemporalZero()) > 0) {
      segments.push(restrictAudio(input, exactTemporalZero(), start, `${item.id}:audio-before`));
    }
    segments.push(restrictAudio(applied, start, end, `${item.id}:audio-active`));
    if (compareExactTemporalValues(end, duration) < 0) {
      segments.push(restrictAudio(input, end, structuredClone(duration), `${item.id}:audio-after`));
    }
    const merged = `${item.id}:adjusted-audio`;
    audioNodes[merged] = { kind: "mix", inputs: segments };
    audioRoot = merged;
  }

  assert(pictureRoot !== undefined || audioRoot !== undefined,
    "NLE Project contains no active Picture or Audio output.");
  let picture: AudiovisualProgram["picture"];
  if (pictureRoot !== undefined) picture = { nodes: pictureNodes, root: pictureRoot };
  let audio: AudiovisualProgram["audio"];
  if (audioRoot !== undefined) audio = { nodes: audioNodes, root: audioRoot };
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

export function lowerNleCompositionToAudiovisual(
  composition: NleComposition,
  host: NleLoweringHost,
  observer?: NleLoweringObserver,
): AudiovisualProgram {
  assertNleComposition(composition);
  return lowerNleComposition(composition, host, observer);
}

/** Lower the top-level Composition while retaining Project object identity for host contexts. */
export function lowerNleProjectToAudiovisual(
  project: NleProject,
  host: NleLoweringHost,
  observer?: NleLoweringObserver,
): AudiovisualProgram {
  assertNleProject(project);
  return lowerNleComposition(project, host, observer, true);
}

/** Useful for simple package resolvers and tests that need a pointwise unary Picture Operator. */
export function nlePointwisePictureOperator(
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

/** Useful for simple package resolvers that need a pointwise unary Audio Operator. */
export function nlePointwiseAudioOperator(
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

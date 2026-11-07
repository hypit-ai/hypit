import assert from "node:assert/strict";
import test from "node:test";

import { audioGainOperator } from "@hypit/audio-gain";
import { preservePitch } from "@hypit/audio-preserve-pitch";
import { verifyAudioProgram } from "@hypit/audio-program";
import {
  audioType,
  occurrenceParentRange,
  pictureType,
  type ProgramSource,
} from "@hypit/audiovisual";
import {
  lowerAudiovisualAudioProgram,
  preparedMediaAudioSource,
} from "@hypit/audiovisual-audio";
import {
  compileAudiovisualHtmlProgram,
  visualProgramHtmlSource,
} from "@hypit/audiovisual-html";
import { programSourceFromPreparedMedia } from "@hypit/audiovisual-media";
import { assertHtmlProgram, htmlVisual } from "@hypit/html-program";
import { crossDissolveOperator } from "@hypit/picture-transition";
import { prepareMedia } from "@hypit/media";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import {
  evaluateTemporalMap,
  exactTemporalValue,
  preimageTemporalMapRegions,
  sealLocalTemporalDomain,
  sealTemporalMap,
  temporalMapPointRegionSet,
  uniqueTemporalMapRegionSetPoint,
} from "@hypit/temporal/algebra";

import {
  audiovisualAuthorOccurrenceUseEnd,
  closeAudiovisualAuthorOccurrence,
  compileAudiovisualAuthorSpec,
  createAudiovisualAuthorProgramDomain,
  bindAudiovisualAuthorOccurrenceUseToOccurrence,
  bindAudiovisualAuthorOccurrenceUseToSource,
  projectAudiovisualAuthorOccurrenceUseOutputMapping,
  projectAudiovisualAuthorOccurrenceUsePosition,
  resolveAudiovisualAuthorOccurrenceUse,
  assertAudiovisualAuthorSpec,
  type AudiovisualAuthorBindings,
  type AudiovisualAuthorSpec,
} from "../src/index.js";
import { fixtureResource } from "../../../test/fixture-resource.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});
const start = (offset = at(0)) => ({ edge: "start" as const, offset });
const end = (offset = at(0)) => ({ edge: "end" as const, offset });
const full = () => ({ from: start(), until: end() });
const sampleFrom = (sourceAt: ReturnType<typeof at>) => ({ relations: [{
  kind: "rate" as const,
  target: full(),
  targetAt: start(),
  sourceAt: start(sourceAt),
  rate: { numerator: 1, denominator: 1 },
  source: full(),
}] });
const temporalDomain = (id: string, duration: number) => sealLocalTemporalDomain({
  id, duration: at(duration),
});
const identityMap = (id: string, duration: number) => {
  const domain = temporalDomain(id, duration);
  return sealTemporalMap({ stages: [{ target: domain, source: domain, pieces: [{
    target: { start: at(0), end: at(duration) },
    sourceAtStart: at(0),
    rate: { numerator: 1, denominator: 1 },
  }] }] });
};
const pictureDomain = sealLocalSpatialDomain({
  id: "main:picture-space",
  region: { x: 0, y: 0, width: 1920, height: 1080 },
});
const aRollMedia = prepareMedia({
  id: "generated-a-roll",
  source: {
    kind: "blob",
    resource: fixtureResource("audiovisual-author:a-roll"),
    size: 1,
    mediaType: "video/mp4",
  },
  inspection: { streams: [{
    kind: "video",
    index: 0,
    codecName: "h264",
    disposition: { default: true, attachedPicture: false },
    startPts: at(0),
    endPts: at(12),
    decodedUnitCount: 360,
    width: 1920,
    height: 1080,
    sampleAspectRatio: { numerator: 1, denominator: 1 },
    rotationDegrees: 0,
    picture: {
      colorPrimaries: "bt709",
      colorTransfer: "bt709",
      colorMatrix: "bt709",
      colorRange: "limited",
      bitDepth: 8,
      alphaMode: "opaque",
    },
  }, {
    kind: "audio",
    index: 1,
    codecName: "aac",
    disposition: { default: true, attachedPicture: false },
    startPts: at(0),
    endPts: at(12),
    sampleRate: 48_000,
    channels: 2,
    decodedSampleFrames: 576_000,
  }] },
  selection: {
    videoStreamIndex: 0,
    audioStreamIndex: 1,
    spanAuthority: "video",
    picture: {
      colorPrimaries: "bt709",
      colorTransfer: "bt709",
      colorMatrix: "bt709",
      colorRange: "limited",
      bitDepth: 8,
      alphaMode: "opaque",
    },
  },
});
const source = (
  id: string,
  outputs: Readonly<Record<string, { readonly kind: "picture" | "audio"; readonly duration: number }>>,
): ProgramSource => ({
  id,
  outputs: Object.fromEntries(Object.entries(outputs).map(([name, output]) => [name, {
    kind: "signal" as const,
    type: output.kind === "picture" ? pictureType : audioType,
    domain: temporalDomain(`${id}:${name}:time`, output.duration),
    ...(output.kind === "picture" ? { spatialDomain: pictureDomain } : {}),
  }])),
});

const bindings: AudiovisualAuthorBindings = {
  sources: {
    "generated-a-roll": programSourceFromPreparedMedia(aRollMedia),
    "product-material": source("product-material", {
      picture: { kind: "picture", duration: 10 },
    }),
    "opening-component": source("opening-component", {
      picture: { kind: "picture", duration: 3 },
    }),
  },
  pictureOperators: {
    transition: crossDissolveOperator(temporalDomain("main:time", 12)),
  },
  audioOperators: {
    dialogue: audioGainOperator(1),
  },
};

const aRollToPicture = sealSpatialMap({
  target: pictureDomain,
  source: bindings.sources["generated-a-roll"]!.outputs.picture!.spatialDomain!,
  transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
});

function authorSpec(): AudiovisualAuthorSpec {
  return {
    id: "main",
    duration: at(12),
    pictureDomain,
    sources: {
      "a-roll": { binding: "generated-a-roll" },
      "b-roll": { binding: "product-material" },
      title: { binding: "opening-component" },
    },
    occurrences: {
      presenter: {
        source: "a-roll",
        at: at(0),
        outputs: { picture: {}, audio: {} },
      },
      product: {
        source: "b-roll",
        at: at(4),
        duration: at(5),
        outputs: { picture: { relation: sampleFrom(at(2)) } },
      },
      "opening-title": {
        source: "title",
        at: at(0),
        duration: at(3),
        outputs: { picture: {} },
      },
    },
    picture: {
      // These declarations intentionally reference later declarations.
      bindings: {
        transition: {
          kind: "apply",
          operator: "transition",
          inputs: {
            outgoing: { kind: "reference", name: "presenter" },
            incoming: { kind: "reference", name: "product" },
          },
          controlBindings: { progress: { kind: "program" } },
        },
        product: { kind: "use", occurrence: "product", output: "picture" },
        presenter: {
          kind: "remap",
          input: { kind: "use", occurrence: "presenter", output: "picture" },
          mapping: aRollToPicture,
        },
        title: { kind: "use", occurrence: "opening-title", output: "picture" },
      },
      output: {
        kind: "over",
        inputs: [
          { kind: "reference", name: "transition" },
          { kind: "reference", name: "title" },
        ],
      },
    },
    audio: {
      bindings: {
        voice: { kind: "use", occurrence: "presenter", output: "audio" },
      },
      output: {
        kind: "apply",
        operator: "dialogue",
        inputs: { signal: { kind: "reference", name: "voice" } },
        controlBindings: {},
      },
    },
  };
}

test("A-roll, material B-roll and a component compile into one resolved Programme", () => {
  const program = compileAudiovisualAuthorSpec(authorSpec(), bindings);

  assert.deepEqual(Object.keys(program.occurrences), ["opening-title", "presenter", "product"]);
  assert.equal(program.occurrences.presenter?.source.id, "generated-a-roll");
  assert.equal(program.occurrences.product?.source.id, "product-material");
  assert.equal(program.occurrences["opening-title"]?.source.id, "opening-component");
  assert.deepEqual(Object.values(program.occurrences).map((item) => [item.id, occurrenceParentRange(item)]), [
    ["opening-title", { start: at(0), end: at(3) }],
    ["presenter", { start: at(0), end: at(12) }],
    ["product", { start: at(4), end: at(9) }],
  ]);

  const productSelection = program.occurrences.product!.selections.picture!;
  assert.equal(productSelection.kind, "signal");
  const productMap = productSelection.mapping;
  assert.deepEqual(evaluateTemporalMap(productMap, at(0), "after")?.position, at(2));
  assert.deepEqual(evaluateTemporalMap(productMap, at(5), "before")?.position, at(7));
  const transition = Object.values(program.picture!.nodes).find((node) =>
    node.kind === "apply" && node.operator.id === "hypit.picture-transition:cross-dissolve");
  assert.deepEqual(transition, {
    kind: "apply",
    operator: crossDissolveOperator(temporalDomain("main:time", 12)),
    inputs: {
      incoming: "picture:binding:product",
      outgoing: "picture:binding:presenter",
    },
    controlMappings: { progress: identityMap("main:time", 12) },
  });
  assert.deepEqual(program.audio?.nodes["audio:output"], {
    kind: "apply",
    operator: audioGainOperator(1),
    inputs: { signal: "audio:binding:voice" },
    controlMappings: {},
  });
});

test("future graph facts close the same Programme without an AIGC or time-specific compiler path", () => {
  const spec = authorSpec();
  const product = spec.occurrences.product!;
  const transition = spec.picture!.bindings!.transition;
  assert.equal(transition?.kind, "apply");
  if (transition?.kind !== "apply") throw new Error("transition fixture is not an apply expression");
  const deferred: AudiovisualAuthorSpec = {
    ...spec,
    duration: { kind: "binding", name: "program-duration" },
    pictureDomain: { kind: "binding", name: "program-space" },
    occurrences: {
      ...spec.occurrences,
      product: {
        ...product,
        at: { kind: "binding", name: "product-at" },
        duration: { kind: "binding", name: "product-duration" },
      },
    },
    picture: {
      ...spec.picture!,
      bindings: {
        ...spec.picture!.bindings,
        transition: {
          ...transition,
          controlBindings: {
            progress: { kind: "mapping", mapping: { kind: "binding", name: "transition-map" } },
          },
        },
      },
    },
  };
  const closed = compileAudiovisualAuthorSpec(deferred, {
    ...bindings,
    values: {
      "program-duration": at(12),
      "program-space": pictureDomain,
      "product-at": at(4),
      "product-duration": at(5),
      "transition-map": identityMap("main:time", 12),
    },
  });
  const literal: AudiovisualAuthorSpec = {
    ...spec,
    picture: {
      ...spec.picture!,
      bindings: {
        ...spec.picture!.bindings,
        transition: {
          ...transition,
          controlBindings: {
            progress: { kind: "mapping", mapping: identityMap("main:time", 12) },
          },
        },
      },
    },
  };
  assert.deepEqual(closed, compileAudiovisualAuthorSpec(literal, bindings));
});

test("an author Control relation closes against the Operator-owned Control domain", () => {
  const spec = authorSpec();
  const transition = spec.picture!.bindings!.transition;
  assert.equal(transition?.kind, "apply");
  if (transition?.kind !== "apply") throw new Error("transition fixture is not an apply expression");
  const program = compileAudiovisualAuthorSpec({
    ...spec,
    picture: {
      ...spec.picture!,
      bindings: {
        ...spec.picture!.bindings,
        transition: {
          ...transition,
          controlBindings: { progress: { kind: "relation", relation: sampleFrom(at(0)) } },
        },
      },
    },
  }, bindings);
  const applied = Object.values(program.picture!.nodes).find((node) =>
    node.kind === "apply" && node.operator.id === "hypit.picture-transition:cross-dissolve");
  assert.equal(applied?.kind, "apply");
  if (applied?.kind !== "apply") throw new Error("compiled transition is missing");
  const progress = applied.controlMappings.progress;
  if (progress === undefined) throw new Error("relation did not close into a Mapping");
  assert.deepEqual(evaluateTemporalMap(progress, at(3), "after")?.position, at(3));
});

test("author-local Occurrence and Source Control bindings close without Core identities in the Spec", () => {
  const spec = authorSpec();
  const transition = spec.picture!.bindings!.transition;
  assert.equal(transition?.kind, "apply");
  if (transition?.kind !== "apply") throw new Error("transition fixture is not an apply expression");
  const withControl = (
    control: import("../src/index.js").AudiovisualAuthorControlBinding,
  ): AudiovisualAuthorSpec => ({
    ...spec,
    picture: {
      ...spec.picture!,
      bindings: {
        ...spec.picture!.bindings,
        transition: { ...transition, controlBindings: { progress: control } },
      },
    },
  });
  const occurrenceDomain = temporalDomain("main:occurrence:product:time", 5);
  const occurrenceBound = compileAudiovisualAuthorSpec(withControl({
    kind: "occurrence", occurrence: "product",
  }), {
    ...bindings,
    pictureOperators: { transition: crossDissolveOperator(occurrenceDomain) },
  });
  const occurrenceApply = Object.values(occurrenceBound.picture!.nodes).find((node) =>
    node.kind === "apply");
  assert.equal(occurrenceApply?.kind, "apply");
  if (occurrenceApply?.kind === "apply") {
    const progress = occurrenceApply.controlMappings.progress!;
    assert.deepEqual(evaluateTemporalMap(progress, at(6), "after")?.position, at(2));
  }

  const productPicture = bindings.sources["product-material"]!.outputs.picture!;
  assert.equal(productPicture.kind, "signal");
  if (productPicture.kind !== "signal") throw new Error("product Picture is not a signal");
  const sourceBound = compileAudiovisualAuthorSpec(withControl({
    kind: "source", occurrence: "product", output: "picture",
  }), {
    ...bindings,
    pictureOperators: { transition: crossDissolveOperator(productPicture.domain) },
  });
  const sourceApply = Object.values(sourceBound.picture!.nodes).find((node) => node.kind === "apply");
  assert.equal(sourceApply?.kind, "apply");
  if (sourceApply?.kind === "apply") {
    const progress = sourceApply.controlMappings.progress!;
    assert.deepEqual(evaluateTemporalMap(progress, at(6), "after")?.position, at(4));
  }
});

test("author Control bindings validate local Occurrence and selected Source output names", () => {
  const spec = authorSpec();
  const transition = spec.picture!.bindings!.transition;
  assert.equal(transition?.kind, "apply");
  if (transition?.kind !== "apply") throw new Error("transition fixture is not an apply expression");
  const withBinding = (binding: import("../src/index.js").AudiovisualAuthorControlBinding): AudiovisualAuthorSpec => ({
    ...spec,
    picture: {
      ...spec.picture!,
      bindings: {
        ...spec.picture!.bindings,
        transition: { ...transition, controlBindings: { progress: binding } },
      },
    },
  });
  assert.throws(() => assertAudiovisualAuthorSpec(withBinding({
    kind: "occurrence", occurrence: "missing",
  })), /missing Occurrence missing/u);
  assert.throws(() => assertAudiovisualAuthorSpec(withBinding({
    kind: "source", occurrence: "presenter", output: "captions",
  })), /unselected Source output captions/u);
});

test("the author intermediate layer binds reconstruction without a Clip or time special case", () => {
  const spec = authorSpec();
  const presenter = spec.occurrences.presenter!;
  const program = compileAudiovisualAuthorSpec({
    ...spec,
    occurrences: {
      ...spec.occurrences,
      presenter: {
        ...presenter,
        outputs: { ...presenter.outputs, audio: { reconstruction: "natural" } },
      },
    },
  }, {
    ...bindings,
    reconstructions: { natural: preservePitch() },
  });
  const selection = program.occurrences.presenter?.selections.audio;
  assert.equal(selection?.kind, "signal");
  if (selection?.kind === "signal") assert.deepEqual(selection.reconstruction, preservePitch());
});

test("Author declaration order does not change the resolved graph", () => {
  const original = authorSpec();
  const reversed = {
    ...original,
    sources: Object.fromEntries(Object.entries(original.sources).reverse()),
    occurrences: Object.fromEntries(Object.entries(original.occurrences).reverse()),
    picture: {
      ...original.picture!,
      bindings: Object.fromEntries(Object.entries(original.picture!.bindings!).reverse()),
    },
  };
  assert.deepEqual(
    compileAudiovisualAuthorSpec(reversed, bindings),
    compileAudiovisualAuthorSpec(original, bindings),
  );
});

test("Author linking rejects unresolved, cyclic and unused facts", () => {
  const original = authorSpec();
  assert.throws(() => compileAudiovisualAuthorSpec({
    ...original,
    occurrences: {
      ...original.occurrences,
      product: { ...original.occurrences.product!, source: "missing" },
    },
  }, bindings), /missing Source missing/u);

  assert.throws(() => compileAudiovisualAuthorSpec({
    ...original,
    picture: {
      bindings: {
        left: { kind: "reference", name: "right" },
        right: { kind: "reference", name: "left" },
      },
      output: { kind: "reference", name: "left" },
    },
  }, bindings), /cycle through left/u);

  assert.throws(() => compileAudiovisualAuthorSpec({
    ...original,
    picture: {
      ...original.picture!,
      bindings: {
        ...original.picture!.bindings,
        forgotten: { kind: "transparent" },
      },
    },
  }, bindings), /binding forgotten is unused/u);
});

test("implicit duration is exact derivation, never an audiovisual extent guess", () => {
  const mismatchedBindings: AudiovisualAuthorBindings = {
    ...bindings,
    sources: {
      ...bindings.sources,
      mismatch: source("mismatch", {
        picture: { kind: "picture", duration: 12 },
        audio: { kind: "audio", duration: 11 },
      }),
    },
  };
  const spec = authorSpec();
  assert.throws(() => compileAudiovisualAuthorSpec({
    ...spec,
    sources: { mismatch: { binding: "mismatch" } },
    occurrences: {
      mismatch: {
        source: "mismatch",
        at: at(0),
        outputs: { picture: {}, audio: {} },
      },
    },
    picture: {
      output: { kind: "use", occurrence: "mismatch", output: "picture" },
    },
    audio: {
      output: { kind: "use", occurrence: "mismatch", output: "audio" },
    },
  }, mismatchedBindings), /differently sized Source outputs/u);

  assert.throws(() => compileAudiovisualAuthorSpec({
    ...spec,
    occurrences: {
      ...spec.occurrences,
      presenter: {
        ...spec.occurrences.presenter!,
        outputs: { picture: { relation: sampleFrom(at(0)) }, audio: {} },
      },
    },
  }, bindings), /requires an explicit duration when a relation is authored/u);
});

test("constant outputs require occurrence duration and never acquire a Source Domain", () => {
  const still: ProgramSource = { id: "poster", outputs: { picture: {
    kind: "constant",
    type: pictureType,
    spatialDomain: pictureDomain,
  } } };
  const spec: AudiovisualAuthorSpec = {
    id: "constant-picture",
    duration: at(6),
    pictureDomain,
    sources: { poster: { binding: "poster" } },
    occurrences: {
      poster: { source: "poster", at: at(0), duration: at(6), outputs: { picture: {} } },
    },
    picture: { output: { kind: "use", occurrence: "poster", output: "picture" } },
  };
  const program = compileAudiovisualAuthorSpec(spec, { sources: { poster: still } });
  assert.deepEqual(program.occurrences.poster?.selections.picture, { kind: "constant" });
  const { duration: _duration, ...withoutDuration } = spec.occurrences.poster!;
  assert.throws(() => compileAudiovisualAuthorSpec({
    ...spec,
    occurrences: { poster: withoutDuration },
  }, { sources: { poster: still } }), /constant; author its occurrence duration explicitly/u);
  assert.throws(() => compileAudiovisualAuthorSpec({
    ...spec,
    occurrences: { poster: { ...spec.occurrences.poster!, outputs: { picture: { relation: sampleFrom(at(0)) } } } },
  }, { sources: { poster: still } }), /constant and cannot have a temporal relation/u);
});

test("one occurrence use publishes its end before a Programme Domain exists", () => {
  const sourceValue = source("local-video", { picture: { kind: "picture", duration: 5 } });
  const use = resolveAudiovisualAuthorOccurrenceUse({
    id: "video",
    domainId: "main:occurrence:video:time",
    outputs: { picture: {} },
  }, sourceValue, at(2), at(5), { sources: {} });
  assert.deepEqual(audiovisualAuthorOccurrenceUseEnd(use), at(7));

  const domain = createAudiovisualAuthorProgramDomain({ id: "main" },
    audiovisualAuthorOccurrenceUseEnd(use));
  const occurrence = closeAudiovisualAuthorOccurrence({ ...use, id: "video" }, domain);
  assert.deepEqual(occurrenceParentRange(occurrence), { start: at(2), end: at(7) });
  assert.throws(() => closeAudiovisualAuthorOccurrence({ ...use, id: "video" },
    createAudiovisualAuthorProgramDomain({ id: "short" }, at(6))), /outside Programme domain/u);
});

test("a following use reuses reverse, hold and loop mappings without projecting absolute anchors", () => {
  const cases = [{
    name: "reverse",
    sourceDuration: 2,
    useDuration: 2,
    relation: { relations: [{
      kind: "rate" as const,
      target: full(), targetAt: start(), sourceAt: end(),
      rate: { numerator: -1, denominator: 1 }, source: full(),
    }] },
    positions: [at(0), at(1), at(2)],
  }, {
    name: "hold",
    sourceDuration: 2,
    useDuration: 2,
    relation: { relations: [{
      kind: "rate" as const,
      target: full(), targetAt: start(), sourceAt: start(at(1)),
      rate: { numerator: 0, denominator: 1 }, source: full(),
    }] },
    positions: [at(0), at(1), at(2)],
  }, {
    name: "loop",
    sourceDuration: 2,
    useDuration: 6,
    relation: { relations: [{
      kind: "rate" as const,
      target: full(), targetAt: start(), sourceAt: start(),
      rate: { numerator: 1, denominator: 1 }, source: full(), wrap: full(),
    }] },
    positions: [at(0), at(1), at(2), at(3), at(4), at(5), at(6)],
  }] as const;

  for (const item of cases) {
    const local = temporalDomain(`media-${item.name}:time`, item.sourceDuration);
    const video: ProgramSource = { id: `video-${item.name}`, outputs: { audio: {
      kind: "signal", type: audioType, domain: local,
    } } };
    const captions: ProgramSource = { id: `captions-${item.name}`, outputs: { picture: {
      kind: "signal", type: pictureType, domain: local, spatialDomain: pictureDomain,
    } } };
    const target = resolveAudiovisualAuthorOccurrenceUse({
      id: `video-${item.name}`,
      domainId: `main:occurrence:video-${item.name}:time`,
      outputs: { audio: { relation: item.relation } },
    }, video, at(3), at(item.useDuration), { sources: {} });
    const follower = bindAudiovisualAuthorOccurrenceUseToSource({
      id: `main:occurrence:captions-${item.name}`,
      targetOutput: "audio",
      outputs: ["picture"],
    }, target, captions);
    const targetMap = target.selections.audio;
    const followerMap = follower.selections.picture;
    assert.equal(targetMap?.kind, "signal");
    assert.equal(followerMap?.kind, "signal");
    if (targetMap?.kind !== "signal" || followerMap?.kind !== "signal") throw new Error("missing signal mapping");
    for (const position of item.positions) {
      assert.deepEqual(
        evaluateTemporalMap(followerMap.mapping, position, "after"),
        evaluateTemporalMap(targetMap.mapping, position, "after"),
      );
    }
    assert.deepEqual(follower.start, target.start);
    assert.deepEqual(follower.active, target.active);
  }
});

test("occurrence-bound content shares placement while keeping occurrence-local time", () => {
  const local = temporalDomain("video-source:time", 20);
  const video: ProgramSource = { id: "video", outputs: { picture: {
    kind: "signal", type: pictureType, domain: local, spatialDomain: pictureDomain,
  } } };
  const target = resolveAudiovisualAuthorOccurrenceUse({
    id: "video", domainId: "main:occurrence:video:time", outputs: { picture: { relation: {
      relations: [{ kind: "rate", target: full(), targetAt: start(), sourceAt: end(),
        rate: { numerator: -1, denominator: 1 }, source: full() }],
    } } },
  }, video, at(12), at(20), { sources: {} });
  const title: ProgramSource = { id: "title", outputs: { picture: {
    kind: "signal", type: pictureType, domain: target.domain, spatialDomain: pictureDomain,
  } } };
  const bound = bindAudiovisualAuthorOccurrenceUseToOccurrence({
    id: "title", outputs: ["picture"],
  }, target, title);
  const selection = bound.selections.picture;
  assert.equal(selection?.kind, "signal");
  if (selection?.kind !== "signal") throw new Error("missing occurrence-bound mapping");
  assert.deepEqual(evaluateTemporalMap(selection.mapping, at(3), "after"), {
    position: at(3), sourceSide: "after",
  });
  assert.deepEqual(bound.start, target.start);
  assert.deepEqual(bound.active, target.active);
});

test("event-bound construction uses the complete source preimage before projecting placement", () => {
  const sourceDomain = temporalDomain("event-source:time", 2);
  const video: ProgramSource = { id: "event-video", outputs: { audio: {
    kind: "signal", type: audioType, domain: sourceDomain,
  } } };
  const target = resolveAudiovisualAuthorOccurrenceUse({
    id: "event-video", domainId: "event-video:occurrence-time", outputs: { audio: {} },
  }, video, at(10), at(2), { sources: {} });
  const mapping = projectAudiovisualAuthorOccurrenceUseOutputMapping({ output: "audio" }, target);
  const event = temporalMapPointRegionSet(sourceDomain, { position: at(1), side: "after" });
  const local = uniqueTemporalMapRegionSetPoint(preimageTemporalMapRegions(mapping, event));
  assert.deepEqual(projectAudiovisualAuthorOccurrenceUsePosition(target, local.position), at(11));

  const loopTarget = resolveAudiovisualAuthorOccurrenceUse({
    id: "loop-video", domainId: "loop-video:occurrence-time", outputs: { audio: { relation: {
      relations: [{ kind: "rate", target: full(), targetAt: start(), sourceAt: start(),
        rate: { numerator: 1, denominator: 1 }, source: full(), wrap: full() }],
    } } },
  }, video, at(10), at(4), { sources: {} });
  const loopMapping = projectAudiovisualAuthorOccurrenceUseOutputMapping({ output: "audio" }, loopTarget);
  assert.throws(() => uniqueTemporalMapRegionSetPoint(preimageTemporalMapRegions(loopMapping, event)),
    /2 regions/u);
});

test("the authored Programme enters the existing Picture and Audio terminal seams", () => {
  const program = compileAudiovisualAuthorSpec(authorSpec(), bindings);
  const picture = compileAudiovisualHtmlProgram(program, {
    sources: Object.keys(bindings.sources).map((id) => visualProgramHtmlSource(
      id,
      "picture",
      htmlVisual({
        html: `<div data-author-source="${id}"></div>`,
        css: ":scope>div{position:absolute;inset:0}",
      }),
    )),
  }, {
    id: "authored-picture",
    sampling: { frameRate: { numerator: 1, denominator: 1 } },
    canvas: { width: 1920, height: 1080, clearColor: "#000000" },
    pictureMapping: sealSpatialMap({ target: pictureDomain, source: pictureDomain, transform: {
      kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0,
    } }),
  });
  assert.doesNotThrow(() => assertHtmlProgram(picture));
  assert.match(picture.html, /generated-a-roll/u);
  assert.match(picture.html, /product-material/u);

  const audio = lowerAudiovisualAudioProgram({
    program,
    sampling: { sampleRate: 48_000 },
    sources: { sources: [preparedMediaAudioSource(aRollMedia, { sampleRate: 48_000 })] },
  });
  assert.doesNotThrow(() => verifyAudioProgram(audio));
  assert.equal(audio.graph.nodes.some((node) => node.kind === "process"), true);
});

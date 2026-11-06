import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthorDeclarationCompiler,
  AuthorDeclarationRegistry,
  AuthorStructureDeclarationNode,
  AuthorStructureFieldNode,
} from "@hypit/author";
import { AuthorDeclarationRegistry as DeclarationRegistry } from "@hypit/author";
import { audiovisualTypes } from "@hypit/audiovisual";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { exactTemporalValue } from "@hypit/temporal/algebra";

import {
  declarationsFromSvmlDocument,
  decodeSvmlDeclarations,
  parseSvmlDocument,
  printSvmlDocument,
  svmlStructureFrontend,
} from "../src/index.js";
import { planMoveAudiovisualOccurrence } from "../../audiovisual-author/src/index.js";
import { audiovisualProgramAuthorDeclaration } from "../../audiovisual-author/src/index.js";
import {
  canvasViewAuthorDeclaration,
  planAddCanvasViewItem,
  projectCanvasView,
} from "../../canvas-view/src/index.js";
import { nleViewAuthorDeclaration, planMoveNleLaneItem, projectNleView } from "../../nle-view/src/index.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sourceText = `// Packages stay independent of the SVML grammar.
module media from "@hypit/media@1"
module image from "@example/image@1"
module video from "@hypit/audiovisual-author@1"
module nle from "@hypit/nle-view@1"
module canvas from "@hypit/canvas-view@1"

media.Asset "product" {
  from: "./product.png"
}

image.Generate "hero" {
  prompt: "A presenter holding the product"
  reference: @product
}

video.Program "main" {
  duration: 12s

  source "hero" {
    value: @hero
  }

  occurrence "presenter" {
    source: @source.hero
    at: 0s
    outputs: { picture: {}, audio: {} }
  }
}

nle.View "timeline" {
  programme: @main

  lane "picture" {
    label: "Picture"
    items: [@main.occurrence.presenter.picture]
  }
}

canvas.View "creation" {
  item "hero" {
    subject: @hero
    layout: { x: 80, y: 120 }
  }
}
`;

function source(text = sourceText) {
  return { id: "/project/main.svml", name: "main.svml", bytes: encoder.encode(text) };
}

function declaration(
  document: Awaited<ReturnType<typeof svmlStructureFrontend.openStructure>>,
  label: string,
): AuthorStructureDeclarationNode {
  const value = document.nodes.find((node): node is AuthorStructureDeclarationNode =>
    node.kind === "declaration" && node.label === label);
  assert(value !== undefined);
  return value;
}

test("SVML Block parses without package grammar and prints untouched bytes exactly", () => {
  const parsed = parseSvmlDocument(source());
  assert.equal(printSvmlDocument(parsed), sourceText);
  assert.equal(parsed.declarations.length, 5);
  assert.deepEqual(parsed.declarations.map((item) => item.label), ["product", "hero", "main", "timeline", "creation"]);

  const authored = declarationsFromSvmlDocument(parsed);
  assert.equal(authored[2]?.module.name, "@hypit/audiovisual-author");
  assert.equal(authored[2]?.label, "main");
  assert.deepEqual(authored[2]?.children.map((child) => [child.name, child.label]), [
    ["source", "hero"],
    ["occurrence", "presenter"],
  ]);
});
test("raw literal replacement remains parseable and locally indented", async () => {
  const text = `module note from "@example/note@1"

note.Text "brief" {
  value: <<PROMPT
first line
second line
  PROMPT
}
`;
  const document = await svmlStructureFrontend.openStructure(source(text));
  const brief = declaration(document, "brief");
  const valueField = document.containers.find((candidate) => candidate.container === brief.fields)!.items
    .map((id) => document.nodes.find((candidate) => candidate.node === id))
    .find((item): item is AuthorStructureFieldNode => item?.kind === "field" && item.name === "value")!;
  const edited = await svmlStructureFrontend.applyStructureOperations(document, [{
    kind: "replace",
    node: valueField.value,
    value: { kind: "literal", value: "updated\nbody\n", style: "raw" },
  }]);
  const candidate = decoder.decode(edited.bytes);
  assert.match(candidate, /value: <<SVML\nupdated\nbody\n  SVML/u);
  assert.equal(printSvmlDocument(parseSvmlDocument(edited)), candidate);
});

test("one NLE move replaces only the occurrence time value", async () => {
  const document = await svmlStructureFrontend.openStructure(source());
  const occurrence = declaration(document, "presenter");
  const edited = await svmlStructureFrontend.applyStructureOperations(
    document,
    planMoveAudiovisualOccurrence(document, occurrence.node, "5s"),
  );
  const text = decoder.decode(edited.bytes);
  assert.match(text, /occurrence "presenter" \{[\s\S]*?at: 5s/u);
  assert.match(text, /prompt: "A presenter holding the product"/u);
  assert.match(text, /layout: \{ x: 80, y: 120 \}/u);
});

test("Canvas Add Image writes an independent root subject and an owned View item atomically", async () => {
  const document = await svmlStructureFrontend.openStructure(source());
  const canvas = declaration(document, "creation");
  const edited = await svmlStructureFrontend.applyStructureOperations(document, [
    {
      kind: "insert",
      container: document.declarations,
      value: {
        kind: "declaration",
        module: { name: "@hypit/media", version: "1" },
        name: "Asset",
        label: "detail",
        fields: [{
          kind: "field",
          name: "from",
          value: { kind: "literal", value: "./detail.png", style: "quoted" },
        }],
        children: [],
      },
    },
    ...planAddCanvasViewItem(document, canvas.node, { id: "detail", subject: "detail", x: 360, y: 120 }),
  ]);
  const text = decoder.decode(edited.bytes);
  const reparsed = parseSvmlDocument(edited);
  assert.equal(reparsed.declarations.some((item) => item.moduleAlias === "media" && item.label === "detail"), true);
  const canvasSyntax = reparsed.declarations.find((item) => item.label === "creation");
  assert.equal(canvasSyntax?.children.some((item) => item.label === "detail"), true);
  assert.match(text, /media\.Asset "detail" \{\n  from: "\.\/detail\.png"\n\}/u);
  assert.match(text, /item "detail" \{\n    subject: @detail/u);

  const reopened = await svmlStructureFrontend.openStructure(edited);
  const projectedCanvas = projectCanvasView(reopened, declaration(reopened, "creation").node);
  assert.deepEqual(projectedCanvas.items.map((item) => [item.id, item.subject, item.x, item.y]), [
    ["hero", "hero", 80, 120],
    ["detail", "detail", 360, 120],
  ]);
  const projectedNle = projectNleView(reopened, declaration(reopened, "timeline").node);
  assert.deepEqual(projectedNle, {
    id: "timeline",
    programme: "main",
    lanes: [{ id: "picture", label: "Picture", items: ["main.occurrence.presenter.picture"] }],
  });
});

test("moving a lane item changes only View membership and preserves valid list syntax", async () => {
  const text = sourceText.replace(
    `  lane "picture" {
    label: "Picture"
    items: [@main.occurrence.presenter.picture]
  }`,
    `  lane "picture" {
    label: "Picture"
    items: [@main.occurrence.presenter.picture, @main.occurrence.presenter.audio]
  }

  lane "audio" {
    label: "Audio"
    items: []
  }`,
  );
  const document = await svmlStructureFrontend.openStructure(source(text));
  const timeline = declaration(document, "timeline");
  const children = document.containers.find((candidate) => candidate.container === timeline.children)!;
  const lanes = children.items.map((id) => document.nodes.find((candidate) => candidate.node === id))
    .filter((item): item is AuthorStructureDeclarationNode => item?.kind === "declaration");
  const picture = lanes.find((item) => item.label === "picture")!;
  const audio = lanes.find((item) => item.label === "audio")!;
  const itemsField = document.containers.find((candidate) => candidate.container === picture.fields)!.items
    .map((id) => document.nodes.find((candidate) => candidate.node === id))
    .find((item): item is AuthorStructureFieldNode => item?.kind === "field" && item.name === "items")!;
  const list = document.nodes.find((item) => item.node === itemsField.value && item.kind === "list");
  assert(list?.kind === "list");
  const itemNodes = document.containers.find((candidate) => candidate.container === list.items)!.items;
  const edited = await svmlStructureFrontend.applyStructureOperations(
    document,
    planMoveNleLaneItem(document, itemNodes[1]!, audio.node),
  );
  const reopened = await svmlStructureFrontend.openStructure(edited);
  assert.deepEqual(projectNleView(reopened, declaration(reopened, "timeline").node).lanes, [
    { id: "picture", label: "Picture", items: ["main.occurrence.presenter.picture"] },
    { id: "audio", label: "Audio", items: ["main.occurrence.presenter.audio"] },
  ]);
});

test("SVML Program declarations compile through package-owned semantics into AuthorGraph inputs", async () => {
  const fixtureModule = { name: "@example/source", version: "1" } as const;
  const sourceCompiler: AuthorDeclarationCompiler = {
    module: fixtureModule,
    declaration: "Source",
    outputs: [audiovisualTypes.programSource],
    shape: { summary: "Provides one fixture Source.", label: "required", fields: [] },
    bindings(declaration) {
      return [{ name: declaration.label!, ref: { kind: "record", id: declaration.label! },
        type: audiovisualTypes.programSource }];
    },
    compile({ declaration }) {
      return { records: [{ id: declaration.label!, type: audiovisualTypes.programSource,
        value: {}, range: declaration.range }], components: [] };
    },
  };
  const pictureOperatorCompiler: AuthorDeclarationCompiler = {
    module: fixtureModule,
    declaration: "PictureOperator",
    outputs: [audiovisualTypes.pictureOperator],
    shape: { summary: "Provides one fixture Picture Operator.", label: "required", fields: [] },
    bindings(declaration) {
      return [{ name: declaration.label!, ref: { kind: "record", id: declaration.label! },
        type: audiovisualTypes.pictureOperator }];
    },
    compile({ declaration }) {
      return { records: [{ id: declaration.label!, type: audiovisualTypes.pictureOperator,
        value: {}, range: declaration.range }], components: [] };
    },
  };
  const exactCompiler: AuthorDeclarationCompiler = {
    module: fixtureModule,
    declaration: "Exact",
    outputs: [temporalTypes.exactValue],
    shape: {
      summary: "Provides one exact future value fixture.",
      label: "required",
      fields: [{ name: "seconds", kind: "literal", required: true, summary: "Sets fixture seconds." }],
    },
    bindings(declaration) {
      return [{ name: declaration.label!, ref: { kind: "record", id: declaration.label! },
        type: temporalTypes.exactValue }];
    },
    compile({ declaration }) {
      const seconds = declaration.fields[0]?.value;
      assert(seconds?.kind === "literal");
      return { records: [{ id: declaration.label!, type: temporalTypes.exactValue,
        value: exactTemporalValue({ numerator: BigInt(seconds.value), denominator: 1n }),
        range: declaration.range }], components: [] };
    },
  };
  const typedFixture = (declarationName: string, type: import("@hypit/protocol").TypeRef): AuthorDeclarationCompiler => ({
    module: fixtureModule,
    declaration: declarationName,
    outputs: [type],
    shape: { summary: `Provides one ${declarationName} fixture.`, label: "required", fields: [] },
    bindings(declaration) {
      return [{ name: declaration.label!, ref: { kind: "record", id: declaration.label! }, type }];
    },
    compile({ declaration }) {
      return { records: [{ id: declaration.label!, type, value: {}, range: declaration.range }], components: [] };
    },
  });
  const temporalMapCompiler = typedFixture("TemporalMap", temporalTypes.map);
  const spatialMapCompiler = typedFixture("SpatialMap", spatialTypes.map);
  const reconstructionCompiler = typedFixture("Reconstruction", audiovisualTypes.signalReconstruction);
  const compilers: AuthorDeclarationRegistry = new DeclarationRegistry();
  compilers.register(sourceCompiler);
  compilers.register(pictureOperatorCompiler);
  compilers.register(exactCompiler);
  compilers.register(temporalMapCompiler);
  compilers.register(spatialMapCompiler);
  compilers.register(reconstructionCompiler);
  compilers.register(audiovisualProgramAuthorDeclaration);
  compilers.register(nleViewAuthorDeclaration);
  compilers.register(canvasViewAuthorDeclaration);
  const text = `module fixture from "@example/source@1"
module video from "@hypit/audiovisual-author@1"
module nle from "@hypit/nle-view@1"
module canvas from "@hypit/canvas-view@1"

fixture.Source "generated" {}
fixture.PictureOperator "transition" {}
fixture.Exact "program-duration" { seconds: 12 }
fixture.Exact "presenter-at" { seconds: 0 }
fixture.TemporalMap "control-map" {}
fixture.SpatialMap "picture-map" {}
fixture.Reconstruction "natural" {}

video.Program "main" {
  duration: @program-duration
  picture-domain: { width: 1920px, height: 1080px }

  source "a-roll" {
    value: @generated
  }

  occurrence "presenter" {
    source: @source.a-roll
    at: @presenter-at
    duration: 10s
    outputs: {
      picture: { relation: { kind: fit } },
      audio: { reconstruction: @natural }
    }
  }

  picture "presenter" {
    use: @occurrence.presenter.picture
  }

  picture "trimmed" {
    input: @picture.presenter
    restrict: { from: 0s, until: 10s }
  }

  picture "cropped" {
    input: @picture.trimmed
    crop: { x: 0px, y: 0px, width: 1920px, height: 1080px }
  }

  picture "mapped" {
    input: @picture.cropped
    remap: @picture-map
  }

  picture "final" {
    apply: @transition
    inputs: { picture: @picture.mapped }
    controls: { progress: @control-map }
  }

  audio "voice" {
    use: @occurrence.presenter.audio
  }

  output {
    picture: @picture.final
    audio: @audio.voice
  }
}

nle.View "timeline" {
  programme: @main
  lane "picture" {
    label: "Picture"
    items: [@main.occurrence.presenter.picture]
  }
}

canvas.View "creation" {
  scope: [@generated, @main]
  item "generated" {
    subject: @generated
    layout: { x: 80, y: 120 }
  }
}
`;
  const decoded = await decodeSvmlDeclarations(source(text), {
    compilers,
    resolveAsset: () => { throw new Error("unused"); },
  });
  assert.deepEqual(decoded.exports.map((item) => item.name), [
    "control-map", "generated", "main", "natural", "picture-map",
    "presenter-at", "program-duration", "transition",
  ]);
  const component = decoded.components.find((item) => item.id === "main:program");
  assert(component !== undefined);
  assert.equal(component.outputs.program, "main");
  assert.equal(component.fragment.exports[0]?.type.name, "AudiovisualProgram");
  assert.deepEqual(Object.keys(component.inputs).sort(), [
    "domain",
    "occurrence-0001",
    "picture-operator-0001",
    "picture-operator-binding-0001",
    "spatial-map-0001",
    "spatial-map-binding-0001",
    "spec",
    "temporal-map-0001",
    "temporal-map-binding-0001",
  ]);
  const spec = decoded.records.find((item) => item.id === "main:spec");
  assert.equal((spec?.value as { id?: string }).id, "main");
  assert.deepEqual((spec?.value as { duration?: unknown }).duration,
    { kind: "binding", name: "main:duration" });
  assert.deepEqual((spec?.value as { occurrences?: Record<string, { at?: unknown }> }).occurrences?.presenter?.at,
    { kind: "binding", name: "main:occurrence:presenter:at" });
  const specValue = spec?.value as {
    occurrences?: Record<string, { outputs?: Record<string, {
      relation?: { relations?: Array<{ kind?: string }> };
      reconstruction?: string;
    }> }>;
    picture?: { bindings?: Record<string, { kind?: string; mapping?: unknown; controlBindings?: unknown }> };
  };
  assert.equal(specValue.occurrences?.presenter?.outputs?.picture?.relation?.relations?.[0]?.kind, "fit");
  assert.equal(specValue.occurrences?.presenter?.outputs?.audio?.reconstruction,
    "main:occurrence:presenter:audio:reconstruction");
  assert.equal(specValue.picture?.bindings?.trimmed?.kind, "restrict");
  assert.equal(specValue.picture?.bindings?.cropped?.kind, "crop");
  assert.deepEqual(specValue.picture?.bindings?.mapped?.mapping,
    { kind: "binding", name: "main:picture:mapped:mapping" });
  assert.deepEqual(specValue.picture?.bindings?.final?.controlBindings,
    { progress: { kind: "mapping", mapping: {
      kind: "binding", name: "main:picture:final:control:progress:mapping",
    } } });
  const withoutViews = text.slice(0, text.indexOf("\nnle.View"));
  const semanticOnly = await decodeSvmlDeclarations(source(withoutViews), {
    compilers,
    resolveAsset: () => { throw new Error("unused"); },
  });
  assert.deepEqual(semanticOnly.records, decoded.records);
  assert.deepEqual(semanticOnly.components, decoded.components);
});


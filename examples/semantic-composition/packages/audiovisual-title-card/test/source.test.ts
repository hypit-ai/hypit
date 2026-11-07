import assert from "node:assert/strict";
import test from "node:test";

import {
  audiovisualManifest,
} from "@hypit/audiovisual";
import {
  audiovisualAuthorManifest,
  audiovisualAuthorProducers,
  audiovisualAuthorTypes,
  compileAudiovisualAuthorSpec,
  createAudiovisualProgramDomainFragment,
  createOccurrenceClosureFragment,
  createOccurrenceUseFragment,
  createResolvedAudiovisualProgramFragment,
} from "@hypit/audiovisual-author";
import type { AudiovisualAuthorSpec } from "@hypit/audiovisual-author";
import { compileAudiovisualHtmlProgram } from "@hypit/audiovisual-html";
import {
  createNleTerminalLinkHostFromFacets,
  lowerNleProjectToHtmlProgram,
} from "../../../../../packages/html-video/src/index.js";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
} from "@hypit/author";
import {
  createResolvedClosure,
  link,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import { canonicalize } from "@hypit/protocol";
import {
  applyNleTransaction,
  commitNleEdit,
  createComponentMaterialization,
  createNleAuthoringHostFromFacets,
  createNleEditSession,
  createNleProject,
  findNleItem,
  undoNleEdit,
} from "@hypit/nle";
import { spatialManifest } from "@hypit/spatial";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import { exactTemporalValue, temporalManifest, temporalTypes } from "@hypit/temporal";

import {
  titleCardHtmlSource,
  titleCardComponent,
  titleCardManifest,
  titleCardNleSymbol,
  titleCardProducers,
  titleCardProgramSource,
  titleCardSourceFragment,
  titleCardTypes,
} from "../src/index.js";
import type { TitleCardSpec } from "../src/index.js";
import { hypitPackage as titleCardHypitPackage } from "../src/activation.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});

const title: TitleCardSpec = {
  id: "project-opening-title",
  duration: at(3),
  width: 1280,
  height: 720,
  title: "A component is a Source",
  subtitle: "not a Track kind",
  background: "#172033",
  foreground: "#f4f7ff",
};

const parentSpace = sealLocalSpatialDomain({
  id: "main:picture-space",
  region: { x: 0, y: 0, width: 1280, height: 720 },
});

function authorSpec(): AudiovisualAuthorSpec {
  const source = titleCardProgramSource(title);
  return {
    id: "main",
    duration: at(3),
    pictureDomain: parentSpace,
    sources: { title: { binding: "title" } },
    occurrences: {
      opening: { source: "title", at: at(0), outputs: { picture: {} } },
    },
    picture: { output: {
      kind: "remap",
      input: { kind: "use", occurrence: "opening", output: "picture" },
      mapping: sealSpatialMap({
        target: parentSpace,
        source: source.outputs.picture!.spatialDomain!,
        transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
      }),
    } },
  };
}

test("a project component Producer publishes an ordinary finite ProgramSource", async () => {
  const producer = titleCardComponent.producers.find((candidate) =>
    candidate.producer.name === titleCardProducers.source.name)!;
  const result = await producer.handler({
    inputs: { spec: { value: canonicalize(title) } },
  } as never);
  assert.equal(result.kind, "output");
  assert.deepEqual(result.value, titleCardProgramSource(title));

  const htmlProducer = titleCardComponent.producers.find((candidate) =>
    candidate.producer.name === titleCardProducers.htmlSource.name)!;
  const htmlResult = await htmlProducer.handler({
    inputs: { spec: { value: canonicalize(title) } },
  } as never);
  assert.equal(htmlResult.kind, "output");
  assert.deepEqual(htmlResult.value, titleCardHtmlSource(title));
});

test("the installed project package resolves a materialized NLE Component", () => {
  const empty = createNleProject({
    id: "component-editorial", name: "Component editorial",
    frameRate: { numerator: 1, denominator: 1 },
    canvas: { width: 1280, height: 720, clearColor: "#000000" },
  });
  const withTrack = applyNleTransaction(empty, { revision: 0, commands: [{
    kind: "track.add", track: {
      id: "main", name: "Main", kind: "picture", locked: false, muted: false, items: [],
    },
  }] });
  const project = applyNleTransaction(withTrack, createComponentMaterialization(withTrack, {
    id: "opening", track: "main", component: titleCardNleSymbol,
    parameters: {
      title: "A materialized Component", subtitle: "resolved by its project package",
      background: "#172033", foreground: "#f4f7ff",
    },
    atFrame: 0, durationFrames: 2,
  }));
  const html = lowerNleProjectToHtmlProgram(project,
    createNleTerminalLinkHostFromFacets(titleCardHypitPackage.facets));
  assert.match(html.html, /A materialized Component/u);
  assert.match(html.html, /resolved by its project package/u);

  const authoring = createNleAuthoringHostFromFacets(titleCardHypitPackage.facets);
  assert.deepEqual(authoring.inspectComponentParameters(project, "opening"), {
    background: "#172033",
    foreground: "#f4f7ff",
    subtitle: "resolved by its project package",
    title: "A materialized Component",
  });
  const transaction = authoring.planComponentParameterEdit(project, "opening", {
    kind: "set-title",
    value: "Edited by its package",
  });
  let session = createNleEditSession(project);
  session = commitNleEdit(session, { label: "Edit title", transaction });
  const editedHtml = lowerNleProjectToHtmlProgram(session.current,
    createNleTerminalLinkHostFromFacets(titleCardHypitPackage.facets));
  assert.match(editedHtml.html, /Edited by its package/u);
  const editedItem = findNleItem(session.current, "opening").item;
  if (editedItem.kind !== "component") throw new Error("Title Card Item changed kind.");
  assert.deepEqual(editedItem.parameters, {
    background: "#172033",
    foreground: "#f4f7ff",
    subtitle: "resolved by its project package",
    title: "Edited by its package",
  });
  session = undoNleEdit(session);
  const restoredItem = findNleItem(session.current, "opening").item;
  if (restoredItem.kind !== "component") throw new Error("Restored Title Card Item changed kind.");
  assert.equal((restoredItem.parameters as { readonly title: string }).title, "A materialized Component");
  assert.throws(() => authoring.planComponentParameterEdit(project, "opening", {
    kind: "set-colors", background: "black", foreground: "#ffffff",
  }), /six-digit hex color/u);
});

test("the project component enters AVIR by Occurrence and explicit spatial Mapping", () => {
  const source = titleCardProgramSource(title);
  const program = compileAudiovisualAuthorSpec(authorSpec(), {
    sources: { title: source },
  });
  assert.equal(program.occurrences.opening?.source.id, title.id);
  assert.notEqual(source.outputs.picture?.spatialDomain?.id, program.pictureDomain?.id);

  const html = compileAudiovisualHtmlProgram(program, { sources: [titleCardHtmlSource(title)] }, {
    id: "project-title-program",
    sampling: { frameRate: { numerator: 1, denominator: 1 } },
    canvas: { width: 1280, height: 720, clearColor: "#000000" },
    pictureMapping: sealSpatialMap({
      target: parentSpace,
      source: parentSpace,
      transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
    }),
  });
  assert.match(html.html, /A component is a Source/u);
  assert.match(html.html, /not a Track kind/u);
});

test("the project component Source is an ordinary typed AuthorGraph branch", () => {
  const closure = createResolvedClosure([
    temporalManifest,
    spatialManifest,
    audiovisualManifest,
    audiovisualAuthorManifest,
    titleCardManifest,
  ]);
  const linked = link(closure, [{
    id: "title:spec",
    type: titleCardTypes.spec,
    value: canonicalize(title),
  }, {
    id: "main:spec",
    type: audiovisualAuthorTypes.spec,
    value: canonicalize(authorSpec()),
  }, {
    id: "main:opening:use-spec",
    type: audiovisualAuthorTypes.occurrenceUseSpec,
    value: canonicalize({ id: "opening", domainId: "main:opening:time",
      outputs: { picture: {} } }),
  }, {
    id: "main:opening:start",
    type: temporalTypes.exactValue,
    value: canonicalize(at(0)),
  }, {
    id: "main:domain-spec",
    type: audiovisualAuthorTypes.programDomainSpec,
    value: canonicalize({ id: "main" }),
  }, {
    id: "main:duration",
    type: temporalTypes.exactValue,
    value: canonicalize(at(3)),
  }]);
  const source = bindAuthorFragment(elaborateGraphFragment(linked, titleCardSourceFragment, {
    id: "title-card",
    inputs: { spec: { kind: "record", id: "title:spec" } },
  }), { source: "title.source" });
  const use = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceUseFragment({ inferDuration: true }), {
      id: "main-opening-use",
      inputs: {
        spec: { kind: "record", id: "main:opening:use-spec" },
        source: { kind: "logical-output", id: "title.source" },
        start: { kind: "record", id: "main:opening:start" },
      },
    }), { use: "main.opening.use", end: "main.opening.end" });
  const domain = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualProgramDomainFragment(), {
      id: "main-domain",
      inputs: {
        spec: { kind: "record", id: "main:domain-spec" },
        duration: { kind: "record", id: "main:duration" },
      },
    }), { domain: "main.domain" });
  const occurrence = bindAuthorFragment(elaborateGraphFragment(linked,
    createOccurrenceClosureFragment(), {
      id: "main-opening-close",
      inputs: {
        use: { kind: "logical-output", id: "main.opening.use" },
        parent: { kind: "logical-output", id: "main.domain" },
      },
    }), { occurrence: "main.opening.occurrence" });
  const author = bindAuthorFragment(elaborateGraphFragment(linked,
    createResolvedAudiovisualProgramFragment({ occurrences: 1 }), {
      id: "main-program",
      inputs: {
        spec: { kind: "record", id: "main:spec" },
        domain: { kind: "logical-output", id: "main.domain" },
        "occurrence-0001": { kind: "logical-output", id: "main.opening.occurrence" },
      },
    }), { program: "main.program" });
  const graph = sealAuthorGraph(mergeFragmentContributions(
    { outputs: [], operations: [] }, source, use, domain, occurrence, author,
  ));
  const plan = planBuild(linked, graph, ["main.program"]).plan;
  assert.deepEqual(plan.steps.map((step) => step.producer.name).sort(), [
    titleCardProducers.source.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.inferOccurrenceDuration.name,
    audiovisualAuthorProducers.resolveOccurrenceUse.name,
    audiovisualAuthorProducers.createProgramDomain.name,
    audiovisualAuthorProducers.closeOccurrence.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.createOccurrences.name,
    audiovisualAuthorProducers.appendOccurrence.name,
    audiovisualAuthorProducers.closeResolvedProgram.name,
  ].sort());
});

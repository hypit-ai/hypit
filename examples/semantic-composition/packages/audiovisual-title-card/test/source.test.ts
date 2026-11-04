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
  createAudiovisualAuthorFragment,
} from "@hypit/audiovisual-author";
import type { AudiovisualAuthorSpec } from "@hypit/audiovisual-author";
import { compileAudiovisualHtmlProgram } from "@hypit/audiovisual-html";
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
import { spatialManifest } from "@hypit/spatial";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import { exactTemporalValue, temporalManifest } from "@hypit/temporal";

import {
  titleCardHtmlSource,
  titleCardComponent,
  titleCardManifest,
  titleCardProducers,
  titleCardProgramSource,
  titleCardSourceFragment,
  titleCardTypes,
} from "../src/index.js";
import type { TitleCardSpec } from "../src/index.js";

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
    id: "main:title-binding",
    type: audiovisualAuthorTypes.sourceBinding,
    value: canonicalize({ name: "title" }),
  }]);
  const source = bindAuthorFragment(elaborateGraphFragment(linked, titleCardSourceFragment, {
    id: "title-card",
    inputs: { spec: { kind: "record", id: "title:spec" } },
  }), { source: "title.source" });
  const author = bindAuthorFragment(elaborateGraphFragment(linked,
    createAudiovisualAuthorFragment({ sources: 1 }), {
      id: "main",
      inputs: {
        spec: { kind: "record", id: "main:spec" },
        "binding-0001": { kind: "record", id: "main:title-binding" },
        "source-0001": { kind: "logical-output", id: "title.source" },
      },
    }), { program: "main.program" });
  const graph = sealAuthorGraph(mergeFragmentContributions(
    { outputs: [], operations: [] }, source, author,
  ));
  const plan = planBuild(linked, graph, ["main.program"]).plan;
  assert.deepEqual(plan.steps.map((step) => step.producer.name).sort(), [
    titleCardProducers.source.name,
    audiovisualAuthorProducers.createBindings.name,
    audiovisualAuthorProducers.appendSource.name,
    audiovisualAuthorProducers.closeProgram.name,
  ].sort());
});

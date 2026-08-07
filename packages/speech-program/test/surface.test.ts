import assert from "node:assert/strict";
import test from "node:test";

import { artifactDependency, artifactTypes } from "@svml/artifact";
import { registerTypeValidatorFacets } from "@svml/component-kit";
import {
  contractTypes,
  videoContractDependencies,
  videoContractManifests,
} from "@svml/contracts";
import { createResolvedClosure, digestOf, sealBuildRequest, start } from "@svml/core";
import {
  AuthorFrontendRegistry,
  compileSourceClosure,
  resolveCompiledSourceExport,
} from "@svml/elaborator";
import type { AuthorSourceUnit } from "@svml/elaborator";
import {
  mediaPipelineComponent,
  mediaPipelineManifest,
  mediaPipelineProducers,
} from "@svml/media-pipeline";
import type { ModuleManifest } from "@svml/protocol";
import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "@svml/script";
import { speechTakeManifest, speechTakeProducers } from "@svml/speech-take";
import {
  decodeSpeechSpineSurface,
  speechProgramManifest,
  speechProgramModuleRef,
  speechProgramProducers,
  speechSpineSurfaceImplementationDigest,
} from "@svml/speech-program";
import {
  TextSurfaceRegistry,
  createTextAuthorFrontend,
} from "@svml/text";
import { createRecordAdmitter, TypeValidatorRegistry } from "@svml/validation";

const fixtureModule = { name: "example.speech-media", version: "1" } as const;
const fixtureSurfaceDigest = digestOf("example.speech-media/surface@1");
const fixtureManifest: ModuleManifest = {
  format: "svml.module@0",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [artifactDependency, videoContractDependencies.media],
  types: [], capabilities: [], producers: [],
  surfaces: [{
    name: "media", tag: "Media", mode: "structured", outputs: [artifactTypes.blob],
    implementation: { kind: "trusted-frontend-surface", locator: "example.speech-media/surface", digest: fixtureSurfaceDigest },
  }],
};

function source(text: string): AuthorSourceUnit {
  return {
    id: "/project/main.svml",
    name: "main.svml",
    text: `<?svml using="@svml/text@1"?>\n${text}`,
  };
}

test("Speech Spine lowers ordered Takes into media normalization, one audio plan and peer projections", async () => {
  const closure = createResolvedClosure([
    ...videoContractManifests,
    mediaPipelineManifest,
    speechTakeManifest,
    speechProgramManifest,
    scriptManifest,
    fixtureManifest,
  ]);
  const surfaces = new TextSurfaceRegistry();
  surfaces.registerRaw(scriptModuleRef, "script", scriptSurfaceImplementationDigest, decodeScriptSurface);
  surfaces.registerStructured(speechProgramModuleRef, "spine", speechSpineSurfaceImplementationDigest, decodeSpeechSpineSurface);
  surfaces.registerStructured(fixtureModule, "media", fixtureSurfaceDigest, ({ element }) => ({
    records: ["take-one", "take-two"].map((id) => ({
      id, type: artifactTypes.blob,
      value: { kind: "blob" as const, digest: digestOf(id), size: 128, mediaType: "video/mp4" },
      range: element.range,
    })),
    components: [], fragments: [],
  }));
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createTextAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      if (request.from.startsWith("@svml/script")) return scriptModuleRef;
      if (request.from.startsWith("@svml/speech")) return speechProgramModuleRef;
      return fixtureModule;
    },
  }));
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, mediaPipelineComponent.validators ?? []);
  const compiled = await compileSourceClosure({
    entry: source(`<svml>
      <import from="@svml/script@1"/>
      <import as="fixture" from="example.speech-media@1"/>
      <import as="speech" from="@svml/speech@1"/>
      <script id="story">
        <opening><ALICE> Hello from Alice.</opening>
        <answer><BOB> Hello from Bob.</answer>
      </script>
      <fixture:Media/>
      <speech:Spine id="speech">
        <speech:Take source={take-one} segment={story.segment.opening}/>
        <speech:Take source={take-two} segment={story.segment.answer}/>
      </speech:Spine>
    </svml>`),
    closure,
    frontends,
    admitRecord: createRecordAdmitter(validators),
    resolveSource() { throw new Error("fixture has no source imports"); },
  });
  const target = resolveCompiledSourceExport(compiled, "speech.visual", contractTypes.visualTrack);
  const build = start(compiled.program, compiled.elaboration.graph, sealBuildRequest({
    graph: compiled.elaboration.graph.id,
    targets: [{ output: target.ref.kind === "logical-output" ? target.ref.id : "", accepts: "exact" }],
    satisfactions: [],
  }));
  const names = build.plan.steps.map((step) => step.producer.name);
  assert.equal(names.filter((name) => name === mediaPipelineProducers.inspect.name).length, 2);
  assert.equal(names.filter((name) => name === mediaPipelineProducers.normalize.name).length, 2);
  assert.equal(names.filter((name) => name === speechProgramProducers.appendTake.name).length, 2);
  assert.equal(names.filter((name) => name === speechProgramProducers.compileAudio.name).length, 1);
  assert.equal(names.filter((name) => name === mediaPipelineProducers.renderAudio.name).length, 1);
  assert.equal(names.filter((name) => name === speechTakeProducers.projectVisual.name).length, 1);
});

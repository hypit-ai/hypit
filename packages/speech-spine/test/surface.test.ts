import { artifactDependency } from "@narratage/artifact";
import { videoContractManifests } from "../../test-support/video-domain.js";
import { registerTypeValidatorFacets } from "@narratage/component-kit";
import { mediaDependency } from "@narratage/media";
import { compositionTypes } from "@narratage/composition";
import { artifactTypes } from "@narratage/artifact";
import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure, digestOf, sealBuildRequest, start } from "@narratage/core";
import {
  AuthorFrontendRegistry,
  compileSourceClosure,
  resolveCompiledSourceExport,
} from "@narratage/elaborator";
import type { AuthorSourceUnit } from "@narratage/elaborator";
import {
  mediaPipelineComponent,
  mediaPipelineManifest,
  mediaPipelineProducers,
} from "@narratage/media-pipeline";
import type { ModuleManifest } from "@narratage/protocol";
import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "@narratage/script";
import { speechBasisManifest, speechBasisProducers } from "@narratage/speech-basis";
import {
  decodeSpeechSpineSurface,
  speechSpineManifest,
  speechSpineModuleRef,
  speechSpineProducers,
  speechSpineSurfaceImplementationDigest,
} from "@narratage/speech-spine";
import {
  TextSurfaceRegistry,
  createTextAuthorFrontend,
} from "@narratage/text";
import { createRecordAdmitter, TypeValidatorRegistry } from "@narratage/validation";

const fixtureModule = { name: "example.speech-media", version: "1" } as const;
const fixtureSurfaceDigest = digestOf("example.speech-media/surface@1");
const fixtureManifest: ModuleManifest = {
  format: "svml.module@1",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [artifactDependency, mediaDependency],
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
    text: `<?svml using="@narratage/text@1"?>\n${text}`,
  };
}

test("Speech Spine lowers ordered Takes into media normalization, one audio plan and peer projections", async () => {
  const closure = createResolvedClosure([
    ...videoContractManifests,
    mediaPipelineManifest,
    speechBasisManifest,
    speechSpineManifest,
    scriptManifest,
    fixtureManifest,
  ]);
  const surfaces = new TextSurfaceRegistry();
  surfaces.registerRaw(scriptModuleRef, "script", scriptSurfaceImplementationDigest, decodeScriptSurface);
  surfaces.registerStructured(speechSpineModuleRef, "spine", speechSpineSurfaceImplementationDigest, decodeSpeechSpineSurface);
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
      if (request.from.startsWith("@narratage/script")) return scriptModuleRef;
      if (request.from.startsWith("@narratage/speech")) return speechSpineModuleRef;
      return fixtureModule;
    },
  }));
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, mediaPipelineComponent.validators ?? []);
  const compiled = await compileSourceClosure({
    entry: source(`<svml>
      <import from="@narratage/script@1"/>
      <import as="fixture" from="example.speech-media@1"/>
      <import as="speech" from="@narratage/speech-spine@1"/>
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
  const target = resolveCompiledSourceExport(compiled, "speech.visual", compositionTypes.visualTrack);
  const build = start(compiled.program, compiled.elaboration.graph, sealBuildRequest({
    graph: compiled.elaboration.graph.id,
    targets: [{ output: target.ref.kind === "logical-output" ? target.ref.id : "", accepts: "exact" }],
    satisfactions: [],
  }));
  const names = build.plan.steps.map((step) => step.producer.name);
  assert.equal(names.filter((name) => name === mediaPipelineProducers.inspect.name).length, 2);
  assert.equal(names.filter((name) => name === mediaPipelineProducers.normalize.name).length, 2);
  assert.equal(names.filter((name) => name === speechSpineProducers.appendTake.name).length, 2);
  assert.equal(names.filter((name) => name === speechSpineProducers.compileAudio.name).length, 1);
  assert.equal(names.filter((name) => name === mediaPipelineProducers.renderAudio.name).length, 1);
  assert.equal(names.filter((name) => name === speechBasisProducers.projectVisual.name).length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { blobTypes } from "@hypit/blob";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { mediaTypes } from "@hypit/media";
import { recipeType } from "@hypit/recipe";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import { visualTrackModuleRef, visualTrackTypes } from "../src/index.js";
import { hypitPackage as visualTransitionPackage } from "../../visual-transition/src/activation.js";
import { visualTransitionModuleRef } from "../../visual-transition/src/index.js";

test("Visual Track declarations own source, time, space and motion independently of Markup", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  installAuthorDeclarationFacets(visualTransitionPackage.facets, compilers);
  installMarkupDeclarationFacets(visualTransitionPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [{
      id: "treatment",
      type: recipeType,
      value: { path: "portrait", properties: { clip: "frame", "frame-paint": "#111111" } },
    }],
    exports: [
      { name: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline },
      { name: "outgoing", ref: { kind: "record", id: "outgoing" }, type: temporalTypes.window },
      { name: "incoming", ref: { kind: "record", id: "incoming" }, type: temporalTypes.window },
      { name: "frame", ref: { kind: "record", id: "frame" }, type: spatialTypes.frame },
      { name: "image", ref: { kind: "record", id: "image" }, type: blobTypes.blob },
      { name: "extent", ref: { kind: "record", id: "extent" }, type: spatialTypes.extent },
      { name: "media", ref: { kind: "record", id: "media" }, type: mediaTypes.prepared },
      { name: "treatment", ref: { kind: "record", id: "treatment" }, type: recipeType },
    ],
  };
  const decoded = await decodeMarkupDeclarations({
    name: "visual.svml",
    text: `<svml>
      <import from="@hypit/visual-track@1" as="visual"/>
      <import from="@hypit/visual-transition@1" as="transition"/>
      <import source="facts.svml" as="facts"/>
      <transition:CrossDissolve id="soft-mix" easing="ease-in-out"/>
      <visual:Track id="picture" timeline={facts.timeline}>
        <visual:Clip id="video" media={facts.media} during={facts.outgoing} frame={facts.frame}
          treatment={facts.treatment} motion={push} fit="cover">
          <visual:Curve source-at-start="start" source-control-1="start+250ms"
            source-control-2="end-250ms" source-at-end="end"/>
          <visual:Sampling at="start" zoom="1"/>
          <visual:Sampling at="end" zoom="1.1"/>
        </visual:Clip>
        <visual:Clip id="still" image={facts.image} picture="srgb" extent={facts.extent} during={facts.incoming} frame={facts.frame}/>
        <visual:Transition id="video-to-still" outgoing="video" incoming="still" effect={soft-mix}/>
      </visual:Track>
      <visual:Motion id="push">
        <visual:Pose at="start" scale="1.05"/>
        <visual:Pose at="end" scale="1"/>
      </visual:Motion>
    </svml>`,
  }, {
    resolveModule: (request) => request.from.startsWith(visualTransitionModuleRef.name)
      ? visualTransitionModuleRef : visualTrackModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.exports.map((value) => value.name), ["picture.program", "picture.visual", "push", "soft-mix"]);
  assert.equal(decoded.records.filter((record) => record.type.name === visualTrackTypes.clipSpec.name).length, 2);
  assert.equal(decoded.records.filter((record) => record.type.name === visualTrackTypes.transitionEffect.name).length, 1);
  assert.equal(decoded.records.filter((record) => record.type.name === visualTrackTypes.transitionSpec.name).length, 1);
  assert.equal(decoded.records.some((record) => record.type.name === visualTrackTypes.motion.name), true);
  const visual = decoded.components.find((component) => component.id === "picture");
  const clip = decoded.records.find((record) => record.type.name === visualTrackTypes.sampleLayerSpec.name
    && (record.value as { sampling?: unknown }).sampling !== undefined);
  assert.deepEqual((clip?.value as { sampling?: { relations?: readonly { kind: string }[] } }).sampling
    ?.relations?.map((relation) => relation.kind), ["cubic"]);
  assert.deepEqual(visual?.inputs["clip-0001-motion"], { kind: "record", id: "push" });
  assert.deepEqual(visual?.inputs["clip-0001-window"], { kind: "record", id: "outgoing" });
  assert.deepEqual(visual?.inputs["clip-0002-window"], { kind: "record", id: "incoming" });
  assert.deepEqual(visual?.inputs["transition-0001-spec"], { kind: "record", id: "picture.transition.0001.spec" });
});

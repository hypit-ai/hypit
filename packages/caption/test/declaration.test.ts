import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorEditPlannerRegistry,
  planAuthorActionInvocation,
  type AuthorResolvedReference,
} from "@hypit/author";
import { audiovisualTypes } from "@hypit/audiovisual";
import { nleProjectedActionInvocation } from "@hypit/nle-view";
import { temporalTypes } from "@hypit/temporal";

import { compileSvmlDeclaration } from "../../../test/compile-svml-declaration.js";
import {
  captionComponentEditPlanner,
  captionComponentDeclaration,
  captionModuleRef,
  captionTypes,
  captionUnitEventDeclaration,
} from "../src/index.js";

const reference = (id: string, type: AuthorResolvedReference["type"]): AuthorResolvedReference => ({
  ref: { kind: "record", id }, type,
});

test("Caption declarations keep selections inside freely repeatable component instances", async () => {
  const references = new Map<string, AuthorResolvedReference>([
    ["document", reference("document", captionTypes.document)],
    ["timing", reference("timing", captionTypes.timing)],
    ["style", reference("style", captionTypes.style)],
    ["host-style", reference("host-style", captionTypes.style)],
    ["impact-style", reference("impact-style", captionTypes.style)],
  ]);
  const component = await compileSvmlDeclaration({
    module: captionModuleRef, alias: "caption", compilers: [captionComponentDeclaration], references,
    source: `caption.Component "captions" {
  document: @document
  timing: @timing
  style: @style
  selection: { cues: [cue-one, cue-three] }
  width: 1920px
  height: 1080px
  override "host" {
    roles: [HOST]
    style: @host-style
  }
  override "mute-middle" {
    cues: [cue-two]
    hidden: true
  }
  override "impact-ending" {
    cues: [cue-three]
    style: @impact-style
  }
}
caption.Component "secondary-captions" {
  document: @document
  timing: @timing
  style: @style
  selection: { units: [unit-two] }
  width: 1920px
  height: 1080px
}`,
  });
  assert.equal(component.components.length, 2);
  assert.equal(component.exports.length, 6);
  assert.equal(component.exports[0]?.type.name, audiovisualTypes.programSource.name);
  assert.deepEqual(component.records.filter((record) => record.type.name === captionTypes.componentSpec.name)
    .map((record) => (record.value as { selection: unknown }).selection), [
    { kind: "cues", ids: ["cue-one", "cue-three"] },
    { kind: "units", ids: ["unit-two"] },
  ]);
  assert.deepEqual(component.records.filter((record) => record.type.name === captionTypes.presentationOverrideSpec.name)
    .map((record) => record.value), [
    { id: "host", selector: { roles: ["HOST"] } },
    { id: "mute-middle", selector: { cues: ["cue-two"] } },
    { id: "impact-ending", selector: { cues: ["cue-three"] } },
  ]);
  assert.deepEqual(component.components[0]?.fragment.operations.map((operation) => operation.producer.name), [
    "create-presentation", "append-style-override", "append-hidden-override",
    "append-style-override", "schedule-presentation", "caption-source",
  ]);
  const event = await compileSvmlDeclaration({
    module: captionModuleRef, alias: "caption", compilers: [captionUnitEventDeclaration], references,
    source: `caption.UnitEvent "important" {
  timing: @timing
  unit: unit-two
  edge: start
}`,
  });
  assert.equal(event.exports[0]?.type.name, temporalTypes.regionSet.name);
});

test("Caption NLE edits append owner rules instead of creating Cue declarations", async () => {
  const { svmlStructureFrontend } = await import("../../svml/src/index.js");
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const opened = await svmlStructureFrontend.openStructure({
    id: "/caption.svml", name: "caption.svml", bytes: encoder.encode(`module caption from "@hypit/caption@1"

caption.Component "captions" {
  document: @document
  timing: @timing
  style: @style
  selection: all
  width: 1920px
  height: 1080px
}
`),
  });
  const owner = opened.nodes.find((node) => node.kind === "declaration" && node.label === "captions");
  assert(owner?.kind === "declaration");
  const registry = new AuthorEditPlannerRegistry();
  registry.register(captionComponentEditPlanner);
  const operations = planAuthorActionInvocation(registry, opened, nleProjectedActionInvocation({
    id: "hide", label: "Hide",
    authority: { module: captionModuleRef, declaration: "Component", action: "hide-cues",
      subject: { source: "/caption.svml", node: owner.node } },
    preset: { cues: ["cue-two"] },
  }, { id: "mute-middle" }));
  const edited = await svmlStructureFrontend.applyStructureOperations(opened, operations);
  const text = decoder.decode(edited.bytes);
  assert.match(text, /override "mute-middle" \{\s+cues: \[cue-two\]\s+hidden: true\s+\}/u);
  assert.equal((text.match(/caption\.Component/gu) ?? []).length, 1);
});

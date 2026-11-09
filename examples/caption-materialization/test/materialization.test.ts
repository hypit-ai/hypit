import assert from "node:assert/strict";
import test from "node:test";

import { assertCaptionCuePayload } from "@hypit/caption";

import { buildCaptionMaterializationExample } from "../compose.js";

test("one Script materializes complete editable Karaoke Caption Items over three A-rolls", async () => {
  const { project } = await buildCaptionMaterializationExample();
  const picture = project.tracks.find((track) => track.id === "picture")!;
  const captions = project.tracks.find((track) => track.id === "captions")!;
  assert.equal(picture.items.length, 3);
  assert.equal(captions.items.length, 9);

  const styleIds: string[] = [];
  const disabled: string[] = [];
  for (const item of captions.items) {
    assert.equal(item.kind, "component");
    if (item.kind !== "component") continue;
    const parameters = item.parameters as Record<string, unknown>;
    assertCaptionCuePayload(parameters.caption, item.duration);
    assert(parameters.caption.words.length > 0);
    assert(parameters.caption.units.length > 0);
    const styleRef = item.bindings?.find((binding) => binding.slot === "style")?.ref;
    assert.equal(typeof styleRef, "string");
    const style = project.componentValues.find((value) => value.id === styleRef);
    assert.notEqual(style, undefined);
    assert.equal((style!.value as Record<string, unknown>).karaoke === undefined, false);
    styleIds.push(style!.id.replace(/^caption-style:/u, ""));
    if (!item.enabled) disabled.push(parameters.caption.cueId);
  }
  assert.deepEqual(styleIds.toSorted(), [
    "alice", "alice", "alice", "base", "base", "bob", "bob", "bob", "warning",
  ]);
  assert.equal(disabled.length, 1);
  assert.equal(project.pictureLayouts.length, 1);
  assert.equal(project.componentValues.length, 4);

  const serialized = JSON.stringify(project);
  assert.doesNotMatch(serialized, /TimedTranscript|Narrative|selection\.|moment\./u);
  assert.match(serialized, /"mode":"trail"/u);
  assert.match(serialized, /"enabled":false/u);
});

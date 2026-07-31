import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileSource } from "../src/compiler.js";
import type { SourceElement } from "../src/model.js";

const example = fileURLToPath(new URL("../examples/flat-track-launch/flat-track-launch.svml", import.meta.url));

function elements(nodes: SourceElement["children"], name: string): SourceElement[] {
  return nodes.filter((node): node is SourceElement => node.kind === "element" && node.name === name);
}

test("the flat Track launch fixture closes the complete v1 compilation contract", async () => {
  const compilation = await compileSource({ file: example });

  assert.equal(compilation.located.durationFrames, 1083);
  assert.equal(
    compilation.narrative.semanticIndex.anchors.length,
    compilation.narrative.tokens.length * 2 + compilation.narrative.segments.length * 2,
  );
  assert.equal(compilation.located.selections.emphasis?.ranges.length, 2);
  assert.equal(compilation.target.width, 1080);
  assert.equal(compilation.target.height, 1920);

  const arroll = compilation.plan.instances.find((instance) => instance.id === "aroll");
  const item = elements(arroll?.children ?? [], "item")[0];
  const openingLeft = elements(item?.children ?? [], "present")
    .find((present) => present.attributes.id === "opening-left");
  assert.equal(openingLeft?.attributes.shape, "circle");
  assert.equal(openingLeft?.attributes.width, 0.3);

  const overlays = compilation.plan.instances.find((instance) => instance.id === "overlays");
  const title = elements(overlays?.children ?? [], "item")
    .find((candidate) => candidate.attributes.id === "opening-title");
  assert.equal(title?.attributes.size, 64);
  assert.equal(title?.attributes.color, "#FFFFFF");

  const broll = compilation.projections.get("broll");
  const productVisual = broll?.visuals?.find((fragment) => fragment.id.includes(":product-demo:"));
  const productAudio = broll?.audios?.find((fragment) => fragment.id.includes(":product-demo:"));
  assert.equal(productAudio?.playbackRate, productVisual?.playbackRate);
  assert.equal(productVisual?.muted, true);
  assert.equal(broll?.audios?.some((fragment) => fragment.bus === "sfx"), true);

  const board = compilation.projections.get("ranking")?.visuals
    ?.find((fragment) => fragment.id === "ranking:board");
  assert.equal(board?.startFrame, compilation.located.moments.ranking?.frames[0]);

  const text = compilation.projections.get("overlays")?.visuals ?? [];
  assert.deepEqual(
    text.map((fragment) => [fragment.id, fragment.startFrame, fragment.endFrameExclusive]),
    [
      ["overlays:opening-title:0", 0, 90],
      ["overlays:ending-arrow:0", 1023, 1083],
    ],
  );

  const captions = compilation.projections.get("captions")?.visuals ?? [];
  assert.ok(captions.some((fragment) => /#FDE047/u.test(fragment.html ?? "")));
  assert.ok(captions.some((fragment) => /scale\(1\.08\)/u.test(fragment.html ?? "")));
  assert.match(compilation.html, /data-composition-id="launch"/u);
});

import assert from "node:assert/strict";
import test from "node:test";

import { HTML_VISUAL_FORMAT, type HtmlVisual } from "@hypit/html-program";
import { canonicalize } from "@hypit/protocol";
import { createNleLoweringHostFromFacets } from "@hypit/nle";

import {
  pictureMatteComponent,
  pictureMatteEffect,
  pictureMatteOperator,
  pictureMatteProducers,
  pictureMatteNleSymbol,
} from "../src/index.js";
import { hypitPackage as pictureMatteHypitPackage } from "../src/activation.js";

test("Picture Matte publishes one explicit two-Picture process contract", () => {
  for (const channel of ["alpha", "luminance"] as const) for (const invert of [false, true]) {
    const effect = pictureMatteEffect(channel, invert);
    assert.deepEqual(effect.inputs, ["content", "matte"]);
    assert.equal(effect.program.format, HTML_VISUAL_FORMAT);
    const visual = effect.program.payload as unknown as HtmlVisual;
    assert.equal(visual.html.match(/\{\{content\}\}/gu)?.length, 1);
    assert.equal(visual.html.match(/\{\{matte\}\}/gu)?.length, 1);
    assert.deepEqual(visual.data, { channel, invert });
    assert.match(visual.setup!, /data-hypit-matte-canvas/u);
  }
});

test("Picture Matte rejects an unknown channel instead of guessing", () => {
  assert.throws(() => pictureMatteEffect("red" as "alpha"), /channel red is invalid/u);
});

test("Picture Matte publishes its package-owned Picture Operator through a typed Producer", async () => {
  const producer = pictureMatteComponent.producers.find((candidate) =>
    candidate.producer.name === pictureMatteProducers.operator.name)!;
  for (const spec of [
    { channel: "alpha", invert: false },
    { channel: "luminance", invert: true },
  ] as const) {
    const result = await producer.handler({ inputs: { spec: { value: canonicalize(spec) } } } as never);
    assert.equal(result.kind, "output");
    assert.deepEqual(result.value, pictureMatteOperator(spec.channel, spec.invert));
    assert.deepEqual((result.value as unknown as { inputs: string[] }).inputs, ["content", "matte"]);
  }
});

test("the package resolves a direct NLE Matte relation", () => {
  const spec = { channel: "luminance", invert: true } as const;
  const resolved = createNleLoweringHostFromFacets(pictureMatteHypitPackage.facets).resolveMatte({
    id: "key", content: "content", matte: "mask",
    operator: pictureMatteNleSymbol, parameters: canonicalize(spec),
  }, {} as never);
  assert.deepEqual(resolved, { operator: pictureMatteOperator("luminance", true) });
});

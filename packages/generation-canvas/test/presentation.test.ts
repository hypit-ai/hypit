import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationCanvasPresentationFacet,
  createGenerationCanvasPresentationHost,
  generationCanvasPresentationPackagesFromFacets,
} from "../src/index.js";

const using = { module: { name: "@example/image" }, name: "create" } as const;

test("packages contribute finite Canvas meaning without contributing markup or CSS", () => {
  const presentation = {
    using,
    displayName: "Example Image",
    role: "image" as const,
    summaryInput: "prompt",
    modelLabel: "Example v1",
    modelGroup: "example-image",
    authoring: {
      controls: [{ id: "prompt", label: "Prompt", placement: "primary" as const },
        { id: "aspectRatio", label: "Aspect ratio", placement: "compact" as const }],
      ports: [{ id: "images", label: "Reference images" }],
    },
  };
  const facet = createGenerationCanvasPresentationFacet({ nodes: [presentation] });
  const host = createGenerationCanvasPresentationHost(generationCanvasPresentationPackagesFromFacets([facet]));
  assert.deepEqual(host.resolve({ id: "hero", using, inputs: {} }), {
    using,
    displayName: "Example Image",
    role: "image",
    summaryInput: "prompt",
    modelLabel: "Example v1",
    modelGroup: "example-image",
    authoring: {
      controls: [{ id: "prompt", label: "Prompt", placement: "primary" },
        { id: "aspectRatio", label: "Aspect ratio", placement: "compact" }],
      ports: [{ id: "images", label: "Reference images" }],
    },
  });
  assert.deepEqual(host.list(), [presentation]);
  assert.throws(() => createGenerationCanvasPresentationHost([
    facet.implementation,
    facet.implementation,
  ]), /multiple presentations/u);
  const { modelLabel: _modelLabel, ...presentationWithoutModelLabel } = presentation;
  assert.throws(() => createGenerationCanvasPresentationFacet({
    nodes: [presentationWithoutModelLabel],
  }), /model group requires a model label/u);
  assert.throws(() => createGenerationCanvasPresentationFacet({
    nodes: [{ ...presentation, authoring: { controls: [{ id: "aspectRatio", label: "" }] } }],
  }), /is empty/u);
});

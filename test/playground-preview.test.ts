import assert from "node:assert/strict";
import test from "node:test";

import { assertHyperframesDocument, compileHyperframesDocument } from "@narratage/hyperframes";
import { sealComposition } from "@narratage/composition";
import { sealProgramSpace } from "@narratage/program-space";

import { REGISTRY, matchRecipe } from "../tools/playground/src/registry/index.js";
import { registerArtifact } from "../tools/playground/src/preview/artifacts.js";

/**
 * Every adapter, through the whole compiler path it will run in the browser.
 *
 * The playground has no schema validator by design — the packages' own seal and
 * assert functions are the judge. That makes this the test that matters: if an
 * adapter's defaults cannot reach a legal HyperFrames document here, the
 * playground cannot show it there.
 */

const programSpace = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 4,
  frameRate: { numerator: 30, denominator: 1 },
});
const canvas = { width: 1080, height: 1920, clearColor: "#09090b" };

/** A named Artifact with no bytes — enough to build with, not to draw. */
const VIDEO = registerArtifact({
  digest: `sha256:${"a1".repeat(32)}`,
  size: 1024,
  mediaType: "video/mp4",
  durationSec: 4,
} as Parameters<typeof registerArtifact>[0]);

/**
 * Fills in whatever media a component needs.
 *
 * Components that draw supplied footage contribute nothing until they have
 * some — an empty picker is not an error — so their defaults have to be
 * completed before there is a document to judge.
 */
function withMedia(content: unknown): unknown {
  const bag = structuredClone(content) as Record<string, unknown>;
  for (const value of Object.values(bag)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value as Record<string, unknown>[]) {
      if ("media" in entry) entry["media"] = VIDEO.digest;
    }
  }
  return bag;
}

for (const component of REGISTRY) {
  test(`${component.id} compiles its defaults into a legal document`, () => {
    const { parameters, content } = component.defaults();
    const tracks = component.build({
      parameters,
      content: withMedia(content) as typeof content,
      programSpace,
      canvas,
    });
    assert.ok(tracks.length > 0, "an adapter must contribute at least one Track");
    const document = compileHyperframesDocument(sealComposition({
      contract: "svml.composition@1",
      id: component.id,
      canvas,
      tracks,
    }), programSpace);
    assert.doesNotThrow(() => assertHyperframesDocument(document));
    assert.match(document.html, /class="clip svml-visual-present"/u);
  });

  test(`${component.id} survives a duration shorter than its content`, () => {
    // Dragging the duration down must clamp spans, not throw: the Presents an
    // adapter derives from seconds would otherwise fall outside the program.
    const short = sealProgramSpace({
      contract: "svml.program-space@1",
      durationSec: 0.5,
      frameRate: { numerator: 30, denominator: 1 },
    });
    const { parameters, content } = component.defaults();
    assert.doesNotThrow(() => {
      compileHyperframesDocument(sealComposition({
        contract: "svml.composition@1",
        id: component.id,
        canvas,
        tracks: component.build({
          parameters,
          content: withMedia(content) as typeof content,
          programSpace: short,
          canvas,
        }),
      }), short);
    });
  });

  test(`${component.id} draws nothing rather than failing before its media arrives`, () => {
    // An empty picker is a state to pass through, not an error to report.
    const { parameters, content } = component.defaults();
    assert.doesNotThrow(() => component.build({ parameters, content, programSpace, canvas }));
  });
}

test("a Recipe is matched by its exact property key set, not its path prefix", () => {
  const caption = REGISTRY.find((component) => component.id === "caption")!;
  const properties = Object.fromEntries((caption.recipeKeys ?? []).map((key) => [key, "0"]));
  assert.equal(matchRecipe(properties)?.id, "caption");

  // caption.short-cues shares the prefix and is a different shape entirely.
  assert.equal(matchRecipe({ model: "x", "max-words": 6, "max-lines": 2 }), undefined);
  // A near miss is a miss: one extra key means a different contract.
  assert.equal(matchRecipe({ ...properties, extra: 1 }), undefined);
});

test("filling from a Recipe leaves no parameter unset", () => {
  // The bug this catches is a Recipe key that gains a mapping in the schema but
  // not in fromRecipe, which would silently hand the form an undefined field.
  for (const component of REGISTRY) {
    if (component.recipeKeys === undefined) continue;
    assert.equal(typeof component.fromRecipe, "function",
      `${component.id} declares recipeKeys so it must accept a Recipe`);
    const properties = Object.fromEntries(component.recipeKeys.map((key) => [key, "0"]));
    const filled = component.fromRecipe!(properties) as Record<string, unknown>;
    const declared = component.parameters.kind === "object"
      ? Object.keys(component.parameters.fields)
      : [];
    for (const name of declared) {
      assert.notEqual(filled[name], undefined,
        `${component.id}.fromRecipe left ${name} unset`);
    }
  }
});

/** Verbatim from examples/talking-film-golden/studio.svs. */
const GOLDEN: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  caption: {
    "stack-order": "70", x: "0.08", y: "0.76", width: "0.84",
    font: "inter-semibold", weight: "600", size: "58", "line-height": "0.96",
    align: "center", fill: "#FFFFFF", background: "#09090BCC",
    padding: "16 24", radius: "18",
  },
  "text-track": {
    "stack-order": "90", x: "0.08", y: "0.12", width: "0.84", height: "0.2",
    font: "inter-black", weight: "800", size: "96", tracking: "-2",
    align: "left", fill: "#FFFFFF",
  },
};

test("a real Recipe renders through the component it describes", () => {
  for (const [id, properties] of Object.entries(GOLDEN)) {
    const component = REGISTRY.find((entry) => entry.id === id)!;
    assert.deepEqual(
      Object.keys(properties).sort(),
      [...(component.recipeKeys ?? [])].sort(),
      `the ${id} fixture must carry exactly the Recipe's keys`,
    );
    assert.equal(matchRecipe(properties)?.id, id);
    const document = compileHyperframesDocument(sealComposition({
      contract: "svml.composition@1",
      id,
      canvas,
      tracks: component.build({
        parameters: component.fromRecipe!(properties),
        content: component.defaults().content,
        programSpace,
        canvas,
      }),
    }), programSpace);
    assert.doesNotThrow(() => assertHyperframesDocument(document));
  }
});

test("padding carries y first, and one value covers both axes", () => {
  const caption = REGISTRY.find((entry) => entry.id === "caption")!;
  const of = (padding: string) => caption.fromRecipe!({
    ...GOLDEN["caption"]!, padding,
  }) as Record<string, unknown>;
  assert.deepEqual([of("16 24")["paddingY"], of("16 24")["paddingX"]], [16, 24]);
  assert.deepEqual([of("12")["paddingY"], of("12")["paddingX"]], [12, 12]);
});

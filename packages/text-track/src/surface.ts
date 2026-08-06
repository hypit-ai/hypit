import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";
import { svsRecipeType } from "@svml/svs";
import type { SvsRecipe } from "@svml/svs";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference, TextAttributeValue } from "@svml/text";

import { textTrackProducers, textTrackTypes } from "./manifest.js";
import { sealTextTrackSpec } from "./program.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

const textTrackSurfaceFragment = sealGraphFragment({
  name: "@svml/text-track/track-surface@1",
  inputs: [
    { name: "space", type: contractTypes.programSpace },
    { name: "spec", type: textTrackTypes.spec },
  ],
  operations: [
    { id: "text:compile", producer: textTrackProducers.compile, inputs: { space: input("space"), spec: input("spec") }, result: { kind: "output", name: "program" } },
    { id: "text:render", producer: textTrackProducers.render, inputs: { space: input("space"), program: operation("text:compile") }, result: { kind: "output", name: "track" } },
  ],
  exports: [{
    name: "track", type: contractTypes.visualTrack, root: operation("text:render"), semanticInputs: ["space", "spec"],
    affinity: [{ resultPointer: "/programSpaceDigest", source: input("space"), sourcePointer: "/digest" }], fidelity: "exact",
  }],
});

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}
function exact(element: StructuredElement, names: readonly string[]): void {
  if (Object.keys(element.attributes).sort().join("\0") !== [...names].sort().join("\0")) throw new Error(`${element.name} requires exactly ${names.join(", ")}`);
}
function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be a non-empty string`);
  return value.trim();
}
function ref(element: StructuredElement, name: string, expected: SurfaceResolvedReference["type"], resolve: (path: string) => SurfaceResolvedReference | undefined) {
  const raw: TextAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference`);
  const value = resolve(raw.path);
  if (!value || !sameType(value.type, expected)) throw new Error(`${element.name}.${name} cannot resolve a value of the required type`);
  return value;
}
function recipe(value: SurfaceResolvedReference): SvsRecipe {
  if (!sameType(value.type, svsRecipeType) || value.record?.value.kind !== "inline") throw new Error("Text appearance must be an authored SVS Recipe");
  return value.record.value.value as unknown as SvsRecipe;
}
function propNumber(value: SvsRecipe, name: string): number {
  const result = value.properties[name];
  if (typeof result !== "number" || !Number.isFinite(result)) throw new Error(`Text Recipe ${name} must be a number`);
  return result;
}
function propString(value: SvsRecipe, name: string): string {
  const result = value.properties[name];
  if (typeof result !== "string" || !result) throw new Error(`Text Recipe ${name} must be a string`);
  return result;
}

export const decodeTextTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "space"]);
  const id = text(element, "id");
  const space = ref(element, "space", contractTypes.programSpace, resolveReference);
  let itemIndex = 0;
  const items = element.children.flatMap((child) => {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Item children`);
      return [];
    }
    if (!child.name.endsWith(":Item") && child.name !== "Item") throw new Error(`${element.name} accepts only Item children`);
    itemIndex += 1;
    exact(child, ["text", "during", "appearance"]);
    if (text(child, "during") !== "full") throw new Error(`${child.name}.during currently accepts only full`);
    const appearance = recipe(ref(child, "appearance", svsRecipeType, resolveReference));
    const expected = ["align", "fill", "font", "height", "size", "stack-order", "tracking", "weight", "width", "x", "y"];
    if (Object.keys(appearance.properties).sort().join("\0") !== expected.sort().join("\0")) throw new Error(`Text Recipe requires exactly ${expected.join(", ")}`);
    const align = propString(appearance, "align");
    if (align !== "left" && align !== "center" && align !== "right") throw new Error("Text Recipe align is invalid");
    const textAlign = align as "left" | "center" | "right";
    return [{
      id: `item-${String(itemIndex).padStart(4, "0")}`,
      text: text(child, "text"), during: "full" as const,
      z: propNumber(appearance, "stack-order"),
      box: {
        xPercent: propNumber(appearance, "x") * 100, yPercent: propNumber(appearance, "y") * 100,
        widthPercent: propNumber(appearance, "width") * 100, heightPercent: propNumber(appearance, "height") * 100,
      },
      appearance: {
        color: propString(appearance, "fill"), fontSizePx: propNumber(appearance, "size"),
        fontFamily: propString(appearance, "font"), fontWeight: propNumber(appearance, "weight"),
        letterSpacingPx: propNumber(appearance, "tracking"), align: textAlign,
      },
    }];
  });
  if (items.length === 0) throw new Error(`${element.name} requires at least one Item`);
  const spec = sealTextTrackSpec({ contract: "svml.text-track-spec@1", id, items });
  const specId = `${id}.spec`;
  return {
    records: [{ id: specId, type: textTrackTypes.spec, value: { kind: "inline", value: spec }, range: element.range }],
    components: [{ id, fragment: textTrackSurfaceFragment.id, inputs: { space: space.ref, spec: { kind: "record", id: specId } }, outputs: { track: `${id}.track` }, range: element.range }],
    fragments: [textTrackSurfaceFragment],
  };
};

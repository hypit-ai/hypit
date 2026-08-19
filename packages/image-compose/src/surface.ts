import { artifactTypes } from "@hypit/artifact";
import type { CanonicalValue } from "@hypit/protocol";
import { spatialTypes } from "@hypit/spatial";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference, MarkupAttributeValue } from "@hypit/markup";

import { createImageComposeFragment } from "./fragment.js";
import { imageComposeTypes } from "./manifest.js";
import { sealImageComposeLayerSpec, sealImageComposeOptions } from "./program.js";

function localName(name: string): string { return name.slice(name.lastIndexOf(":") + 1); }
function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}
function exact(element: StructuredElement, allowed: readonly string[], required: readonly string[] = []): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}.`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  if (missing.length > 0) throw new Error(`${element.name} requires ${missing.join(", ")}.`);
}
function text(element: StructuredElement, name: string, fallback?: string): string {
  const value = element.attributes[name];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}
function number(element: StructuredElement, name: string, fallback: number): number {
  const value = Number(text(element, name, String(fallback)));
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be finite.`);
  return value;
}
function reference(element: StructuredElement, name: string, expected: SurfaceResolvedReference["type"], resolve: (path: string) => SurfaceResolvedReference | undefined): SurfaceResolvedReference {
  const raw: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference.`);
  const result = resolve(raw.path);
  if (result === undefined || !sameType(result.type, expected)) throw new Error(`${element.name}.${name} has the wrong Type.`);
  return result;
}

export const decodeImageComposeSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "canvas", "background"], ["id", "canvas"]);
  const id = text(element, "id");
  const canvas = reference(element, "canvas", spatialTypes.canvas, resolveReference);
  const optionsId = `${id}.__options`;
  const records = [{
    id: optionsId, type: imageComposeTypes.options,
    value: { kind: "inline" as const, value: sealImageComposeOptions({
      background: text(element, "background", "#00000000"),
    }) as unknown as CanonicalValue }, range: element.range,
  }];
  const inputs: Record<string, typeof canvas.ref> = { canvas: canvas.ref, options: { kind: "record", id: optionsId } };
  const layers: Parameters<typeof createImageComposeFragment>[0][number][] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Layer children.`);
      continue;
    }
    if (localName(child.name) !== "Layer") throw new Error(`${element.name} accepts only Layer children.`);
    exact(child, ["source", "frame", "fit", "interpolation", "opacity"], ["source", "frame"]);
    if (child.children.some((node) => node.kind === "element" || node.value.trim())) throw new Error(`${child.name} must be empty.`);
    const suffix = String(layers.length + 1).padStart(4, "0");
    const source = reference(child, "source", artifactTypes.blob, resolveReference);
    const frame = reference(child, "frame", spatialTypes.frame, resolveReference);
    const specId = `${id}.layer.${suffix}.spec`;
    records.push({
      id: specId, type: imageComposeTypes.layerSpec,
      value: { kind: "inline", value: sealImageComposeLayerSpec({

        fit: text(child, "fit", "contain") as "contain",
        interpolation: text(child, "interpolation", "lanczos") as "lanczos",
        opacity: number(child, "opacity", 1),
      }) as unknown as CanonicalValue }, range: child.range,
    });
    const sourceName = `layer-${suffix}-source`; const frameName = `layer-${suffix}-frame`; const specName = `layer-${suffix}-spec`;
    inputs[sourceName] = source.ref; inputs[frameName] = frame.ref; inputs[specName] = { kind: "record", id: specId };
    layers.push({ sourceName, frameName, specName });
  }
  const fragment = createImageComposeFragment(layers);
  return {
    records,
    components: [{ id, fragment: fragment.id, inputs, outputs: { image: `${id}.image` }, range: element.range }],
    fragments: [fragment],
  };
};

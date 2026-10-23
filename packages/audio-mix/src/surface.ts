import { sameType } from "@hypit/hypit/protocol";
import { compositionTypes } from "@hypit/composition";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { assertAttributes, optionalTextAttribute, textAttribute } from "@hypit/hypit/markup";
import { resolveTemporalContext } from "@hypit/temporal/markup";
import { createAudioMixFragment } from "./fragment.js";
import { audioMixTypes } from "./manifest.js";
import { sealAudioMixHeader, sealAudioMixInputSpec } from "./program.js";

export const decodeAudioMixSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "timeline"]);
  const id = textAttribute(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const records = [{ id: `${id}.header`, type: audioMixTypes.header, value: sealAudioMixHeader({ id }), range: element.range }];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
    header: { kind: "record", id: `${id}.header` }, timeline: context.timeline.ref,
  };
  let count = 0;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Input children.`);
      continue;
    }
    if (!child.name.endsWith(":Input") && child.name !== "Input") throw new Error(`${element.name} accepts only Input children.`);
    if (child.children.some((node) => node.kind === "element" || node.value.trim())) throw new Error(`${child.name} must be empty.`);
    assertAttributes(child, ["id", "source", "gain"]);
    const sourceAttribute = child.attributes.source;
    if (typeof sourceAttribute !== "object" || sourceAttribute.kind !== "reference") throw new Error(`${child.name}.source must be a reference.`);
    const source = resolveReference(sourceAttribute.path);
    if (source === undefined || !sameType(source.type, compositionTypes.audioTrack)) throw new Error(`${child.name}.source must reference AudioTrack.`);
    const gainSource = optionalTextAttribute(child, "gain");
    const gain = gainSource === undefined ? 1 : Number(gainSource);
    count += 1;
    const suffix = String(count).padStart(4, "0");
    const specId = `${id}.input.${suffix}.spec`;
    records.push({ id: specId, type: audioMixTypes.inputSpec,
      value: sealAudioMixInputSpec({ id: textAttribute(child, "id"), gain }), range: child.range });
    inputs[`spec-${suffix}`] = { kind: "record", id: specId };
    inputs[`track-${suffix}`] = source.ref;
  }
  if (count === 0) throw new Error(`${element.name} requires at least one Input.`);
  return { records, components: [{ id, fragment: createAudioMixFragment(count), inputs,
    outputs: { audio: `${id}.audio` }, range: element.range }], exports: [`${id}.audio`] };
};

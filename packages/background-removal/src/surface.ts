import { artifactTypes } from "@narratage/artifact";
import type { StructuredSurfaceHandler, SurfaceResolvedReference, TextAttributeValue } from "@narratage/text";

import { backgroundRemovalFragment } from "./fragment.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

export const decodeBackgroundRemovalSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const unknown = Object.keys(element.attributes).filter((name) => !["id", "source"].includes(name));
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}.`);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) throw new Error(`${element.name} must be empty.`);
  const id = element.attributes.id;
  if (typeof id !== "string" || !id.trim()) throw new Error(`${element.name}.id must be text.`);
  const raw: TextAttributeValue | undefined = element.attributes.source;
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.source must be a reference.`);
  const source = resolveReference(raw.path);
  if (source === undefined || !sameType(source.type, artifactTypes.blob)) throw new Error(`${element.name}.source must be a Blob Artifact.`);
  return {
    records: [], fragments: [backgroundRemovalFragment],
    components: [{
      id: id.trim(), fragment: backgroundRemovalFragment.id, inputs: { source: source.ref },
      outputs: { image: `${id.trim()}.image` }, range: element.range,
    }],
  };
};

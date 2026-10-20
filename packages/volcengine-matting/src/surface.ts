import { blobTypes } from "@hypit/hypit/blob";
import { sealModelArtifactBinding, sealModelFieldBuilder } from "@hypit/generation/model-fields";
import type { ModelArtifactField } from "@hypit/generation/model-fields";
import { canonicalize, isBlobRef, sameType } from "@hypit/hypit/protocol";
import type { StructuredSurfaceHandler } from "@hypit/hypit/markup";
import { createFieldModelPrimaryFragment, modelArtifactInputNames } from "@hypit/generation/model-fields";
import { portraitMattingEndpoint as endpoint } from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const decodePortraitMattingSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const { id, source, format } = element.attributes;
  for (const name of Object.keys(element.attributes)) {
    assert(["id", "source", "format"].includes(name), `${element.name} does not accept ${name}`);
  }
  assert(typeof id === "string" && id.trim().length > 0, `${element.name} requires id`);
  assert(!element.children.some((item) => item.kind === "element" || item.value.trim()), `${element.name} must be empty`);
  assert(typeof source === "object" && source.kind === "reference", `${element.name}.source must be a video reference`);
  const resolved = resolveReference(source.path);
  assert(resolved !== undefined && sameType(resolved.type, blobTypes.blob), `${element.name}.source must be a Blob`);
  if (resolved.record !== undefined) {
    assert(isBlobRef(resolved.record.value) && resolved.record.value.mediaType.startsWith("video/"),
      `${element.name}.source must be video media`);
  }
  assert(format === undefined || typeof format === "string", `${element.name}.format must be literal`);
  const draft = sealModelFieldBuilder(endpoint.ports, { format: [format ?? "WEBM"] });
  const binding = sealModelArtifactBinding(endpoint.ports.ports.find((port) => port.name === "source")! as ModelArtifactField,
    { role: "video" });
  const names = modelArtifactInputNames("source");
  const fragment = createFieldModelPrimaryFragment(endpoint, [{ name: "source", port: "source" }], []);
  return {
    records: [
      { id: `${id}.draft`, type: endpoint.draftType, value: (canonicalize(draft)), range: element.range },
      { id: `${id}.source-binding`, type: endpoint.mediaBindings.source!.type,
        value: (canonicalize(binding)), range: element.range },
    ],
    components: [{ id, fragment, inputs: {
      draft: { kind: "record", id: `${id}.draft` },
      [names.binding]: { kind: "record", id: `${id}.source-binding` },
      [names.artifact]: resolved.ref,
    }, outputs: { video: `${id}.video` }, range: element.range }],
  };
};

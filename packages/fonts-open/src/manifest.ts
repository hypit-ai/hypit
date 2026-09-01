import { mediaDependency, mediaTypes } from "@hypit/media";
import type { ModuleManifest } from "@hypit/protocol";

import { openFontFamilyNames } from "./catalog.js";

export const fontsOpenModuleRef = { name: "@hypit/fonts-open", version: "1" } as const;

export const fontsOpenMarkupSurfaces = [{
    name: "face",
    tag: "Face",
    mode: "structured",
    outputs: [mediaTypes.fontArtifact],
    vocabulary: {
      summary: "Materializes one exact catalog face as a FontArtifact Resource.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names the FontArtifact Record this element publishes." },
        { name: "family", kind: "literal", required: true, values: openFontFamilyNames,
          summary: "Chooses the catalog family the face is taken from." },
        { name: "weight", kind: "literal", required: true,
          summary: "Chooses the exact weight, which the family must publish." },
        { name: "style", kind: "literal", required: true, values: ["normal", "italic"],
          summary: "Chooses the exact style, which the family must publish." },
      ],
      example: `<fonts:Face id="headline" family="archivo-black" weight="400" style="normal"/>`,
      notes: [
        "The element is empty; it accepts no children and no text.",
        "A static family accepts only a weight it ships; a variable family accepts any whole weight inside its range.",
        "The FontArtifact is published under the bare `id`, and an unavailable family, weight or style fails before any bytes are read.",
      ],
    },
  }, {
    name: "stack",
    tag: "Stack",
    mode: "structured",
    outputs: [mediaTypes.fontStack],
    vocabulary: {
      summary: "Orders one primary catalog face, its written fallbacks and an optional Emoji face into one reusable FontStack.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names the FontStack Record this element publishes." },
        { name: "family", kind: "literal", required: true, values: openFontFamilyNames,
          summary: "Chooses the catalog family the primary face is taken from." },
        { name: "weight", kind: "literal", required: true,
          summary: "Chooses the primary face's exact weight, which the family must publish." },
        { name: "style", kind: "literal", required: true, values: ["normal", "italic"],
          summary: "Chooses the primary face's exact style, which the family must publish." },
        { name: "emoji", kind: "literal", required: false, values: ["color", "mono"],
          summary: "Appends a pinned Emoji face after every other face in the stack." },
      ],
      children: [
        { tag: "Fallback", cardinality: "many",
          summary: "Appends one more exact catalog face after the primary one, in the order written.",
          attributes: [
            { name: "family", kind: "literal", required: true, values: openFontFamilyNames,
              summary: "Chooses the catalog family this fallback face is taken from." },
            { name: "weight", kind: "literal", required: true,
              summary: "Chooses the fallback face's exact weight, which the family must publish." },
            { name: "style", kind: "literal", required: true, values: ["normal", "italic"],
              summary: "Chooses the fallback face's exact style, which the family must publish." },
          ] },
      ],
      example: `<fonts:Stack id="caption-fonts" family="inter" weight="700" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="700" style="normal"/>
</fonts:Stack>`,
      notes: [
        "A `<Fallback>` is empty; it accepts no children and no text.",
        "`emoji=\"color\"` selects the COLRv1 face and `emoji=\"mono\"` the weight-400 monochrome face; omitting `emoji` adds no bytes.",
        "The FontStack is published under the bare `id`, and the element carries no text content.",
      ],
    },
  }] as const;


export const fontsOpenManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: fontsOpenModuleRef.name,
  version: fontsOpenModuleRef.version,
  dependencies: [mediaDependency],
  types: [],
  capabilities: [],
  producers: [],
};

import { compositionTypes } from "@hypit/composition";
import type {
  StudioInspectorFieldDeclaration,
  StudioSourceBindingDeclaration,
  StudioTrackCompanion,
  StudioTrackCompanionContext,
} from "@hypit/studio-companion";
import { temporalLineageFor } from "@hypit/studio-companion";
import { visualAdjustmentProperties } from "./author.js";
import { visualAdjustmentModuleRef } from "./manifest.js";

const title = (name: string): string => name.split("-")
  .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
  .join(" ");

const appearance: StudioSourceBindingDeclaration = {
  name: "appearance",
  recipe: {
    bindings: visualAdjustmentProperties.map((property) => ({
      name: property.name,
      writable: true,
      schema: property.schema,
      fallback: property.fallback,
    })),
  },
};

const sections = {
  transform: "Transform",
  color: "Color",
  optics: "Optics",
} as const;

const inspector: readonly StudioInspectorFieldDeclaration[] = visualAdjustmentProperties.map((property) => ({
  binding: `appearance.${property.name}`,
  label: title(property.name),
  domain: property.domain,
  page: property.domain === "where"
    ? { id: "transform", label: "Transform" }
    : { id: property.section, label: sections[property.section] },
  section: { id: property.section, label: sections[property.section] },
  control: "number",
  ...(property.unit === undefined ? {} : { unit: property.unit }),
  number: { step: property.unit === "px" || property.unit === "°" ? 1 : 0.01 },
  summary: property.summary,
}));

function project(context: StudioTrackCompanionContext) {
  return context.generic().map((item) => {
    const temporal = temporalLineageFor(context, item.authoredId, "window");
    return { ...item, ...(temporal === undefined ? {} : { temporal }) };
  });
}

export const visualAdjustmentStudioTrackCompanions: readonly StudioTrackCompanion[] = [{
  id: "track",
  role: "track",
  output: { type: compositionTypes.visualTrack, surface: "track", modules: [visualAdjustmentModuleRef] },
  family: "visual-adjustment",
  tone: "violet",
  label: "Adjustments",
  icon: "layers",
  lane: { heightPx: 32 },
  bindings: [appearance],
  inspector,
  project,
}];

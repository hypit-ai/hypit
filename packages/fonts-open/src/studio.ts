import type { StudioInspectorFieldDeclaration, StudioSourceBindingDeclaration } from "@hypit/studio-adapter";
import { openFontFamilies } from "./catalog.js";

/** Optional Companion declarations for the primary catalog face reached through a Style's font. */
export function openFontStudioFields(owner: string): {
  readonly binding: StudioSourceBindingDeclaration;
  readonly fields: readonly StudioInspectorFieldDeclaration[];
} {
  return {
    binding: { name: "font", referenced: [{ name: "family", writable: true }] },
    fields: [{
      binding: `${owner}.font.family`, label: "Font Family", domain: "how",
      page: { id: "font", label: "Font" }, section: { id: "face", label: "Primary Face" },
      summary: "Changes the shared catalog face. Its authored weight and style must be available in the selected family.",
      control: "select",
      options: Object.entries(openFontFamilies).map(([value, family]) => ({
        value, label: family.label, description: `${family.category} · ${family.intendedUse}`,
      })),
    }],
  };
}

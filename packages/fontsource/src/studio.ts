import type { StudioParameterCompanion } from "@hypit/studio-companion";
import { fontsourceModuleRef } from "./manifest.js";

export const fontsourceStudioParameterCompanions: readonly StudioParameterCompanion[] = [{
  id: "face",
  match: { module: fontsourceModuleRef, declaration: "face" },
  bindings: [
    { name: "package" },
    { name: "weight", writable: true },
    { name: "style", writable: true },
  ],
  inspector: [
    { binding: "package", label: "Font Package", domain: "how", section: { id: "face", label: "Face" },
      summary: "The installed npm dependency selected by the project lockfile.", control: "text" },
    { binding: "weight", label: "Weight", domain: "how", section: { id: "face", label: "Face" },
      summary: "An exact weight supported by the installed package.", control: "number",
      number: { minimum: 1, maximum: 1_000, step: 1 } },
    { binding: "style", label: "Style", domain: "how", section: { id: "face", label: "Face" },
      control: "select", options: ["normal", "italic"] },
  ],
}];

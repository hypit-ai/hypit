import { geminiOmniComponent, geminiOmniManifest } from "./index.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/gemini-omni", modules: [{ manifest: geminiOmniManifest, specifiers: ["@narratage/gemini-omni", "@narratage/gemini-omni@1"] }], components: [geminiOmniComponent] };
export default svmlPackage;

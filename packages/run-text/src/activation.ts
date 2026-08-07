import { runTextFrontend } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/run-text",
  runFrontends: [runTextFrontend],
};

export default svmlPackage;

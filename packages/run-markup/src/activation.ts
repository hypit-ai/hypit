import { runMarkupFrontend } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/run-markup",
  runFrontends: [runMarkupFrontend],
};

export default svmlPackage;

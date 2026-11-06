import type { RefinementPackage } from "@hypit/refinement";

import { textTypes } from "./manifest.js";
import { verifyText } from "./program.js";

export const textComponent = {
  refinements: [{ type: textTypes.text, handler: ({ value }) => verifyText(value) }],
} satisfies { refinements?: RefinementPackage };

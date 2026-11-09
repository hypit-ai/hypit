import test from "node:test";
import { assertMappingCoversPorts } from "@hypit/generation";
import { gptImage2Ports } from "@hypit/gpt-image";
import { grokImaginePorts } from "@hypit/grok-imagine";
import { minimaxH3Ports } from "@hypit/minimax-h3";
import { nanoBananaPorts } from "@hypit/nano-banana";
import { pixversePorts } from "@hypit/pixverse";
import { seedancePorts } from "@hypit/seedance";
import { seedream5LitePorts } from "@hypit/seedream";

import { sumeMappings } from "../src/mapping.js";

// A port added to one of these model packages must be mapped here before Sume can serve it.
test("every Sume mapping covers its model's ports", () => {
  const tables = {
    ...seedancePorts, ...grokImaginePorts, ...nanoBananaPorts, ...pixversePorts,
    "minimax-h3": minimaxH3Ports, "gpt-image-2": gptImage2Ports, "seedream-5-lite": seedream5LitePorts,
  };
  for (const mapping of sumeMappings) {
    assertMappingCoversPorts(tables[mapping.capability.name as keyof typeof tables], mapping);
  }
});

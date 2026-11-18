import { describeModelPackage } from "@hypit/execution/model";
import { gptImage2, gptImage25Flare, gptImage25Sunburst } from "./index.js";

export const hypitPackage = describeModelPackage("@hypit/gpt-image", [gptImage2, gptImage25Flare, gptImage25Sunburst]);

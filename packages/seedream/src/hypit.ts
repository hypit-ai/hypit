import { describeModelPackage } from "@hypit/execution/model";
import { seedream5Lite, seedream5Pro } from "./index.js";

export const hypitPackage = describeModelPackage("@hypit/seedream", [seedream5Lite, seedream5Pro]);

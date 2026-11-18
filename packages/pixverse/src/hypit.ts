import { describeModelPackage } from "@hypit/execution/model";
import { pixverseV6, pixverseC1 } from "./index.js";

export const hypitPackage = describeModelPackage("@hypit/pixverse", [pixverseV6, pixverseC1]);

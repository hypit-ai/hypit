import { describeModelPackage } from "@hypit/execution/model";
import { seedanceModels } from "./index.js";

export const hypitPackage = describeModelPackage("@hypit/seedance", seedanceModels);

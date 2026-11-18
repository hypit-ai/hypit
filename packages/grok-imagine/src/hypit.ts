import { describeModelPackage } from "@hypit/execution/model";
import { grokImagineVideo, grokImagine15Preview } from "./index.js";

export const hypitPackage = describeModelPackage("@hypit/grok-imagine", [grokImagineVideo, grokImagine15Preview]);

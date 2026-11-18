import { describeModelPackage } from "@hypit/execution/model";
import { nanoBanana2, nanoBanana2Lite, nanoBananaPro } from "./index.js";

export const hypitPackage = describeModelPackage("@hypit/nano-banana", [nanoBanana2, nanoBanana2Lite, nanoBananaPro]);

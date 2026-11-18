import { describeModelPackage } from "@hypit/execution/model";
import { portraitMatting } from "./index.js";

export const hypitPackage = describeModelPackage("@hypit/volcengine-matting", [portraitMatting]);

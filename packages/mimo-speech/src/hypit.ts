import { describeModelPackage } from "@hypit/execution/model";
import { miMoVoiceDesign, miMoVoiceClone } from "./index.js";

export const hypitPackage = describeModelPackage("@hypit/mimo-speech", [miMoVoiceDesign, miMoVoiceClone]);

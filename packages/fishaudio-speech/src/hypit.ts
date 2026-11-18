import { describeModelPackage } from "@hypit/execution/model";
import { fishVoiceDesign, fishVoiceClone, fishS21ProFree } from "./index.js";

export const hypitPackage = describeModelPackage("@hypit/fishaudio-speech", [fishVoiceDesign, fishVoiceClone, fishS21ProFree]);

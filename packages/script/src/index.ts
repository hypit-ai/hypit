export { ScriptSyntaxError } from "./error.js";
export { adjustScriptMoment, adjustScriptSelection, scriptAnchorEditSites } from "./edit.js";
export { formatScript } from "./format.js";
export {
  captionDocument,
  narrativeCaptionBinding,
  narrativeMomentRef,
  narrativeSegmentRef,
  narrativeSelectionRef,
  narrativeValue,
  projectScript,
  serializeCaption,
  serializeSpeech,
  scriptSegmentSpeech,
} from "./narrative.js";
export { parseScript } from "./parser.js";
export type * from "./types.js";

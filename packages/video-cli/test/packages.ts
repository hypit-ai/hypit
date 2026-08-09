import artifact from "../../artifact/src/activation.js";
import captionGemini from "../../caption-gemini/src/activation.js";
import captionFine from "../../caption-fine/src/activation.js";
import caption from "../../caption/src/activation.js";
import composition from "../../composition/src/activation.js";
import estimate from "../../estimate/src/activation.js";
import film from "../../film/src/activation.js";
import fontsOpen from "../../fonts-open/src/activation.js";
import generation from "../../generation/src/activation.js";
import renderHyperframes from "../../render-hyperframes/src/activation.js";
import hyperframes from "../../hyperframes/src/activation.js";
import mediaPipeline from "../../media-pipeline/src/activation.js";
import mediaTrack from "../../media-track/src/activation.js";
import media from "../../media/src/activation.js";
import narrative from "../../narrative/src/activation.js";
import programSpace from "../../program-space/src/activation.js";
import promptKit from "../../prompt-kit/src/activation.js";
import runText from "../../run-text/src/activation.js";
import script from "../../script/src/activation.js";
import seedanceSpeaker from "../../seedance-speaker/src/activation.js";
import seedance from "../../seedance/src/activation.js";
import speechAlignment from "../../speech-alignment/src/activation.js";
import speechSpine from "../../speech-spine/src/activation.js";
import speechBasis from "../../speech-basis/src/activation.js";
import speech from "../../speech/src/activation.js";
import speechEvidence from "../../speech-evidence/src/activation.js";
import semanticMap from "../../semantic-map/src/activation.js";
import spatial from "../../spatial/src/activation.js";
import temporal from "../../temporal/src/activation.js";
import visualIr from "../../visual-ir/src/activation.js";
import svs from "../../svs/src/activation.js";
import textTrack from "../../text-track/src/activation.js";
import whisperX from "../../whisperx/src/activation.js";

/** Test-only explicit environment; production video CLI starts with no author packages. */
export const videoTestPackages = [
  artifact,
  narrative,
  media,
  programSpace,
  speech,
  speechEvidence,
  semanticMap,
  visualIr,
  composition,
  svs,
  script,
  estimate,
  fontsOpen,
  promptKit,
  generation,
  seedance,
  seedanceSpeaker,
  caption,
  captionFine,
  captionGemini,
  speechAlignment,
  speechBasis,
  speechSpine,
  whisperX,
  spatial,
  temporal,
  mediaTrack,
  textTrack,
  film,
  hyperframes,
  mediaPipeline,
  renderHyperframes,
  runText,
] as const;

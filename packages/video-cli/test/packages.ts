import artifact from "../../artifact/src/activation.js";
import broll from "../../broll/src/activation.js";
import captionGemini from "../../caption-gemini/src/activation.js";
import caption from "../../caption/src/activation.js";
import contracts from "../../video-contracts/src/activation.js";
import estimate from "../../estimate/src/activation.js";
import film from "../../film/src/activation.js";
import generation from "../../generation/src/activation.js";
import hyperframesRender from "../../hyperframes-render/src/activation.js";
import hyperframes from "../../hyperframes/src/activation.js";
import mediaPipeline from "../../media-pipeline/src/activation.js";
import media from "../../media/src/activation.js";
import promptKit from "../../prompt-kit/src/activation.js";
import runText from "../../run-text/src/activation.js";
import script from "../../script/src/activation.js";
import seedanceSpeaker from "../../seedance-speaker/src/activation.js";
import seedance from "../../seedance/src/activation.js";
import speechAlign from "../../speech-align/src/activation.js";
import speechProgram from "../../speech-program/src/activation.js";
import speechTake from "../../speech-take/src/activation.js";
import svs from "../../svs/src/activation.js";
import textTrack from "../../text-track/src/activation.js";
import whisperX from "../../whisperx/src/activation.js";

/** Test-only explicit environment; production video CLI starts with no author packages. */
export const videoTestPackages = [
  artifact,
  contracts,
  media,
  svs,
  script,
  estimate,
  promptKit,
  generation,
  seedance,
  seedanceSpeaker,
  caption,
  captionGemini,
  speechAlign,
  speechTake,
  speechProgram,
  whisperX,
  broll,
  textTrack,
  film,
  hyperframes,
  mediaPipeline,
  hyperframesRender,
  runText,
] as const;

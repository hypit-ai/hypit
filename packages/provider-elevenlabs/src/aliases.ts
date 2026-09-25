import { gptImageEndpoints } from "@hypit/gpt-image";
import { elevenLabsSpeechEndpoints } from "@hypit/elevenlabs-speech";
import { catalog } from "@hypit/elevenlabs-models";
import type { Alias } from "@hypit/direct-model-kit/provider";
import { assert } from "@hypit/direct-model-kit/transport";
export const aliases: Alias[] = [
  {
    endpoint: gptImageEndpoints.image!,
    model: catalog.find((m) => m.model === "gpt-image-2")!,
    convert(r) {
      assert(
        !r.ports.background,
        "ElevenLabs GPT Image 2 API has no background option",
      );
      return r;
    },
  },
  {
    endpoint: elevenLabsSpeechEndpoints.voiceDesign!,
    model: catalog.find((m) => m.model === "eleven_ttv_v3")!,
    convert: (r) => r,
  },
];

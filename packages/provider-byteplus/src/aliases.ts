import { seedanceEndpoints } from "@hypit/seedance";
import { seedreamEndpoints } from "@hypit/seedream";
import { catalog } from "@hypit/byteplus-models";
import type { Alias } from "@hypit/direct-model-kit/provider";
import { assert } from "@hypit/direct-model-kit/transport";
const mapping: Record<string, string> = {
  "seedance-2": "dreamina-seedance-2-0-260128",
  "seedance-2-fast": "dreamina-seedance-2-0-fast-260128",
  "seedance-2-mini": "dreamina-seedance-2-0-mini-260615",
  "seedance-2.5": "dreamina-seedance-2-5-260628",
};
export const aliases: Alias[] = Object.values(seedanceEndpoints).map(
  (endpoint) => ({
    endpoint,
    model: catalog.find((m) => m.model === mapping[endpoint.ports.model])!,
    convert(request) {
      const ports = { ...request.ports };
      assert(
        ports.webSearch?.[0] !== true,
        "BytePlus direct adapter does not support webSearch",
      );
      delete ports.webSearch;
      for (const [from, to] of [
        ["aspectRatio", "ratio"],
        ["referenceImage", "images"],
        ["referenceVideo", "videos"],
        ["referenceAudio", "audios"],
      ] as const) {
        if (ports[from]) {
          ports[to] = ports[from]!;
          delete ports[from];
        }
      }
      // personReference is an author classification; this API has no equivalent field.
      for (const name of ["images", "videos", "firstFrame", "lastFrame"])
        if (ports[name])
          ports[name] = ports[name]!.map((value) => {
            if (typeof value !== "object") return value;
            const { fields: _classification, ...media } = value;
            return media;
          });
      return { ports };
    },
  }),
);
const sizes: Record<string, Record<string, string>> = {
  basic: {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2848x1600",
    "9:16": "1600x2848",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3136x1344",
  },
  high: {
    "1:1": "3072x3072",
    "4:3": "3456x2592",
    "3:4": "2592x3456",
    "16:9": "4096x2304",
    "9:16": "2304x4096",
    "3:2": "3744x2496",
    "2:3": "2496x3744",
    "21:9": "4704x2016",
  },
};
sizes.ultra = {
  "1:1": "4096x4096",
  "4:3": "4704x3520",
  "3:4": "3520x4704",
  "16:9": "5504x3040",
  "9:16": "3040x5504",
  "3:2": "4992x3328",
  "2:3": "3328x4992",
  "21:9": "6240x2656",
};
aliases.push({
  endpoint: seedreamEndpoints.image!,
  model: catalog.find((m) => m.model === "seedream-5-0-lite-260128")!,
  convert(request) {
    const ports = { ...request.ports };
    assert(
      ports.nsfwCheck?.[0] !== false,
      "BytePlus cannot disable service moderation",
    );
    delete ports.nsfwCheck;
    if (ports.quality && ports.aspectRatio) {
      const size =
        sizes[String(ports.quality[0])]?.[String(ports.aspectRatio[0])];
      assert(size, "Unsupported Seedream size");
      ports.size = [size];
    }
    delete ports.quality;
    delete ports.aspectRatio;
    return { ports };
  },
});

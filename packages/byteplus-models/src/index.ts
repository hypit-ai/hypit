import raw from "./catalog.json" with { type: "json" };
import { createDirectModels, assert } from "@hypit/direct-model-kit";
import type { DirectModel } from "@hypit/direct-model-kit";
export const catalog = raw as readonly DirectModel[];
export const models = createDirectModels(
  "@hypit/byteplus-models",
  catalog,
  (m, r) => {
    const p = r.ports;
    if (m.result === "image" && p.size) {
      const value = String(p.size[0]);
      const bands = m.model.startsWith("dola")
        ? ["1K", "1.5K", "2K"]
        : m.model.includes("5-0-lite")
          ? ["2K", "3K", "4K"]
          : m.model.includes("4-5")
            ? ["2K", "4K"]
            : ["1K", "2K", "4K"];
      if (!bands.includes(value)) {
        const match = /^(\d+)x(\d+)$/.exec(value);
        assert(match, "Unsupported Seedream size");
        const w = Number(match[1]),
          h = Number(match[2]);
        const min =
          m.model.startsWith("dola") || m.model.includes("4-0")
            ? 921600
            : 3686400;
        const max = m.model.startsWith("dola") ? 4624220 : 16777216;
        assert(
          w * h >= min && w * h <= max && w / h >= 1 / 16 && w / h <= 16,
          "Seedream pixel size is out of range",
        );
      }
    }
    if (m.result === "video") {
      assert(
        !(
          p.firstFrame &&
          ["images", "videos", "audios"].some((k) => p[k]?.length)
        ),
        "Frame mode cannot be combined with omni reference mode",
      );
      if (m.model.includes("2-5") && p.firstFrame && p.ratio)
        assert(
          p.ratio[0] === "adaptive",
          "Seedance 2.5 frame mode requires adaptive ratio",
        );
    }
    if (m.result === "image" && p.maxImages) {
      assert(
        !p.sequentialImageGeneration ||
          p.sequentialImageGeneration[0] === "auto",
        "maxImages requires sequentialImageGeneration=auto",
      );
      assert(
        Number(p.maxImages[0]) + (p.images?.length ?? 0) <= 15,
        "Input images plus maximum output images must not exceed 15",
      );
    }
  },
);
export const hypitPackage = models.hypitPackage;

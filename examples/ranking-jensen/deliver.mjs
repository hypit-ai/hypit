import { fileURLToPath } from "node:url";
import { createLocalHtmlVideoExecutor } from "@hypit/html-video-local";
import {
  openNleDeliveryService,
} from "@hypit/nle-delivery";
import { openNodeProjectHost, readNodeProjectManifest } from "@hypit/project/node";

const root = fileURLToPath(new URL(".", import.meta.url));
const manifest = await readNodeProjectManifest(root);
const electronPath = process.env.HYPIT_ELECTRON_PATH?.trim();
const ffmpegPath = process.env.HYPIT_FFMPEG_PATH?.trim();
const ffprobePath = process.env.HYPIT_FFPROBE_PATH?.trim();
const renderer = electronPath ? "electron" : "chromium";
const deliveryName = process.env.HYPIT_DELIVERY_NAME?.trim() || `ranking-jensen-${renderer}.mp4`;
const executor = createLocalHtmlVideoExecutor({
  ...(electronPath ? { electronPath } : {}),
  ...(ffmpegPath ? { ffmpegPath } : {}),
  ...(ffprobePath ? { ffprobePath } : {}),
});
const host = await openNodeProjectHost({ root });
const delivery = openNleDeliveryService({ host, executor });
try {
  const handle = await delivery.start({
    document: "film.svml",
    destination: `deliveries/${deliveryName}`,
    profile: {
      picture: {
        width: 720,
        height: 1280,
        frameRate: { numerator: 24, denominator: 1 },
        background: "#090a0f",
        quality: "standard",
        renderer,
      },
      audio: { sampleRate: 48000, channels: 2 },
    },
  });
  await new Promise((resolveAction, rejectAction) => {
    let lastProgress = -1;
    const unsubscribe = delivery.subscribe(handle, observation => {
      const progress = Math.round(observation.progress * 100);
      if (progress !== lastProgress || observation.state !== "running") {
        lastProgress = progress;
        process.stdout.write(`${observation.state} ${progress}%\n`);
      }
      if (observation.state === "complete" || observation.state === "cancelled") {
        unsubscribe(); resolveAction();
      } else if (observation.state === "failed") {
        unsubscribe(); rejectAction(new Error(observation.diagnostic));
      }
    });
  });
} finally {
  delivery.close();
  await host.close();
}

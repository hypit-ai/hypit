export type DemoMediaManifest = {
  images: readonly string[];
  videos: readonly string[];
};

type DemoMediaKind = "image" | "video";

const demoMediaVersion = "20260805-lowbitrate";
const resolvedMedia = new Map<string, string>();
const preloadPromises = new Map<string, Promise<void>>();

export function publicAsset(relativePath: string) {
  return `${import.meta.env.BASE_URL}${relativePath.replace(/^\/+/, "")}?v=${demoMediaVersion}`;
}

export function resolveDemoMedia(source: string) {
  return resolvedMedia.get(source) ?? source;
}

function decodeImage(source: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try {
        await image.decode();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Unable to decode image: ${source}`));
    image.src = source;
  });
}

function decodeVideo(source: string) {
  return new Promise<void>((resolve, reject) => {
    const video = document.createElement("video");
    const finish = (error?: Error) => {
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      error ? reject(error) : resolve();
    };

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => finish();
    video.onerror = () => finish(new Error(`Unable to decode video: ${source}`));
    video.src = source;
    video.load();
  });
}

export function preloadDemoMedia(source: string, kind: DemoMediaKind) {
  if (resolvedMedia.has(source)) return Promise.resolve();

  const existing = preloadPromises.get(source);
  if (existing) return existing;

  const promise = fetch(source, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to preload ${source}: ${response.status}`);
      return response.blob();
    })
    .then(async (blob) => {
      const objectUrl = URL.createObjectURL(blob);
      try {
        await (kind === "image" ? decodeImage(objectUrl) : decodeVideo(objectUrl));
        resolvedMedia.set(source, objectUrl);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
      }
    })
    .catch((error) => {
      preloadPromises.delete(source);
      throw error;
    });

  preloadPromises.set(source, promise);
  return promise;
}

export const rankingMedia = {
  avatars: [
    publicAsset("regen-ranking/avatar-1.mp4"),
    publicAsset("regen-ranking/avatar-2.mp4"),
    publicAsset("regen-ranking/avatar-3.mp4"),
  ],
  icons: [
    publicAsset("regen-ranking/ranking-icon-1.webp"),
    publicAsset("regen-ranking/ranking-icon-2.webp"),
    publicAsset("regen-ranking/ranking-icon-3.webp"),
    publicAsset("regen-ranking/ranking-icon-4.webp"),
    publicAsset("regen-ranking/ranking-icon-5.webp"),
  ],
  broll: [
    publicAsset("regen-ranking/broll-1.webp"),
    publicAsset("regen-ranking/broll-2.webp"),
    publicAsset("regen-ranking/broll-3.webp"),
    publicAsset("regen-ranking/broll-4.webp"),
    publicAsset("regen-ranking/broll-5.webp"),
  ],
} as const;

export const streetMedia = {
  scenes: [
    publicAsset("street-interview/scene-1.mp4"),
    publicAsset("street-interview/scene-2.mp4"),
    publicAsset("street-interview/scene-3.mp4"),
    publicAsset("street-interview/scene-4.mp4"),
  ],
  broll: [
    publicAsset("street-interview/broll-2.mp4"),
    publicAsset("street-interview/broll-3.mp4"),
    publicAsset("street-interview/broll-4.mp4"),
  ],
} as const;

export const goodBetterBestMedia = {
  speakers: [
    publicAsset("good-better-best/speaker-hook.mp4"),
    publicAsset("good-better-best/speaker-1.mp4"),
    publicAsset("good-better-best/speaker-good.mp4"),
    publicAsset("good-better-best/speaker-2.mp4"),
    publicAsset("good-better-best/speaker-better.mp4"),
    publicAsset("good-better-best/speaker-3.mp4"),
    publicAsset("good-better-best/speaker-best.mp4"),
  ],
  decks: [
    publicAsset("good-better-best/deck-votes.webp"),
    publicAsset("good-better-best/deck-attract.webp"),
    publicAsset("good-better-best/deck-features.webp"),
  ],
  logos: [
    publicAsset("good-better-best/logo-chatgpt.webp"),
    publicAsset("good-better-best/logo-looksmax.webp"),
    publicAsset("good-better-best/logo-areum.webp"),
  ],
} as const;

export const demoMediaManifests = [
  {
    images: [...rankingMedia.icons, ...rankingMedia.broll],
    videos: rankingMedia.avatars,
  },
  {
    images: [],
    videos: [...streetMedia.scenes, ...streetMedia.broll],
  },
  {
    images: [...goodBetterBestMedia.decks, ...goodBetterBestMedia.logos],
    videos: goodBetterBestMedia.speakers,
  },
] as const satisfies readonly DemoMediaManifest[];

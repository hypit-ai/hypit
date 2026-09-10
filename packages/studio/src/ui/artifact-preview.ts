import type { StudioArtifactView } from "../shared.js";
import { audioPreview } from "./material-preview.js";

/** A media viewer only: it does not change the composition or its playhead. */
export function createArtifactPreview(changed: () => void) {
  const element = document.createElement("div");
  element.className = "stage-artifact";
  element.hidden = true;
  let selected: StudioArtifactView | undefined;
  let media: HTMLMediaElement | undefined;
  let generation = 0;

  function close(): void {
    generation += 1;
    selected = undefined;
    if (media !== undefined) {
      media.pause();
      media.removeAttribute("src");
      media.load();
    }
    media = undefined;
    element.replaceChildren();
    element.hidden = true;
  }

  function open(artifact: StudioArtifactView, muted: boolean): void {
    close();
    const current = generation;
    selected = artifact;
    element.hidden = false;
    const url = `/__studio/artifact?${new URLSearchParams({ build: artifact.build, output: artifact.output })}`;
    const error = document.createElement("p");
    error.className = "stage-media-error";
    error.hidden = true;
    error.setAttribute("role", "status");
    const failed = () => {
      if (generation !== current) return;
      error.textContent = "This media could not be opened in the browser.";
      error.hidden = false;
      changed();
    };
    if (artifact.mediaType.startsWith("image/")) {
      const image = document.createElement("img");
      image.alt = artifact.displayName ?? artifact.output;
      image.addEventListener("error", failed);
      image.src = url;
      element.append(image);
    } else {
      const audio = artifact.mediaType.startsWith("audio/");
      const player = document.createElement(audio ? "audio" : "video");
      media = player;
      if (player instanceof HTMLVideoElement) player.playsInline = true;
      player.preload = "metadata";
      player.muted = muted;
      for (const event of ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended", "seeking", "seeked"]) {
        player.addEventListener(event, () => { if (generation === current) changed(); });
      }
      player.addEventListener("error", failed);
      player.src = url;
      element.append(player);
      if (audio) {
        const wave = document.createElement("div");
        wave.className = "stage-audio-wave";
        wave.textContent = "Audio";
        element.append(wave);
        void audioPreview(url).then((waveform) => {
          if (generation !== current || waveform === undefined) return;
          const image = document.createElement("img");
          image.src = waveform;
          image.alt = "Audio waveform";
          wave.replaceChildren(image);
        });
      }
    }
    element.append(error);
    changed();
  }

  function seek(seconds: number): void {
    if (media === undefined || !Number.isFinite(media.duration)) return;
    media.currentTime = Math.max(0, Math.min(media.duration, seconds));
    changed();
  }

  function toggle(): void {
    const player = media;
    if (player === undefined) return;
    if (!player.paused) player.pause();
    else {
      if (player.ended) player.currentTime = 0;
      void player.play().catch(() => changed());
    }
  }

  return { element, open, close, seek, toggle,
    get selected() { return selected; },
    get media() { return media; },
  };
}

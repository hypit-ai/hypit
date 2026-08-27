export { mockMediaManifest, mockMediaModuleRef, mockMediaTypes, mockMediaCapabilities, mockMediaProducers } from "./manifest.js";
export { mockImageFragment, mockVideoFragment, mockSilenceFragment } from "./fragment.js";
export { mockMediaComponent } from "./component.js";
export type MockImageRequest = { readonly width: number; readonly height: number; readonly color: string };
export type MockVideoRequest = { readonly width: number; readonly height: number; readonly frameRate: import("@hypit/media").MediaRational; readonly frameCount: number; readonly color: string; readonly audio: "silence" | "none" };
export type MockSilenceRequest = { readonly sampleRate: 48_000; readonly channels: 2; readonly sampleFrames: number };

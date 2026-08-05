import type { MediaArtifactRef } from "@svml/contracts";
import type {
  HyperframesCanvas,
  HyperframesFrameDomain,
} from "@svml/hyperframes";
import type { Digest } from "@svml/protocol";

export type HyperframesRenderedVideo = HyperframesFrameDomain & {
  readonly contract: "svml.hyperframes-rendered-video@2";
  readonly digest: Digest;
  readonly documentDigest: Digest;
  readonly canvas: HyperframesCanvas;
  readonly artifact: MediaArtifactRef;
};

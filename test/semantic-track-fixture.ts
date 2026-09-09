import type { ProgramSpace } from "@hypit/program-space";
import type { SemanticTrack } from "@hypit/semantic-track";

type FixtureSegment = {
  readonly id: string;
  readonly frameCount: number;
};

type FixtureAnchor = {
  readonly identity: string;
  readonly frame: number;
};

const audioArtifact = {
  kind: "blob" as const,
  resource: "res_semantic-track-fixture" as const,
  size: 1,
  mediaType: "audio/wav",
};

/** Minimal real SemanticTrack for tests whose subject is timing rather than speech recognition. */
export function semanticTrackFixture(
  space: ProgramSpace,
  options: {
    readonly id?: string;
    readonly narrativeId?: string;
    readonly segments?: readonly FixtureSegment[];
    readonly anchors?: readonly FixtureAnchor[];
  } = {},
): SemanticTrack {
  const totalFrames = Math.round(space.durationSec * space.frameRate.numerator / space.frameRate.denominator);
  const segments = options.segments ?? [{ id: "fixture", frameCount: totalFrames }];
  if (segments.reduce((sum, segment) => sum + segment.frameCount, 0) !== totalFrames) {
    throw new Error("SemanticTrack fixture segments must fill ProgramSpace exactly.");
  }
  const anchors = options.anchors ?? [];
  const structuralAnchorIds = new Set(segments.flatMap((segment) => [
    `segment:${segment.id}:start`,
    `segment:${segment.id}:end`,
  ]));
  let startFrame = 0;
  return {
    // A SemanticTrack is the author-visible identity of the ProgramSpace it projects.
    id: options.id ?? space.id,
    narrativeId: options.narrativeId ?? "script",
    items: segments.map((segment, index) => {
      const endFrameExclusive = startFrame + segment.frameCount;
      const startAnchorId = `segment:${segment.id}:start`;
      const endAnchorId = `segment:${segment.id}:end`;
      const localAnchors = anchors
        .filter((anchor) => !structuralAnchorIds.has(anchor.identity)
          && anchor.frame >= startFrame
          && (index === segments.length - 1 ? anchor.frame <= endFrameExclusive : anchor.frame < endFrameExclusive))
        .map((anchor) => ({ identity: anchor.identity, frame: anchor.frame - startFrame }));
      const take = {
        narrativeId: options.narrativeId ?? "script",
        media: {
          timeline: { frameRate: space.frameRate, frameCount: segment.frameCount },
          audio: { artifact: audioArtifact },
        },
        segment: {
          segmentId: segment.id,
          startAnchorId,
          endAnchorId,
          startFrame: 0,
          endFrameExclusive: segment.frameCount,
        },
        tokens: [],
        anchors: [
          { identity: startAnchorId, frame: 0 },
          { identity: endAnchorId, frame: segment.frameCount },
          ...localAnchors.filter((anchor) => anchor.identity !== startAnchorId && anchor.identity !== endAnchorId),
        ],
      };
      startFrame = endFrameExclusive;
      return { take };
    }),
  };
}

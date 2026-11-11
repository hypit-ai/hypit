import type {
  SceneCamera,
  SceneEnvironment,
  ScenePackageSymbol,
  SceneTransform,
} from "@hypit/scene";
import type { CanonicalValue } from "@hypit/protocol";
import type { TemporalRate } from "@hypit/temporal/algebra";

export type SceneViewProjectReference = {
  /** Portable path relative to the Scene View file. */
  readonly path: string;
};

export type SceneViewObjectState = {
  readonly object: string;
  readonly hidden: boolean;
  readonly locked: boolean;
};

export type SceneViewTrackState = {
  readonly performance: string;
  readonly track: string;
  readonly locked: boolean;
};

export type SceneViewGrid = {
  readonly visible: boolean;
  readonly snap: boolean;
  readonly spacing: number;
};

/** Persistent editor-only projection of one Scene Project. */
export type SceneView = {
  readonly format: "hypit.scene-view@1";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly project: SceneViewProjectReference;
  readonly editRate: TemporalRate;
  readonly grid: SceneViewGrid;
  readonly objects: readonly SceneViewObjectState[];
  readonly tracks: readonly SceneViewTrackState[];
};

/** Invocation-local package or asset preview; never serialized into either document. */
export type SceneObjectObservation = {
  readonly object: string;
  readonly preview?:
    | { readonly kind: "model"; readonly resource: string }
    | {
        readonly kind: "primitive";
        readonly shape: "box" | "sphere" | "capsule";
        readonly color: string;
        readonly size: { readonly x: number; readonly y: number; readonly z: number };
      };
};

export type SceneWorkbenchObject = {
  readonly id: string;
  readonly name: string;
  readonly using: ScenePackageSymbol;
  readonly parameters: CanonicalValue;
  readonly transform: SceneTransform;
  readonly enabled: boolean;
  readonly editorVisible: boolean;
  readonly editable: boolean;
  readonly preview?: SceneObjectObservation["preview"];
};

export type SceneWorkbenchTrack = {
  readonly id: string;
  readonly name: string;
  readonly performance: string;
  readonly subject: { readonly kind: "object" | "camera"; readonly ref: string };
  readonly locked: boolean;
  readonly itemCount: number;
};

/** Finite renderer-independent read model. It is not persistent state. */
export type SceneWorkbenchScene = {
  readonly environment: SceneEnvironment;
  readonly grid: SceneViewGrid;
  readonly objects: readonly SceneWorkbenchObject[];
  readonly cameras: readonly SceneCamera[];
  readonly performances: readonly {
    readonly id: string;
    readonly name: string;
    readonly durationFrames: number;
    readonly tracks: readonly SceneWorkbenchTrack[];
    readonly shots: readonly {
      readonly id: string;
      readonly name: string;
      readonly camera: string;
      readonly startFrame: number;
      readonly durationFrames: number;
    }[];
  }[];
};

import type {
  SceneAssetDocument,
  SceneAssetReference,
  SceneLibraryCollection,
  SceneCameraState,
  SceneObjectState,
  ScenePackageSymbol,
  SceneProject,
  SceneTransaction,
} from "@hypit/scene";
import type { TemporalRate } from "@hypit/temporal/algebra";
import type { CanonicalValue } from "@hypit/protocol";
import type { SceneView, SceneViewTransaction, SceneWorkbenchScene } from "@hypit/scene-view";

export type SceneWorkbenchSnapshot = {
  readonly format: "hypit.workbench-scene@1";
  readonly project: SceneProject;
  readonly view: SceneView;
  readonly scene: SceneWorkbenchScene;
  readonly performancePreviews: readonly SceneWorkbenchPerformancePreview[];
  readonly libraries: readonly SceneWorkbenchLibrary[];
  readonly projectFile: string;
  readonly viewFile: string;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
};

export type SceneWorkbenchPerformancePreview = {
  readonly performance: string;
  readonly editRate: TemporalRate;
  readonly durationFrames: number;
  readonly frames: readonly {
    readonly objects: Readonly<Record<string, SceneObjectState>>;
    readonly cameras: Readonly<Record<string, SceneCameraState>>;
    readonly activeCamera?: string;
  }[];
  readonly error?: string;
};

export type SceneWorkbenchLibraryEntry = {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** Portable from the open Scene Project, ready for an authored Object parameter. */
  readonly asset: SceneAssetReference;
  readonly collections: readonly string[];
  readonly tags: readonly string[];
  readonly using: ScenePackageSymbol;
  readonly parameters: SceneAssetDocument["parameters"];
  readonly preview?: { readonly kind: "model"; readonly resource: string };
};

export type SceneWorkbenchLibrary = {
  readonly id: string;
  readonly name: string;
  readonly collections: readonly SceneLibraryCollection[];
  readonly entries: readonly SceneWorkbenchLibraryEntry[];
};

export type SceneWorkbenchTransactionRequest = {
  readonly label: string;
  readonly transaction: SceneTransaction;
};

export type SceneWorkbenchViewTransactionRequest = {
  readonly transaction: SceneViewTransaction;
};

export type SceneWorkbenchObjectParameterRequest = {
  readonly revision: number;
  readonly object: string;
  readonly operation: CanonicalValue;
};

export type SceneWorkbenchEnvironmentParameterRequest = {
  readonly revision: number;
  readonly operation: CanonicalValue;
};

export type SceneWorkbenchBehaviorParameterRequest = {
  readonly revision: number;
  readonly performance: string;
  readonly track: string;
  readonly item: string;
  readonly operation: CanonicalValue;
};

export type SceneWorkbenchExportRequest = {
  readonly revision: number;
  readonly fileName: string;
  readonly performance: string;
  readonly view: "follow" | `camera:${string}`;
  readonly range: "performance" | `shot:${string}` | `item:${string}`;
  readonly resolution: { readonly width: number; readonly height: number };
  readonly frameRate: number;
};

export type SceneWorkbenchExportState =
  | { readonly format: "hypit.workbench-scene-export@1"; readonly id: number; readonly state: "idle" }
  | {
      readonly format: "hypit.workbench-scene-export@1";
      readonly id: number;
      readonly state: "running";
      readonly progress: { readonly phase: "open" | "record" | "encode" | "publish"; readonly duration?: number };
    }
  | { readonly format: "hypit.workbench-scene-export@1"; readonly id: number; readonly state: "cancelled" }
  | {
      readonly format: "hypit.workbench-scene-export@1";
      readonly id: number;
      readonly state: "failed";
      readonly error: string;
    }
  | {
      readonly format: "hypit.workbench-scene-export@1";
      readonly id: number;
      readonly state: "complete";
      readonly output: {
        readonly asset: string;
        readonly media: string;
        readonly width: number;
        readonly height: number;
        readonly duration: number;
        readonly frameRate: number;
      };
    };

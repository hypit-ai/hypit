import type { CanonicalValue, ModuleRef } from "@hypit/protocol";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

export type SceneVector3 = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type SceneQuaternion = SceneVector3 & {
  readonly w: number;
};

/** One rigid pose. Rotation is a unit quaternion; Euler angles are an editor projection only. */
export type ScenePose = {
  readonly position: SceneVector3;
  readonly rotation: SceneQuaternion;
};

export type SceneTransform = ScenePose & {
  readonly scale: SceneVector3;
};

export type ScenePackageSymbol = {
  readonly module: ModuleRef;
  readonly name: string;
};

/** One portable file owned by a Scene Asset document. */
export type SceneAssetFile = {
  readonly path: string;
  readonly mediaType: string;
};

/** Portable reference to one Scene Asset document, relative to its owner. */
export type SceneAssetReference = {
  readonly path: string;
};

/** Portable reference to one explicitly selected Scene Library. */
export type SceneLibraryReference = {
  readonly path: string;
};

/**
 * A package-interpreted, project-owned scene asset.
 *
 * Resource names and parameters belong to `using`; Core does not assign fixed
 * meanings to meshes, rigs, materials, motions, environments or camera presets.
 */
export type SceneAssetDocument = {
  readonly format: "hypit.scene-asset@1";
  readonly id: string;
  readonly name: string;
  readonly using: ScenePackageSymbol;
  readonly preview?: SceneAssetFile;
  readonly resources: Readonly<Record<string, SceneAssetFile>>;
  readonly parameters: CanonicalValue;
};

/** Author-defined presentation hierarchy; collection identities have no Core meaning. */
export type SceneLibraryCollection = {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly children: readonly SceneLibraryCollection[];
};

export type SceneLibraryEntry = {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly asset: SceneAssetReference;
  readonly collections: readonly string[];
  readonly tags: readonly string[];
};

/** One explicit, local presentation of Scene Assets. It is not an asset registry. */
export type SceneLibraryDocument = {
  readonly format: "hypit.scene-library@1";
  readonly id: string;
  readonly name: string;
  readonly collections: readonly SceneLibraryCollection[];
  readonly entries: readonly SceneLibraryEntry[];
};

export type SceneEnvironment = {
  readonly using: ScenePackageSymbol;
  readonly parameters: CanonicalValue;
};

export type SceneObject = {
  readonly id: string;
  readonly name: string;
  readonly using: ScenePackageSymbol;
  readonly transform: SceneTransform;
  readonly enabled: boolean;
  readonly parameters: CanonicalValue;
};

export type SceneCamera = {
  readonly id: string;
  readonly name: string;
  readonly pose: ScenePose;
  readonly lens: SceneCameraLens;
};

export type SceneCameraLens = {
  readonly fov: number;
  readonly aspect: {
    readonly numerator: number;
    readonly denominator: number;
  };
};

export type ScenePerformanceSubject =
  | { readonly kind: "object"; readonly ref: string }
  | { readonly kind: "camera"; readonly ref: string };

export type ScenePerformanceItem = {
  readonly id: string;
  readonly name: string;
  readonly start: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
  readonly enabled: boolean;
  readonly using: ScenePackageSymbol;
  readonly parameters: CanonicalValue;
};

export type ScenePerformanceTrack = {
  readonly id: string;
  readonly name: string;
  readonly subject: ScenePerformanceSubject;
  readonly items: readonly ScenePerformanceItem[];
};

export type SceneShot = {
  readonly id: string;
  readonly name: string;
  readonly camera: string;
  readonly start: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
};

export type ScenePerformance = {
  readonly id: string;
  readonly name: string;
  readonly duration: ExactTemporalValue;
  readonly tracks: readonly ScenePerformanceTrack[];
  readonly shots: readonly SceneShot[];
};

/** Complete standard state produced by one resolved Scene behavior. */
export type SceneObjectState = {
  readonly kind: "object";
  readonly transform: SceneTransform;
};

export type SceneCameraState = {
  readonly kind: "camera";
  readonly pose: ScenePose;
  readonly lens: SceneCameraLens;
};

export type SceneSubjectState = SceneObjectState | SceneCameraState;

/** Persistent output-authoritative scene and local performance document. */
export type SceneProject = {
  readonly format: "hypit.scene@1";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly libraries: readonly SceneLibraryReference[];
  readonly environment: SceneEnvironment;
  readonly objects: readonly SceneObject[];
  readonly cameras: readonly SceneCamera[];
  readonly performances: readonly ScenePerformance[];
};

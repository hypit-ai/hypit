import type {
  LogicalOutputRef,
} from "@hypit/protocol";

export type BuildPublishedOutput = {
  readonly name: string;
  readonly ref: LogicalOutputRef;
};

export type BuildCatalogDescriptor = {
  readonly source: {
    readonly path: string;
  };
  readonly run?: {
    readonly path: string;
  };
  readonly publishedOutputs: readonly BuildPublishedOutput[];
};

export type BuildCatalogEntry = BuildCatalogDescriptor & {
  readonly build: string;
};

/** Host presentation index only. It is never Build truth. */
export type BuildCatalog = {
  record(build: string, descriptor: BuildCatalogDescriptor): Promise<BuildCatalogEntry>;
  read(build: string): Promise<BuildCatalogEntry | undefined>;
  /** Result manifests own finished presentation; Runtime Catalog covers active execution only. */
  remove?(build: string): Promise<void>;
};

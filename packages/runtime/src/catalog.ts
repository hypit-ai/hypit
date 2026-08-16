import type {
  LogicalOutputRef,
  RecordRef,
} from "@narratage/protocol";

export type BuildCatalogAlias = {
  readonly name: string;
  readonly ref: RecordRef | LogicalOutputRef;
};

export type BuildCatalogDescriptor = {
  readonly source: {
    readonly path: string;
  };
  readonly run?: {
    readonly path: string;
  };
  readonly aliases: readonly BuildCatalogAlias[];
};

export type BuildCatalogEntry = BuildCatalogDescriptor & {
  readonly build: string;
  readonly createdAt: number;
};

/** Host presentation index only. It is never Build truth. */
export type BuildCatalog = {
  record(build: string, descriptor: BuildCatalogDescriptor): Promise<BuildCatalogEntry>;
  read(build: string): Promise<BuildCatalogEntry | undefined>;
  list(): Promise<readonly BuildCatalogEntry[]>;
};

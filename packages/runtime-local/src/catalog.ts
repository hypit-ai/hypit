import type { PublicationIntent } from "@hypit/hypit/protocol";

export type BuildCatalogDescriptor = {
  readonly sourcePath: string;
  readonly invocationSourcePath?: string;
  readonly publication: PublicationIntent;
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

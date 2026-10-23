import type { PublicationPlan } from "@hypit/hypit/result";

export type BuildCatalogDescriptor = {
  readonly sourcePath: string;
  readonly runPath?: string;
  readonly publication: PublicationPlan;
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

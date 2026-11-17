import { assertNpmPackageName, assertProjectIdentity, assertProjectManifest } from "./manifest.js";
import type {
  HypitPackageCatalogOffering,
  HypitPackageContribution,
  HypitPackageModule,
  ProjectManifest,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function kind(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[a-z][a-z0-9.-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertPackageModule(value: unknown): asserts value is HypitPackageModule {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Hypit package module must be an object.");
  const module = value as Readonly<Record<string, unknown>>;
  const fields = Object.keys(module);
  assert(fields.length === 3 && fields.every((field) => field === "package" || field === "contributions"
    || field === "catalog"), "Hypit package module fields are invalid.");
  assertNpmPackageName(module.package, "Hypit package module package");
  assert(Array.isArray(module.contributions), `Hypit package ${module.package} contributions must be an array.`);
  assert(Array.isArray(module.catalog), `Hypit package ${module.package} catalog must be an array.`);
  module.contributions.forEach((entry, index) => {
    assert(entry !== null && typeof entry === "object" && !Array.isArray(entry),
      `Hypit package ${module.package} contribution ${index} must be an object.`);
    const contribution = entry as Readonly<Record<string, unknown>>;
    assert(Object.keys(contribution).length === 2 && Object.hasOwn(contribution, "kind")
      && Object.hasOwn(contribution, "value"), `Hypit package ${module.package} contribution ${index} fields are invalid.`);
    kind(contribution.kind, `Hypit package ${module.package} contribution ${index} kind`);
  });
  const offeringIds = new Set<string>();
  module.catalog.forEach((entry, index) => {
    assert(entry !== null && typeof entry === "object" && !Array.isArray(entry),
      `Hypit package ${module.package} catalog entry ${index} must be an object.`);
    const offering = entry as Readonly<Record<string, unknown>>;
    assert(Object.keys(offering).length === 4 && ["id", "kind", "title", "value"].every((field) =>
      Object.hasOwn(offering, field)), `Hypit package ${module.package} catalog entry ${index} fields are invalid.`);
    assertProjectIdentity(offering.id, `Hypit package ${module.package} catalog entry ${index} id`);
    kind(offering.kind, `Hypit package ${module.package} catalog entry ${index} kind`);
    assert(typeof offering.title === "string" && offering.title.trim().length > 0,
      `Hypit package ${module.package} catalog entry ${index} title must be non-empty text.`);
    assert(!offeringIds.has(offering.id), `Hypit package ${module.package} repeats catalog id ${offering.id}.`);
    offeringIds.add(offering.id);
  });
}

export function defineHypitPackage(value: HypitPackageModule): HypitPackageModule {
  assertPackageModule(value);
  return value;
}

export type ProjectPackageContributionResolution = HypitPackageContribution & {
  readonly package: string;
};

export type ProjectPackageCatalogResolution = HypitPackageCatalogOffering & {
  readonly package: string;
};

export class ProjectPackageEnvironment {
  readonly #modules = new Map<string, HypitPackageModule>();
  readonly #contributions: readonly ProjectPackageContributionResolution[];
  readonly #catalog: readonly ProjectPackageCatalogResolution[];

  constructor(manifest: ProjectManifest, modules: readonly HypitPackageModule[]) {
    assertProjectManifest(manifest);
    const selected = new Map(manifest.packages.map((selection) => [selection.name, selection]));
    for (const module of modules) {
      assertPackageModule(module);
      assert(selected.has(module.package), `Hypit package ${module.package} is not activated by the Project manifest.`);
      assert(!this.#modules.has(module.package), `Project Package Environment repeats ${module.package}.`);
      this.#modules.set(module.package, module);
    }
    for (const selection of manifest.packages) {
      assert(this.#modules.has(selection.name),
        `Project manifest requires installed package ${selection.name}, but its Hypit module is unavailable.`);
    }
    this.#contributions = manifest.packages.flatMap((selection) =>
      this.#modules.get(selection.name)!.contributions.map((entry) => ({
        package: selection.name,
        kind: entry.kind,
        value: entry.value,
      })));
    this.#catalog = manifest.packages.flatMap((selection) => {
      const module = this.#modules.get(selection.name)!;
      const offerings = new Map(module.catalog.map((entry) => [entry.id, entry]));
      return selection.catalog.map((id) => {
        const offering = offerings.get(id);
        assert(offering !== undefined,
          `Project manifest selects missing catalog offering ${selection.name}#${id}.`);
        return { package: selection.name, ...offering };
      });
    });
  }

  packages(): readonly string[] {
    return [...this.#modules.keys()];
  }

  module(name: string): HypitPackageModule | undefined {
    return this.#modules.get(name);
  }

  contributions(kindFilter?: string): readonly ProjectPackageContributionResolution[] {
    if (kindFilter !== undefined) kind(kindFilter, "Project package contribution kind");
    return this.#contributions.filter((entry) => kindFilter === undefined || entry.kind === kindFilter);
  }

  catalog(kindFilter?: string): readonly ProjectPackageCatalogResolution[] {
    if (kindFilter !== undefined) kind(kindFilter, "Project package catalog kind");
    return this.#catalog.filter((entry) => kindFilter === undefined || entry.kind === kindFilter);
  }

  offering(packageName: string, id: string): ProjectPackageCatalogResolution | undefined {
    return this.#catalog.find((entry) => entry.package === packageName && entry.id === id);
  }
}

export function createProjectPackageEnvironment(
  manifest: ProjectManifest,
  modules: readonly HypitPackageModule[],
): ProjectPackageEnvironment {
  return new ProjectPackageEnvironment(manifest, modules);
}

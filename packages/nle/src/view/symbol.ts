import { assertPackageSymbol, type PackageSymbol } from "../implementation.js";

export function packageSymbolKey(value: PackageSymbol): string {
  assertPackageSymbol(value, "NLE package symbol");
  return `${value.package}#${value.symbol}`;
}

export function assertContributionOwner(owner: string, symbols: readonly PackageSymbol[], label: string): void {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(owner)) {
    throw new Error(`${label} package must be an unversioned npm package name.`);
  }
  for (const symbol of symbols) {
    assertPackageSymbol(symbol, `${label} symbol`);
    if (symbol.package !== owner) {
      throw new Error(`${label} for ${packageSymbolKey(symbol)} is not owned by package ${owner}.`);
    }
  }
}

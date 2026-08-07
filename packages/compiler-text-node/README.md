# `@narratage/compiler-text-node`

Reference Node compiler assembly for the official `@narratage/text` authoring language.

The package selects the Text Frontend ABI, installs Text Surface Host facets from already trusted
package contributions, and combines them with the syntax-neutral `@narratage/compiler-node`. It does not
discover packages, grant Runtime authority or know any video component by name.

Every compiled source selects Text—or another registered Frontend—through its mandatory Source
Header. Use `@narratage/compiler-node` directly for another Frontend assembly. Use
`@narratage/package-loader-node` independently when a Runtime only needs locked deterministic compute
facets and no author syntax.

# `@svml/compiler-text-node`

Reference Node compiler assembly for the official `@svml/text` authoring language.

The package selects the Text Frontend ABI, installs Text Surface Host facets from already trusted
package contributions, and combines them with the syntax-neutral `@svml/compiler-node`. It does not
discover packages, grant Runtime authority or know any video component by name.

Every compiled source selects Text—or another registered Frontend—through its mandatory Source
Header. Use `@svml/compiler-node` directly for another Frontend assembly. Use
`@svml/package-loader-node` independently when a Runtime only needs locked deterministic compute
facets and no author syntax.

# `@hypit/compiler-markup-node`

Reference Node compiler assembly for the official `@hypit/markup` authoring language.

The package selects the Markup Frontend ABI, installs Markup Surface Host facets from already trusted
package contributions, and combines them with the syntax-neutral `@hypit/compiler-node`. It does not
discover packages, grant Runtime authority or know any video component by name.

Every compiled source selects Markup—or another registered Frontend—through its mandatory Source
Header. Use `@hypit/compiler-node` directly for another Frontend assembly. Use
`@hypit/package-loader-node` independently when a Runtime only needs locked deterministic compute
facets and no author syntax.

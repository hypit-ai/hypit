# `@hypit/picture-matte`

Official package-owned two-input Picture matte Operators.

For the new audiovisual backend, `PictureMatteOperatorSpec -> picture-operator` publishes an ordinary
typed `PictureOperator` with named `content` and `matte` ports plus the complete opaque HTML programme.
AVIR does not know matte channels, sibling order or renderer details.

A matte combines two already-formed Pictures. `content` is the Picture that remains visible;
`matte` supplies either alpha or luminance. The package does not inspect media, detect subjects,
move Tracks or choose sibling order. Each input is an ordinary closed Picture expression and can be
the result of a Source, nested Programme or earlier Operator.

`channel` is `alpha` or `luminance`; the SDR luminance path uses alpha-weighted BT.709 coefficients
over the staged sRGB Picture. `invert` is explicit. The two input names are part of the
effect contract and AVIR rejects missing, repeated or additional inputs. The matte Picture is
consumed by `apply` and is not painted as a peer. Both Pictures retain their own occurrence mappings
and internal behavior.

This is distinct from a component-local mask that owns both element trees internally. A matte relates
two independently formed Pictures through explicit graph edges; it has no Track adjacency rule. The
HTML programme evaluates its named inputs as request-private Picture surfaces. Those surfaces are not
Results, authored media or reusable metadata.

The package also contributes an `hypit.nle-package@1` matte resolver. A persistent NLE stores the direct
content/matte Item relation plus `{ channel, invert }`; the package owns conversion to this two-input Operator.

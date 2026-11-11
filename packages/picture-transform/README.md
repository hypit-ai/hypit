# @hypit/picture-transform

Package-owned spatial treatment for an NLE Picture Adjustment Item. It supplies constant or exact-time animated translation, scale, rotation and transform origin as an ordinary unary Picture Adjustment Component.

The NLE owns the Programme canvas and the Adjustment's exact range. This package transforms the already composed Picture below it; it does not introduce names, anchors, dependency lookup or a second timeline.

Animated parameters select package-owned `linear`, `ease-in`, `ease-out` or `ease-in-out` interpolation.
The AVIR evaluator and emitted HTML programme apply the same selection; NLE Core stores it as an opaque
Adjustment parameter.

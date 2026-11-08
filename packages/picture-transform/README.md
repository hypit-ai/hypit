# @hypit/picture-transform

Package-owned spatial treatment for an NLE Picture Item. It supplies constant or exact-time animated translation, scale, rotation and transform origin as an ordinary unary Picture Effect.

The NLE owns the Item's factual canvas rectangle. This package moves the already placed and clipped picture within that rectangle; it does not introduce names, anchors, dependency lookup or a second timeline.

Animated parameters select package-owned `linear`, `ease-in`, `ease-out` or `ease-in-out` interpolation.
The AVIR evaluator and emitted HTML programme apply the same selection; NLE Core stores it as an opaque
Effect parameter.

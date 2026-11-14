# @hypit/picture-frame

Package-owned frame treatment for a materialized NLE Picture Operator Application: visible or clipped overflow, rounded and local-path clipping, padding, borders and multiple shadows.

Coordinates in a path are Application-local pixels. The package is an ordinary unary Picture Operator and carries no track, anchor or timeline model of its own.

Its shadows are rectangular frame shadows implemented around the authored Item-local frame. They do not inspect the
input Picture's alpha silhouette. With `contain`, a frame whose aspect differs from its Source may therefore include
transparent unused space; authoring tools should show that content rectangle explicitly or create an aspect-matched
frame. Alpha-silhouette drop shadow is a separate Picture filtering behavior, not an implicit mode of this package.

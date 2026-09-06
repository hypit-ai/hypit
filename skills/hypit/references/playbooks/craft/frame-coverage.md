# Coverage at visual boundaries

At a boundary, ask what the viewer should see before, during and after it. An intentional return to
the speaker is an edit; an accidental one-frame exposure between inserts is a defect. Coverage is
about the intended picture, not just the absence of black pixels.

Several independent decisions can expose the layer below:

- adjacent semantic windows may leave the inter-word pause unclaimed;
- a source may finish before its Item's window;
- entry or exit opacity may reveal the underlying picture during a transition;
- a component may draw only during each item activation when its background should persist;
- a spatial frame or crop may leave an unintended part of the Canvas uncovered.

[B-roll craft](b-roll.md) explains the first two. Fix the responsible boundary, sampling choice,
transition or component schedule. A persistent MG board needs an outer visibility window as well as
item events. Multiple frames can intentionally tile the Canvas; coverage does not require one
full-frame clip or a universally lowest A-roll Track.

A still, a designed background or a moving shot can each be correct. Choose from the intended work
and observed reference. A fallback layer works when it is the designed background; an unintended
foreground gap belongs to the boundary, transition, source duration, or component schedule that
exposed it.

Use Studio and local frame-range rendering around suspected boundaries to inspect the actual
composition. Check the first and last visible frames of neighboring items, source exhaustion and
transition frames. Script and Recipes explain the cause, but their names alone cannot prove what
was drawn.

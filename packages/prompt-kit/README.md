# `@narratage/prompt-kit`

Optional author-time compiler from a declarative Prompt Kit Spec and one Invocation to an ordered,
inspectable Prompt Program. It is reusable beyond video, but is not part of the domain-neutral
Core.

It recognizes only four bounded block forms: fixed text, one parameter axis, a finite conditional
variant and a required/optional text slot. It has no network, Provider, model, video or Speaker
knowledge and cannot execute arbitrary expressions.

The self-described `@narratage/prompt-kit/svs@1` Frontend reads ordinary SVS syntax and exports one
authored `PromptKitSpec`. SVS does not execute a Kit. A Surface supplies the domain binding and
invokes this pure compiler while lowering author source; no Prompt Kit Producer, Need, queue task or
Provider call exists in the Run Graph.

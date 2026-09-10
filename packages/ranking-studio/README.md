# `@hypit/ranking-studio`

Hypit Studio Companion for the Ranking module's Column, Tier and Top Three surfaces.

The root lane represents the board; `attachments` expose reveal or activation
events on a detail lane. Both use Studio's ordinary item selection and overlap
behavior. Their time ranges remain the authored event ranges.

Ranking's renderer assigns `subjectId` to each item's rendered phases. The
Companion associates those phases with the item's `renderIds`, so clicking an
entering or settled icon selects the same detail entity. The board and preset
items without a detail event remain associated with the root. Studio measures
the visible parts at the current frame; the Companion does not duplicate motion
geometry or infer identities from rendered ID strings.

// packages/model/types/group.js — group element type descriptor (manifest metadata).
// composite: the shell has no appearance. Layout skips it (members are laid out
// individually from page.elements), renderer/writer have no shard for it, and the generic
// schema alone validates the shell (members validate themselves).

export const groupType = {
  id: "group",
  label: "组合",
  composite: true,
};

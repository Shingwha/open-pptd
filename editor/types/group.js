// ============================================================================
// types/group.js — group element type (editor side)
// ----------------------------------------------------------------------------
// Design decisions:
//   - "group = set of children": a group element holds only children (member id
//     list) plus its bounds; members stay in page.elements and render as usual.
//     The group itself has no appearance (render returns null; renderPage skips
//     such entries), so packages/renderer needs no change.
//   - Export: the writer has no group.toXml, so the group shell is skipped on
//     export and members export individually (no content is lost).
//   - Known limitation: packages/model/style-spec.js ELEMENT_TYPES omits group,
//     so registration logs one console.warn and `open-pptd check` reports an
//     unknown type for decks containing groups. Engine-side group support is
//     out of scope here.
//   - Transform: move/scale apply to children; whole-group rotation is
//     unsupported (keeps behaviour predictable).
// ============================================================================

import { registerType } from "../../packages/model/index.js";

registerType({
  type: "group",
  label: "组合",
  // No independent appearance: members render themselves (renderPage skips null)
  render: () => null,
  // No type-specific property groups (position/align/layer come from the common panel)
  props: () => [],
});

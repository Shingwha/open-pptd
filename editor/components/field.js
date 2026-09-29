// ============================================================================
// components/field.js — Field primitive (reuses the 5 kinds of interaction/fields.js)
// ----------------------------------------------------------------------------
// Architecture kept: field declarations (types/*.js props) → rendered by
// interaction/fields.js; this module only centralizes the "5 kinds" entry as a
// primitive-layer facade shared by components/* and the panels.
//   num / text / textarea / select / color / checks / button / hint
// Only the entry and tokens are unified; the field declaration protocol is
// unchanged.
// ============================================================================

export {
  renderGroup,
  fieldHandlers,
  themeSwatches,
} from "../interaction/fields.js";

export {
  field,
  cell,
  textInput,
  numInput,
  colorInput,
  colorField,
  selectInput,
  checkbox,
} from "../ui.js";

/** Group (the simplified form of a collapsible Section, see components/section.js). */
export { group } from "../ui.js";

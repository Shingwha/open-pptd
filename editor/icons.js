// ============================================================================
// icons.js — centralized inline SVG icons
// ----------------------------------------------------------------------------
// The single source for inline icons shared by the editor and the gallery:
//   - svgIcon(inner): stroked icon shell (shared by the type-registry menu icons; re-exported by ui.js)
//   - named icon constants: whole SVG snippets reused across files (GitHub badge / rotate handle / fullscreen)
//   - injectIcons(): at startup replaces the <span class="icon-slot" data-icon="…">
//     placeholders in the HTML with the real SVG (icons are maintained once, no inlining in HTML)
// The per-type menu icons of the type registry (types/*.js) stay declared next to
// their registration, wrapped by svgIcon.
// ============================================================================

/** Stroked icon shell (inherits currentColor). */
export function svgIcon(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/** GitHub badge (one copy shared by the editor and gallery topbar repo links). */
export const ICON_GITHUB =
  '<svg viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden="true">' +
  '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

/** Selection-box rotate handle icon (interaction/canvas.js). */
export const ICON_ROTATE =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round">' +
  '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.2L20 9.3M19.5 12a7.5 7.5 0 0 1-13 5.2L4 14.7" stroke="currentColor"/></svg>';

/** Fullscreen toggle icon (app/present.js show overlay). */
export const ICON_FULLSCREEN =
  '<svg viewBox="0 0 24 24"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** data-icon placeholder → icon constant map (HTML writes <span class="icon-slot" data-icon="github">). */
const SLOTS = { github: ICON_GITHUB };

/** Replace every .icon-slot[data-icon] placeholder under root with the matching SVG (called once at startup). */
export function injectIcons(root = document) {
  for (const slot of root.querySelectorAll(".icon-slot[data-icon]")) {
    const svg = SLOTS[slot.dataset.icon];
    if (svg) slot.innerHTML = svg;
  }
}

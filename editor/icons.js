// ============================================================================
// icons.js — 内联 SVG 图标集中管理
// ----------------------------------------------------------------------------
// 编辑器/画廊共用的内联图标单一来源：
//   - svgIcon(inner)：描边图标外壳（类型注册表菜单图标共用，ui.js 再导出）
//   - 命名图标常量：跨文件复用的整段 SVG（GitHub 徽标 / 旋转手柄 / 全屏）
//   - injectIcons()：启动时把 HTML 中的 <span class="icon-slot" data-icon="…">
//     占位替换为实际 SVG（图标只维护一份，HTML 不再内联重复）
// 类型注册表各自的菜单图标（types/*.js）仍就近声明在注册处，经 svgIcon 包装。
// ============================================================================

/** 描边图标外壳（继承 currentColor）。 */
export function svgIcon(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/** GitHub 徽标（编辑器与画廊顶栏的仓库外链按钮共用一份）。 */
export const ICON_GITHUB =
  '<svg viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden="true">' +
  '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

/** 选中框旋转手柄图标（interaction/canvas.js）。 */
export const ICON_ROTATE =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round">' +
  '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.2L20 9.3M19.5 12a7.5 7.5 0 0 1-13 5.2L4 14.7" stroke="currentColor"/></svg>';

/** 全屏切换图标（app/present.js 放映层）。 */
export const ICON_FULLSCREEN =
  '<svg viewBox="0 0 24 24"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** data-icon 占位 → 图标常量映射（HTML 里写 <span class="icon-slot" data-icon="github">）。 */
const SLOTS = { github: ICON_GITHUB };

/** 把 root 内所有 .icon-slot[data-icon] 占位替换为对应 SVG（启动时调用一次）。 */
export function injectIcons(root = document) {
  for (const slot of root.querySelectorAll(".icon-slot[data-icon]")) {
    const svg = SLOTS[slot.dataset.icon];
    if (svg) slot.innerHTML = svg;
  }
}

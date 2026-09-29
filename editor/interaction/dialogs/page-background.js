// ============================================================================
// interaction/dialogs/page-background.js — 页面背景对话框
// ----------------------------------------------------------------------------
// 页面级入口（右键菜单「页面背景…」/ 缩略条右键）用；与属性面板「页面设置」
// 的字段语义一致（无 / 纯色 / 渐变 + 起始色/结束色/角度），只是换一个入口。
// 事务：首次真实提交才 beginChange（快照）；面板关闭时 endChange 全量对齐。
// ============================================================================

import { showDialog } from "./base.js";
import * as ui from "../../ui.js";
import { themeSwatches } from "../fields.js";
import { resolveColor } from "../../../packages/model/index.js";

/**
 * 打开页面背景对话框。
 * @param {object} opts
 *  - pg: 目标页面对象（默认当前页）
 *  - theme: 主题（颜色解析/色板）
 *  - beginChange(): 变更前快照
 *  - endChange(): 变更结束（全量渲染）
 *  - refreshPreview(): 可选，轻量刷新画布
 */
export function openPageBackgroundDialog({ pg, theme, beginChange, endChange, refreshPreview }) {
  if (!pg) return null;
  let tx = false;
  // 首次真实提交才快照（点开不改不标脏）；每次提交后全量渲染（背景是整页效果）
  const commit = (fn) => {
    if (!tx) {
      tx = true;
      beginChange();
    }
    fn();
    if (refreshPreview) refreshPreview();
    endChange();
  };

  const body = document.createElement("div");
  body.className = "pg-bg-dialog";

  const bgType = pg.background?.type || "none";
  body.appendChild(
    ui.field(
      "背景",
      ui.selectInput([["none", "无"], ["solid", "纯色"], ["gradient", "渐变"]], bgType, (v) =>
        commit(() => {
          if (v === "none") delete pg.background;
          else if (v === "solid") pg.background = { type: "solid", color: pg.background?.color || "$bg" };
          else if (v === "gradient") {
            pg.background = {
              type: "gradient",
              gradientType: "linear",
              angle: 90,
              stops: [
                { position: 0, color: pg.background?.color || "$primary" },
                { position: 1, color: "#ffffff" },
              ],
            };
          }
          renderColors();
        })
      )
    )
  );

  const colors = document.createElement("div");
  colors.className = "pg-bg-colors";
  body.appendChild(colors);

  /** 颜色/角度区（背景类型变更后重建）。 */
  function renderColors() {
    colors.innerHTML = "";
    const swatches = themeSwatches(theme);
    const resolve = (v) => resolveColor(theme, v);
    if (pg.background?.type === "solid") {
      colors.appendChild(
        ui.field("颜色", ui.colorField(pg.background.color, (v) => commit(() => { pg.background.color = v; }), { resolve, swatches }))
      );
    } else if (pg.background?.type === "gradient") {
      colors.appendChild(
        ui.field("起始色", ui.colorField(pg.background.stops?.[0]?.color, (v) => commit(() => { pg.background.stops[0].color = v; }), { resolve, swatches }))
      );
      colors.appendChild(
        ui.field("结束色", ui.colorField(pg.background.stops?.[1]?.color, (v) => commit(() => { pg.background.stops[1].color = v; }), { resolve, swatches }))
      );
      colors.appendChild(
        ui.field("角度", ui.numInput(pg.background.angle ?? 0, (v) => commit(() => { pg.background.angle = v; }), { min: 0, max: 360, step: 15 }))
      );
    }
  }
  renderColors();

  const { close } = showDialog("页面背景", body, {
    doneText: "完成",
    onDone: () => close(),
  });
  return { close };
}

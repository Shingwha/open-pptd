// ============================================================================
// app/shot.js — 无头截图模式（?shot=1，open-pptd render 使用）
// ----------------------------------------------------------------------------
// 跳过全部编辑器 UI，把每页直接渲染进一个 960×540 的裸容器——与编辑器预览
// 同一条渲染管线（renderer/page.js + 同一份字体文件 + 同一 imageMap）。
// 对外契约（供 lib/pptd-render.js 的 CDP 驱动）：
//   window.__pptdShot = { count, goto(index) }
//   document.title === "PPTD_READY"  = 当前页渲染完成、画面稳定，可截图
//   document.title === "PPTD_ERROR"  = 初始化失败
// 正常打开编辑器（无 ?shot=1 参数）时本模块不会被加载。
// ============================================================================

import { createEditorState } from "./state.js";
import { createIo } from "./project/io.js";
import { renderPage } from "../renderer/page.js";
import { PAGE_WIDTH, PAGE_HEIGHT } from "../core/model.js";

export const READY_TITLE = "PPTD_READY";

export async function initShot(deckUrl) {
  if (!deckUrl) throw new Error("shot 模式需要 ?deck= 参数");
  document.documentElement.classList.add("shot-mode");

  // 最小装配：state + io（仅用加载/字体/图片管线；view 用空桩，UI 全部隐藏）
  const { state } = createEditorState();
  const io = createIo({ state, view: { render() {} } });

  const root = document.createElement("div");
  root.id = "shot-root";
  document.body.appendChild(root);
  root.style.cssText =
    `position:fixed;left:0;top:0;width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;` +
    "overflow:hidden;background:#fff;";

  /** 渲染一页并等待画面稳定：字体就绪 + 图片解码 + 双 rAF（图表 animation:false 同步绘制）。 */
  async function render(index) {
    const page = state.deck.pages[index];
    renderPage(root, page, state.deck, state.theme, { imageMap: state.imageMap });
    const imgs = [...root.querySelectorAll("img")];
    await Promise.all([
      document.fonts.ready,
      ...imgs.map((img) =>
        img.complete && img.naturalWidth > 0 ? Promise.resolve() : img.decode().catch(() => {})
      ),
    ]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  async function goto(index) {
    const i = Math.max(0, Math.min(state.deck.pages.length - 1, index));
    await render(i);
    document.title = READY_TITLE;
    return i;
  }

  await io.loadDeck(deckUrl, { silent: true });
  window.__pptdShot = { count: state.deck.pages.length, goto };
  await goto(0); // 首页就绪后 CDP 才开始逐页驱动
}
